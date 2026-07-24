import type { GridPoint, GridLocalItem } from '@/lib/db';

/** Groups a competitor listing by domain (preferred) or name, so the same business is counted once. */
export function competitorKey(item: GridLocalItem): string {
  const domain = item.domain?.trim().toLowerCase().replace(/^www\./, '');
  return domain || item.title.trim().toLowerCase();
}

export interface CompetitorSummary {
  key: string;
  name: string;
  domain?: string;
  cid?: string;
  appearances: number;
  totalPoints: number;
  avgRank: number;
  bestRank: number;
  top3Count: number;
  avgRating: number | null;
  /** Same weighted-visibility formula as the target's ATO score, so the two are directly comparable. */
  visibilityScore: number;
}

/** Ranks every non-target business seen across the grid by how often and how highly it shows up. */
export function computeCompetitors(results: GridPoint[]): CompetitorSummary[] {
  const totalPoints = results.length;
  const byKey = new Map<string, {
    name: string; domain?: string; cid?: string; ranks: number[]; ratings: number[];
  }>();

  for (const point of results) {
    for (const item of point.items ?? []) {
      if (item.is_target) continue;
      const key = competitorKey(item);
      if (!key) continue;
      let entry = byKey.get(key);
      if (!entry) {
        entry = { name: item.title, domain: item.domain, cid: item.cid, ranks: [], ratings: [] };
        byKey.set(key, entry);
      }
      entry.ranks.push(item.rank_group);
      if (item.rating_value != null) entry.ratings.push(item.rating_value);
      if (!entry.cid && item.cid) entry.cid = item.cid;
    }
  }

  return Array.from(byKey.entries())
    .map(([key, e]) => ({
      key,
      name: e.name,
      domain: e.domain,
      cid: e.cid,
      appearances: e.ranks.length,
      totalPoints,
      avgRank: Math.round((e.ranks.reduce((s, r) => s + r, 0) / e.ranks.length) * 10) / 10,
      bestRank: Math.min(...e.ranks),
      top3Count: e.ranks.filter((r) => r <= 3).length,
      avgRating: e.ratings.length
        ? Math.round((e.ratings.reduce((s, r) => s + r, 0) / e.ratings.length) * 10) / 10
        : null,
      visibilityScore: totalPoints > 0
        ? Math.round((e.ranks.reduce((s, r) => s + (21 - Math.min(r, 21)), 0) / (totalPoints * 20)) * 100)
        : 0,
    }))
    .sort((a, b) => b.appearances - a.appearances || a.avgRank - b.avgRank);
}

export interface RingStat {
  ring: number;
  distanceKm: number;
  pointCount: number;
  foundCount: number;
  avgRank: number | null;
  top3Pct: number;
}

/** Buckets grid points into concentric rings around the center and summarizes rank per ring — reveals how far the target's visibility actually reaches. */
export function computeRingStats(results: GridPoint[], gridSize: number, spacingKm: number): RingStat[] {
  const half = Math.floor(gridSize / 2);
  const byRing = new Map<number, GridPoint[]>();

  for (const p of results) {
    const ring = Math.max(Math.abs(p.row - half), Math.abs(p.col - half));
    if (!byRing.has(ring)) byRing.set(ring, []);
    byRing.get(ring)!.push(p);
  }

  return Array.from(byRing.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ring, pts]) => {
      const found = pts.filter((p) => p.rank !== null);
      return {
        ring,
        distanceKm: Math.round(ring * spacingKm * 10) / 10,
        pointCount: pts.length,
        foundCount: found.length,
        avgRank: found.length > 0
          ? Math.round((found.reduce((s, p) => s + p.rank!, 0) / found.length) * 10) / 10
          : null,
        top3Pct: pts.length > 0
          ? Math.round((pts.filter((p) => p.rank !== null && p.rank! <= 3).length / pts.length) * 100)
          : 0,
      };
    });
}
