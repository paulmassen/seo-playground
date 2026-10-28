import { describe, expect, it } from 'vitest';
import { buildCategoryAudit, categoryStats, normalizeMapsListings, parseAuditTarget, type MapsSearchItem } from './category-audit';

function item(rank: number, cid: string, primary: string | null, additional: string[] | null, extra: Partial<MapsSearchItem> = {}): MapsSearchItem {
  return { type: 'maps_search', rank_group: rank, cid, title: `Biz ${cid}`, category: primary, additional_categories: additional, ...extra };
}

describe('normalizeMapsListings', () => {
  it('keeps maps_search items once per CID, renumbered in rank order', () => {
    const listings = normalizeMapsListings([
      item(2, 'b', 'Roofer', null),
      { type: 'maps_paid_item', rank_group: 1, cid: 'ad' },
      item(1, 'a', 'Roofer', ['Gutter cleaning service']),
      item(3, 'a', 'Roofer', null),
    ]);
    expect(listings.map((l) => [l.rank, l.cid])).toEqual([[1, 'a'], [2, 'b']]);
    expect(listings[1].additional).toEqual([]);
  });

  it('drops blank and duplicate labels, including a repeat of the primary', () => {
    const [listing] = normalizeMapsListings([item(1, 'a', ' Roofer ', ['roofer', '', 'Siding', 'Siding'])]);
    expect(listing.primary).toBe('Roofer');
    expect(listing.additional).toEqual(['Siding']);
  });

  it('maps category ids to labels only when the counts line up', () => {
    const [aligned, misaligned] = normalizeMapsListings([
      item(1, 'a', 'Roofer', ['Siding'], { category_ids: ['roofing_contractor', 'siding_contractor'] }),
      item(2, 'b', 'Roofer', ['Siding'], { category_ids: ['roofing_contractor'] }),
    ]);
    expect(aligned.ids).toEqual({ Roofer: 'roofing_contractor', Siding: 'siding_contractor' });
    expect(misaligned.ids).toEqual({});
  });
});

describe('categoryStats', () => {
  it('counts primary and additional usage, overall and among the leaders', () => {
    const listings = normalizeMapsListings([
      item(1, 'a', 'Roofer', ['Siding']),
      item(2, 'b', 'Roofer', null),
      item(3, 'c', 'Siding', null),
      item(4, 'd', 'Gutters', ['Roofer']),
    ]);
    const stats = categoryStats(listings, 2);
    const roofer = stats.find((s) => s.label === 'Roofer')!;
    expect(roofer).toMatchObject({ count: 3, primaryCount: 2, additionalCount: 1, leaderCount: 2, bestRank: 1 });
    expect(roofer.leaderShare).toBe(1);
    expect(roofer.share).toBe(0.75);
    expect(stats[0].label).toBe('Roofer');
  });
});

describe('buildCategoryAudit', () => {
  const listings = normalizeMapsListings([
    item(1, 'a', 'Roofer', ['Gutter cleaning', 'Siding']),
    item(2, 'b', 'Roofer', ['Gutter cleaning']),
    item(3, 'c', 'Roofer', ['Siding', 'Skylight contractor']),
    item(4, 'd', 'Construction company', ['Roofer']),
    item(5, 'e', 'Roofer', null, { rating: { value: 4.1, votes_count: 12 } }),
  ]);

  it('advises the dominant primary and an additional set without a target', () => {
    const audit = buildCategoryAudit(listings, { leaderCount: 3 });
    expect(audit.primary).toMatchObject({ label: 'Roofer', leaderCount: 3, matchesTarget: null });
    expect(audit.suggestedSet.map((s) => s.label)).toEqual(['Gutter cleaning', 'Siding', 'Skylight contractor']);
    expect(audit.suggestions).toEqual([]);
    expect(audit.gap).toBeNull();
  });

  it('classifies categories against a ranked target and compares it with the top 3', () => {
    const audit = buildCategoryAudit(listings, {
      leaderCount: 3,
      target: { cid: 'e', title: 'Mine', primary: 'Wrong', additional: ['Wrong too'] },
    });
    // The listing found in the results wins over the categories passed in.
    expect(audit.target).toMatchObject({ rank: 5, primary: 'Roofer', additional: [] });
    expect(audit.primary?.matchesTarget).toBe(true);
    const byKind = (kind: string) => audit.suggestions.filter((s) => s.kind === kind).map((s) => s.stat.label);
    expect(byKind('add')).toEqual(['Gutter cleaning', 'Siding']);
    expect(byKind('consider')).toEqual(['Skylight contractor']);
    expect(byKind('keep')).toEqual(['Roofer']);
    expect(audit.gap).toMatchObject({ benchmarkSize: 3, targetReviews: 12, targetCategories: 1, avgCategories: 8 / 3 });
    expect(audit.gap?.missingFromTop).toEqual(['Gutter cleaning', 'Siding']);
  });

  it('flags a wrong primary and categories no competitor uses for an unranked target', () => {
    const audit = buildCategoryAudit(listings, {
      leaderCount: 3,
      target: { cid: 'zzz', title: 'Mine', primary: 'Construction company', additional: ['Roofer', 'Solar installer'] },
    });
    expect(audit.target?.rank).toBeNull();
    expect(audit.primary).toMatchObject({ matchesTarget: false, targetUsesAsAdditional: true });
    expect(audit.suggestions.find((s) => s.stat.label === 'Solar installer')?.kind).toBe('uncommon');
    expect(audit.suggestions.find((s) => s.stat.label === 'Construction company')?.kind).toBe('keep');
  });
});

describe('generic Google types', () => {
  it('never suggests "Service establishment", even when every leader shows it', () => {
    const generic = normalizeMapsListings([
      item(1, 'a', 'Plombier', ['Service establishment', 'Chauffagiste']),
      item(2, 'b', 'Plombier', ['Service establishment', 'Chauffagiste']),
      item(3, 'c', 'Plombier', ['Service establishment']),
    ]);
    const audit = buildCategoryAudit(generic, { leaderCount: 3, target: { cid: 'zzz', title: 'Mine', primary: 'Plombier', additional: [] } });
    expect(audit.suggestedSet.map((s) => s.label)).toEqual(['Chauffagiste']);
    expect(audit.suggestions.filter((s) => s.kind === 'add').map((s) => s.stat.label)).toEqual(['Chauffagiste']);
    expect(audit.gap?.missingFromTop).toEqual(['Chauffagiste']);
    expect(audit.stats.some((s) => s.label === 'Service establishment')).toBe(true);
  });
});

describe('parseAuditTarget', () => {
  it('reads a numeric CID and pipe-separated additional categories', () => {
    expect(parseAuditTarget({ target_cid: '123', target_title: 'Mine', target_primary: 'Roofer', target_additional: 'Siding| |Roofer' }))
      .toEqual({ cid: '123', title: 'Mine', primary: 'Roofer', additional: ['Siding'] });
    expect(parseAuditTarget({ target_cid: 'abc' })).toBeNull();
  });
});
