import { describe, expect, it } from 'vitest';
import type { GridLocalItem, GridPoint } from '@/lib/db';
import { changeLabel, classifyChange, compareGridSnapshots } from './grid-compare';

const me = (rank: number): GridLocalItem => ({ rank_group: rank, title: 'Me', cid: '1', is_target: true });
const rival = (rank: number, cid = '2', title = 'Rival'): GridLocalItem => ({ rank_group: rank, title, cid, is_target: false });

const point = (row: number, col: number, rank: number | null, items: GridLocalItem[]): GridPoint => ({ row, col, rank, items, lat: row, lng: col });

describe('classifyChange', () => {
  it('reads lower ranks as improvements and missing ranks as gained or lost', () => {
    expect(classifyChange(5, 2)).toBe('improved');
    expect(classifyChange(2, 5)).toBe('declined');
    expect(classifyChange(3, 3)).toBe('unchanged');
    expect(classifyChange(null, 4)).toBe('gained');
    expect(classifyChange(4, null)).toBe('lost');
    expect(classifyChange(null, null)).toBe('absent');
  });
});

describe('compareGridSnapshots', () => {
  const before = [
    point(0, 0, 1, [me(1), rival(4)]),
    point(0, 1, 2, [rival(1), me(2)]),
    point(1, 0, 6, [rival(1), me(6)]),
    point(1, 1, null, [rival(2)]),
  ];
  const after = [
    point(0, 0, 1, [me(1), rival(2)]),
    point(0, 1, 5, [rival(1, '3', 'Newcomer'), rival(2), me(5)]),
    point(1, 0, 3, [rival(1), me(3)]),
    point(1, 1, null, [rival(1)]),
  ];

  it('matches points by row and column and counts each change', () => {
    const result = compareGridSnapshots(before, after);
    expect(result.counts).toEqual({ gained: 0, improved: 1, unchanged: 1, declined: 1, lost: 0, absent: 1 });
    expect(result.points.find((p) => p.row === 0 && p.col === 1)).toMatchObject({ before: 2, after: 5, delta: -3, change: 'declined' });
    expect(result.packLost).toBe(1);
    expect(result.packGained).toBe(1);
  });

  it('credits the businesses that entered the pack where the target slipped', () => {
    const result = compareGridSnapshots(before, after);
    const declined = result.points.find((p) => p.change === 'declined')!;
    expect(declined.enteredPack.map((b) => b.name)).toEqual(['Newcomer']);
    const newcomer = result.movers.find((m) => m.name === 'Newcomer')!;
    expect(newcomer.tookFromYou).toBe(1);
    expect(newcomer.solvBefore).toBe(0);
    expect(newcomer.solvAfter).toBe(25);
    expect(result.movers[0].name).toBe('Newcomer');
  });

  it('reports metric summaries for both sides', () => {
    const result = compareGridSnapshots(before, after);
    expect(result.before.top3Count).toBe(2);
    expect(result.after.top3Count).toBe(2);
    expect(result.before.coverage).toBe(75);
  });

  it('labels pins with the signed rank change', () => {
    expect(changeLabel({ change: 'improved', delta: 3 })).toBe('+3');
    expect(changeLabel({ change: 'declined', delta: -2 })).toBe('−2');
    expect(changeLabel({ change: 'gained', delta: null })).toBe('new');
    expect(changeLabel({ change: 'unchanged', delta: 0 })).toBe('=');
  });
});
