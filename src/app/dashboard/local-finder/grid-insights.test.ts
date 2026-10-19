import { describe, expect, it } from 'vitest';
import type { GridLocalItem, GridPoint } from '@/lib/db';
import { competitorKey, computeCompetitors } from './grid-insights';

const west: GridLocalItem = { rank_group: 2, title: 'Bond Vet - Upper West Side', domain: 'bondvet.com', url: 'https://bondvet.com/c/upper-west-side-animal-hospital', cid: '111', is_target: false };
const east: GridLocalItem = { rank_group: 1, title: 'Bond Vet - Upper East Side', domain: 'bondvet.com', url: 'https://bondvet.com/c/east-86th-street-animal-hospital', cid: '222', is_target: false };

const point = (row: number, items: GridLocalItem[]): GridPoint => ({ row, col: 0, rank: null, items });

describe('competitorKey', () => {
  it('distinguishes listings that share a domain', () => {
    expect(competitorKey(west)).not.toBe(competitorKey(east));
  });

  it('falls back to the lowercased title without a cid', () => {
    expect(competitorKey({ ...west, cid: undefined })).toBe('bond vet - upper west side');
  });
});

describe('computeCompetitors', () => {
  it('keeps multiple GBP locations of one domain as separate competitors', () => {
    const results = [point(0, [east]), point(1, [east]), point(2, [{ ...west, rank_group: 3 }, { ...east, rank_group: 1 }])];
    const competitors = computeCompetitors(results);
    const w = competitors.find((c) => c.cid === '111')!;
    const e = competitors.find((c) => c.cid === '222')!;
    expect(competitors).toHaveLength(2);
    expect(w.appearances).toBe(1);
    expect(e.appearances).toBe(3);
  });

  it('never counts more appearances than grid points', () => {
    const dup = [{ ...east, rank_group: 4 }, east];
    const [c] = computeCompetitors([point(0, dup), point(1, dup)]);
    expect(c.appearances).toBe(2);
    expect(c.visibilityScore).toBeLessThanOrEqual(100);
  });
});
