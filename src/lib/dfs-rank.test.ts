import { describe, expect, it } from 'vitest';
import { rankTo100, ranksTo100 } from './dfs-rank';

describe('rank scale conversion', () => {
  it('rounds a 0–1000 rank to 0–100 and leaves missing values alone', () => {
    expect(rankTo100(549)).toBe(55);
    expect(rankTo100(0)).toBe(0);
    expect(rankTo100(undefined)).toBeUndefined();
    expect(rankTo100(null)).toBeNull();
  });

  it('converts only the rank fields of an item', () => {
    expect(ranksTo100({ domain: 'a.com', domain_from_rank: 550, page_from_rank: 32, backlinks: 1200 }))
      .toEqual({ domain: 'a.com', domain_from_rank: 55, page_from_rank: 3, backlinks: 1200 });
    expect(ranksTo100({ rank: 224, main_domain_rank: 301 })).toEqual({ rank: 22, main_domain_rank: 30 });
  });
});
