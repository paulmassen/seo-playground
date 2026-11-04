import type { GridPoint, GridLocalItem } from '@/lib/db';
import type { GridShape } from '@/lib/grid-layout';

export interface GridSummary {
  totalPoints: number;
  foundCount: number;
  avgRank: number | null;
  top3Count: number;
  top10Count: number;
  /** Weighted visibility score (0-100): 21 minus rank (capped at 21, "not found" scores 0), averaged across the grid. */
  ato: number;
  /** Coverage: % of all points where the target is in the results at all. */
  coverage: number;
  /** Average Rank Position: mean rank over the points where the target was found; null when never found. Same value as avgRank. */
  arp: number | null;
  /** Share of Local Voice: % of all points (found or not) where the target is in the top 3. */
  solv: number;
  /** Average Google rating of the target listing where it was found; null when none was returned. */
  avgRating: number | null;
}

function percent(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

/** Same stats shown in the results view (ATO score, Coverage, ARP, SoLV) — shared so history previews stay consistent. */
export function computeGridSummary(results: GridPoint[]): GridSummary {
  const totalPoints = results.length;
  const ranked = results.filter((p) => p.rank !== null);
  const top3Count = results.filter((p) => p.rank !== null && p.rank <= 3).length;
  const top10Count = results.filter((p) => p.rank !== null && p.rank <= 10).length;
  const avgRank = ranked.length > 0
    ? Math.round((ranked.reduce((s, p) => s + p.rank!, 0) / ranked.length) * 10) / 10
    : null;
  const ato = totalPoints > 0
    ? Math.round((results.reduce((s, p) => s + (21 - Math.min(p.rank ?? 21, 21)), 0) / (totalPoints * 20)) * 100)
    : 0;
  // One rating per point at most: a point can list the target twice, and that must not weigh double.
  const ratings = results.flatMap((point) => {
    const rating = (point.items ?? []).find((item) => item.is_target && item.rating_value != null)?.rating_value;
    return rating != null ? [rating] : [];
  });
  const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : null;
  return {
    totalPoints, foundCount: ranked.length, avgRank, top3Count, top10Count, ato,
    coverage: percent(ranked.length, totalPoints), arp: avgRank, solv: percent(top3Count, totalPoints), avgRating,
  };
}

/**
 * Identifies a competitor listing by its Google CID, falling back to the name for older snapshots without one.
 * Never the domain: a business with several GBP locations shares one website, and those listings are distinct competitors.
 */
export function competitorKey(item: GridLocalItem): string {
  const cid = item.cid?.trim();
  return cid ? `cid:${cid}` : item.title.trim().toLowerCase();
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
  /** Same Coverage / ARP / SoLV definitions as the target's, so every row of the table compares like for like. */
  coverage: number;
  arp: number;
  solv: number;
}

/**
 * Every non-target business seen across the grid, strongest first: by top 3 share (SoLV), since the
 * local pack is where calls and visits come from, then by presence, then by average rank.
 */
export function computeCompetitors(results: GridPoint[]): CompetitorSummary[] {
  const totalPoints = results.length;
  const byKey = new Map<string, {
    name: string; domain?: string; cid?: string; ranks: number[]; ratings: number[];
  }>();

  for (const point of results) {
    const seenAtPoint = new Set<string>();
    for (const item of point.items ?? []) {
      if (item.is_target) continue;
      const key = competitorKey(item);
      // A listing counts once per grid point, so presence can never exceed 100%.
      if (!key || seenAtPoint.has(key)) continue;
      seenAtPoint.add(key);
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
    .map(([key, e]) => {
      const avgRank = Math.round((e.ranks.reduce((s, r) => s + r, 0) / e.ranks.length) * 10) / 10;
      const top3Count = e.ranks.filter((r) => r <= 3).length;
      return {
        key,
        name: e.name,
        domain: e.domain,
        cid: e.cid,
        appearances: e.ranks.length,
        totalPoints,
        avgRank,
        bestRank: Math.min(...e.ranks),
        top3Count,
        coverage: percent(e.ranks.length, totalPoints),
        arp: avgRank,
        solv: percent(top3Count, totalPoints),
        avgRating: e.ratings.length
          ? Math.round((e.ratings.reduce((s, r) => s + r, 0) / e.ratings.length) * 10) / 10
          : null,
        visibilityScore: totalPoints > 0
          ? Math.round((e.ranks.reduce((s, r) => s + (21 - Math.min(r, 21)), 0) / (totalPoints * 20)) * 100)
          : 0,
      };
    })
    .sort((a, b) => b.top3Count - a.top3Count || b.appearances - a.appearances || a.avgRank - b.avgRank);
}

export interface RingStat {
  ring: number;
  distanceKm: number;
  pointCount: number;
  foundCount: number;
  avgRank: number | null;
  top3Pct: number;
}

/**
 * Buckets grid points into concentric rings around the center and summarizes rank per ring — reveals how far the target's visibility actually reaches.
 * Square grids use square rings (their outline); diamonds and circles use round distance, which their outline approximates.
 */
export function computeRingStats(results: GridPoint[], gridSize: number, spacingKm: number, shape: GridShape = 'square'): RingStat[] {
  const half = Math.floor(gridSize / 2);
  const byRing = new Map<number, GridPoint[]>();

  for (const p of results) {
    const dr = Math.abs(p.row - half);
    const dc = Math.abs(p.col - half);
    const ring = shape === 'square' ? Math.max(dr, dc) : Math.round(Math.hypot(dr, dc));
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
