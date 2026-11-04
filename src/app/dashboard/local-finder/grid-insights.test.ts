import { describe, expect, it } from 'vitest';
import type { GridLocalItem, GridPoint } from '@/lib/db';
import { competitorKey, computeCompetitors, computeGridSummary } from './grid-insights';

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

describe('computeGridSummary', () => {
  const ranked = (rank: number | null): GridPoint => ({ row: 0, col: 0, rank });

  it('derives Coverage, ARP and SoLV over the whole grid', () => {
    const summary = computeGridSummary([ranked(1), ranked(2), ranked(5), ranked(null)]);
    expect(summary.coverage).toBe(75);
    expect(summary.arp).toBe(2.7);
    expect(summary.solv).toBe(50);
  });

  it('reports no ARP, rather than 0, when the target is never found', () => {
    const summary = computeGridSummary([ranked(null), ranked(null)]);
    expect(summary.arp).toBeNull();
    expect(summary.coverage).toBe(0);
    expect(summary.solv).toBe(0);
  });
});

describe('competitor metrics', () => {
  it('uses the same Coverage, ARP and SoLV definitions as the target', () => {
    const results = [point(0, [east]), point(1, [{ ...east, rank_group: 5 }]), point(2, []), point(3, [])];
    const [c] = computeCompetitors(results);
    expect(c.coverage).toBe(50);
    expect(c.arp).toBe(3);
    expect(c.solv).toBe(25);
  });
});

describe('competitor ranking', () => {
  it('puts the business that holds the top 3 ahead of one that is merely everywhere', () => {
    const everywhere: GridLocalItem = { rank_group: 9, title: 'Everywhere', cid: '1', is_target: false };
    const packLeader: GridLocalItem = { rank_group: 2, title: 'Pack leader', cid: '2', is_target: false };
    const results = [
      point(0, [packLeader, everywhere]), point(1, [packLeader, everywhere]),
      point(2, [everywhere]), point(3, [everywhere]),
    ];
    expect(computeCompetitors(results).map((c) => c.name)).toEqual(['Pack leader', 'Everywhere']);
  });

  it('breaks top 3 ties on presence', () => {
    const a: GridLocalItem = { rank_group: 1, title: 'A', cid: 'a', is_target: false };
    const b: GridLocalItem = { rank_group: 1, title: 'B', cid: 'b', is_target: false };
    const results = [point(0, [a]), point(1, [b]), point(2, [{ ...b, rank_group: 8 }])];
    expect(computeCompetitors(results).map((c) => c.name)).toEqual(['B', 'A']);
  });
});

describe('target rating', () => {
  it('averages the target rating once per point', () => {
    const you = (rating?: number): GridLocalItem => ({ rank_group: 1, title: 'You', is_target: true, rating_value: rating });
    const summary = computeGridSummary([
      { row: 0, col: 0, rank: 1, items: [you(4.6), you(4.6)] },
      { row: 0, col: 1, rank: 1, items: [you(4.8)] },
      { row: 0, col: 2, rank: null, items: [] },
    ]);
    expect(summary.avgRating).toBe(4.7);
    expect(computeGridSummary([{ row: 0, col: 0, rank: null, items: [] }]).avgRating).toBeNull();
  });
});
