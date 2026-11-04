import { describe, expect, it } from 'vitest';
import { organicLocalPack } from './grid-local-pack';

const item = (rank_group: number, title: string, is_paid?: boolean) => ({ type: 'local_pack', rank_group, title, is_paid });

describe('organicLocalPack', () => {
  it('drops a sponsored listing and renumbers the organic ones without a gap', () => {
    const result = organicLocalPack([item(1, 'Ad', true), item(2, 'First organic'), item(3, 'Second organic')]);
    expect(result.map((i) => [i.rank_group, i.title])).toEqual([[1, 'First organic'], [2, 'Second organic']]);
  });

  it('keeps the organic listing of a business that also bought an ad', () => {
    const result = organicLocalPack([item(1, 'Acme', true), item(2, 'Other'), item(3, 'Acme')]);
    expect(result.map((i) => [i.rank_group, i.title])).toEqual([[1, 'Other'], [2, 'Acme']]);
  });

  it('ignores non local-pack elements and sorts by rank', () => {
    const result = organicLocalPack([item(2, 'B'), { type: 'map', rank_group: 1, title: 'Map' }, item(1, 'A')]);
    expect(result.map((i) => i.title)).toEqual(['A', 'B']);
  });

  it('leaves a result without ads unchanged', () => {
    expect(organicLocalPack([item(1, 'A', false), item(2, 'B')]).map((i) => i.rank_group)).toEqual([1, 2]);
  });
});
