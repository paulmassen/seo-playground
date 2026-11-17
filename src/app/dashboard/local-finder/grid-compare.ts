import type { GridLocalItem, GridPoint } from '@/lib/db';
import { competitorKey, computeCompetitors, computeGridSummary, type GridSummary } from './grid-insights';

/**
 * Point-by-point comparison of two snapshots of the same monitor. Snapshots of one series share
 * their grid (size, spacing, shape, skipped points and depth are part of the series identity),
 * so points are matched by row and column.
 */

export type PointChange = 'gained' | 'improved' | 'unchanged' | 'declined' | 'lost' | 'absent';

export interface BusinessRef {
  key: string;
  name: string;
}

export interface PointComparison {
  row: number;
  col: number;
  lat?: number;
  lng?: number;
  before: number | null;
  after: number | null;
  change: PointChange;
  /** Rank places gained (positive) or lost (negative); null when the target is missing on either side. */
  delta: number | null;
  /** Competitors in the after local pack (top 3) that were not in it before. */
  enteredPack: BusinessRef[];
  /** Competitors in the before local pack that are no longer in it. */
  leftPack: BusinessRef[];
  beforeItems: GridLocalItem[];
  afterItems: GridLocalItem[];
}

export interface CompetitorMove {
  key: string;
  name: string;
  solvBefore: number;
  solvAfter: number;
  coverageBefore: number;
  coverageAfter: number;
  /** Change in top 3 share, in points. */
  solvDelta: number;
  /** Points where the target dropped or left the pack and this business entered it. */
  tookFromYou: number;
}

export interface GridComparison {
  points: PointComparison[];
  counts: Record<PointChange, number>;
  /** Points where the target was in the top 3 before and is not anymore. */
  packLost: number;
  /** Points where the target is in the top 3 now and was not before. */
  packGained: number;
  before: GridSummary;
  after: GridSummary;
  /** Competitors whose top 3 share changed, biggest movers first. */
  movers: CompetitorMove[];
}

const PACK = 3;

function packMembers(items: GridLocalItem[] | undefined): Map<string, string> {
  const members = new Map<string, string>();
  for (const item of items ?? []) {
    if (item.is_target || item.rank_group > PACK) continue;
    const key = competitorKey(item);
    if (key && !members.has(key)) members.set(key, item.title);
  }
  return members;
}

export function classifyChange(before: number | null, after: number | null): PointChange {
  if (before === null && after === null) return 'absent';
  if (before === null) return 'gained';
  if (after === null) return 'lost';
  if (after < before) return 'improved';
  if (after > before) return 'declined';
  return 'unchanged';
}

export function compareGridSnapshots(beforeResults: GridPoint[], afterResults: GridPoint[]): GridComparison {
  const beforeByPoint = new Map(beforeResults.map((point) => [`${point.row}:${point.col}`, point]));
  const counts: Record<PointChange, number> = { gained: 0, improved: 0, unchanged: 0, declined: 0, lost: 0, absent: 0 };
  const tookFromYou = new Map<string, number>();
  let packLost = 0;
  let packGained = 0;

  const points = afterResults.map((afterPoint): PointComparison => {
    const beforePoint = beforeByPoint.get(`${afterPoint.row}:${afterPoint.col}`);
    const before = beforePoint?.rank ?? null;
    const after = afterPoint.rank;
    const change = classifyChange(before, after);
    counts[change] += 1;

    const beforePack = packMembers(beforePoint?.items);
    const afterPack = packMembers(afterPoint.items);
    const enteredPack = [...afterPack].filter(([key]) => !beforePack.has(key)).map(([key, name]) => ({ key, name }));
    const leftPack = [...beforePack].filter(([key]) => !afterPack.has(key)).map(([key, name]) => ({ key, name }));

    const wasInPack = before !== null && before <= PACK;
    const isInPack = after !== null && after <= PACK;
    if (wasInPack && !isInPack) packLost += 1;
    if (!wasInPack && isInPack) packGained += 1;
    // Whoever entered the pack where the target slipped is the business that took the spot.
    if (change === 'declined' || change === 'lost') {
      for (const business of enteredPack) tookFromYou.set(business.key, (tookFromYou.get(business.key) ?? 0) + 1);
    }

    return {
      row: afterPoint.row,
      col: afterPoint.col,
      lat: afterPoint.lat ?? beforePoint?.lat,
      lng: afterPoint.lng ?? beforePoint?.lng,
      before,
      after,
      change,
      delta: before !== null && after !== null ? before - after : null,
      enteredPack,
      leftPack,
      beforeItems: beforePoint?.items ?? [],
      afterItems: afterPoint.items ?? [],
    };
  });

  const competitorsBefore = new Map(computeCompetitors(beforeResults).map((c) => [c.key, c]));
  const competitorsAfter = new Map(computeCompetitors(afterResults).map((c) => [c.key, c]));
  const keys = new Set([...competitorsBefore.keys(), ...competitorsAfter.keys()]);
  const movers = [...keys].map((key): CompetitorMove => {
    const b = competitorsBefore.get(key);
    const a = competitorsAfter.get(key);
    const solvBefore = b?.solv ?? 0;
    const solvAfter = a?.solv ?? 0;
    return {
      key,
      name: a?.name ?? b?.name ?? key,
      solvBefore,
      solvAfter,
      coverageBefore: b?.coverage ?? 0,
      coverageAfter: a?.coverage ?? 0,
      solvDelta: solvAfter - solvBefore,
      tookFromYou: tookFromYou.get(key) ?? 0,
    };
  })
    .filter((move) => move.solvDelta !== 0 || move.tookFromYou > 0)
    .sort((x, y) => y.tookFromYou - x.tookFromYou || Math.abs(y.solvDelta) - Math.abs(x.solvDelta) || y.solvAfter - x.solvAfter);

  return {
    points,
    counts,
    packLost,
    packGained,
    before: computeGridSummary(beforeResults),
    after: computeGridSummary(afterResults),
    movers,
  };
}

/** Pin label on the change map: "+3", "−2", "new", "lost", "=" or "—" (absent on both). */
export function changeLabel(point: Pick<PointComparison, 'change' | 'delta'>): string {
  switch (point.change) {
    case 'gained': return 'new';
    case 'lost': return 'lost';
    case 'absent': return '—';
    case 'unchanged': return '=';
    default: return point.delta! > 0 ? `+${point.delta}` : `−${Math.abs(point.delta!)}`;
  }
}

export const CHANGE_STYLES: Record<PointChange, { label: string; fill: string; ink: string; onWhite: string }> = {
  gained: { label: 'Now found', fill: '#047857', ink: '#ffffff', onWhite: '#065f46' },
  improved: { label: 'Moved up', fill: '#4ade80', ink: '#052e16', onWhite: '#166534' },
  unchanged: { label: 'No change', fill: '#e2e8f0', ink: '#334155', onWhite: '#475569' },
  declined: { label: 'Moved down', fill: '#f87171', ink: '#450a0a', onWhite: '#b91c1c' },
  lost: { label: 'No longer found', fill: '#b91c1c', ink: '#ffffff', onWhite: '#991b1b' },
  absent: { label: 'Not found in either', fill: '#94a3b8', ink: '#0f172a', onWhite: '#475569' },
};
