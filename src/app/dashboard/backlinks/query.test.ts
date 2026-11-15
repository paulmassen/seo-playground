import { describe, expect, it } from 'vitest';
import {
  buildLinksBody, buildFilterConditions, describeQuery, joinFilters, parseQuery, queryToParams, rescaleLegacyLink, slimBacklink,
} from './query';
import { applyFilters, EMPTY_FILTERS, flagCounts, groupLinks, normalizeUrl } from './links';

describe('parseQuery', () => {
  it('falls back to safe defaults for missing or invalid params', () => {
    const q = parseQuery({ target: 'https://www.Example.com/page', limit: '42', order_by: 'evil', mode: 'x', status: 'y', min_dr: 'abc', country: 'FRA' });
    expect(q).toMatchObject({
      target: 'example.com', limit: 100, orderBy: 'domain_from_rank,desc', mode: 'as_is', status: 'live',
      minDr: null, country: '', includeSubdomains: true, excludeInternal: true, offset: 0,
    });
  });

  it('clamps numbers and normalizes codes', () => {
    const q = parseQuery({ target: 'a.com', min_dr: '250', max_spam: '-5', offset: '999999', country: 'fr', language: 'FR' });
    expect(q.minDr).toBe(100);
    expect(q.maxSpam).toBe(0);
    expect(q.offset).toBe(20_000);
    expect(q.country).toBe('FR');
    expect(q.language).toBe('fr');
  });

  it('round-trips through queryToParams', () => {
    const raw = { target: 'a.com', mode: 'one_per_domain', status: 'lost', dofollow: 'true', min_dr: '20', anchor: 'seo', since: '2026-01-01', subdomains: '0', offset: '100' };
    const q = parseQuery(raw);
    expect(parseQuery(Object.fromEntries(queryToParams(q)))).toEqual(q);
  });
});

describe('buildLinksBody', () => {
  it('always asks for the 0–100 rank scale and forwards mode and status', () => {
    const { body } = buildLinksBody(parseQuery({ target: 'a.com', mode: 'one_per_domain', status: 'lost' }));
    expect(body).toMatchObject({ target: 'a.com', mode: 'one_per_domain', backlinks_status_type: 'lost', rank_scale: 'one_hundred' });
    expect(body).not.toHaveProperty('filters');
    expect(body).not.toHaveProperty('offset');
  });

  it('keeps a single filter flat and joins several with "and"', () => {
    expect(joinFilters([['dofollow', '=', true]])).toEqual(['dofollow', '=', true]);
    expect(joinFilters([['dofollow', '=', true], ['is_new', '=', true]])).toEqual([['dofollow', '=', true], 'and', ['is_new', '=', true]]);
  });

  it('escapes like wildcards in user text', () => {
    const conds = buildFilterConditions(parseQuery({ target: 'a.com', anchor: '100%_off' }));
    expect(conds).toEqual([['anchor', 'ilike', '%100\\%\\_off%']]);
  });

  it('maps every advanced field to the documented filter', () => {
    const conds = buildFilterConditions(parseQuery({
      target: 'a.com', dofollow: 'false', new: '1', min_dr: '10', min_pr: '5', max_spam: '30', item_type: 'image',
      platform: 'blogs', since: '2026-03-01',
    }));
    expect(conds).toEqual([
      ['dofollow', '=', false], ['is_new', '=', true], ['domain_from_rank', '>=', 10], ['page_from_rank', '>=', 5],
      ['backlink_spam_score', '<=', 30], ['item_type', '=', 'image'], ['domain_from_platform_type', 'has', 'blogs'],
      ['first_seen', '>', '2026-03-01 00:00:00 +00:00'],
    ]);
  });

  it('refuses more than 8 filters instead of sending a request DataForSEO would reject', () => {
    const { body, error } = buildLinksBody(parseQuery({
      target: 'a.com', dofollow: 'true', new: '1', min_dr: '1', min_pr: '1', max_spam: '30', item_type: 'anchor',
      anchor: 'x', domain_from: 'y', url_to: 'z',
    }));
    expect(body).toBeUndefined();
    expect(error).toMatch(/at most 8/);
  });

  it('describes non-default settings', () => {
    expect(describeQuery(parseQuery({ target: 'a.com' }))).toEqual([]);
    expect(describeQuery(parseQuery({ target: 'a.com', mode: 'one_per_domain', max_spam: '30' }))).toEqual(['One per domain', 'Spam ≤ 30']);
  });
});

describe('stored links', () => {
  it('slims raw items to known fields', () => {
    expect(slimBacklink({ url_from: 'u', page_from_size: 1234, page_from_encoding: 'utf-8' })).toEqual({ url_from: 'u' });
  });

  it('rescales legacy 0–1000 ranks', () => {
    expect(rescaleLegacyLink({ domain_from_rank: 516, page_from_rank: 4, rank: undefined })).toMatchObject({ domain_from_rank: 52, page_from_rank: 0 });
  });
});

describe('client filters and grouping', () => {
  const links = [
    { domain_from: 'a.com', url_from: 'https://a.com/1', url_to: 'https://www.t.com/', dofollow: true, is_new: true, backlink_spam_score: 70, domain_from_rank: 40, anchor: 'Brand', semantic_location: 'article' },
    { domain_from: 'a.com', url_from: 'https://a.com/2', url_to: 'http://t.com', dofollow: false, backlink_spam_score: 10, domain_from_rank: 40, anchor: 'Brand', group_count: 12 },
    { domain_from: 'b.org', url_from: 'https://b.org/x', url_to: 'https://t.com/blog/', dofollow: true, is_indirect_link: true, backlink_spam_score: 0, domain_from_rank: 10, anchor: 'read more', ranked_keywords_info: { page_from_keywords_count_top_100: 3 } },
  ];

  it('combines flags (AND) and free text across fields', () => {
    expect(applyFilters(links, { ...EMPTY_FILTERS, flags: ['dofollow', 'low_spam'] }).map((l) => l.url_from)).toEqual(['https://b.org/x']);
    expect(applyFilters(links, { ...EMPTY_FILTERS, text: 'brand a.com/2' }).map((l) => l.url_from)).toEqual(['https://a.com/2']);
    expect(applyFilters(links, { ...EMPTY_FILTERS, flags: ['in_content'] })).toHaveLength(1);
  });

  it('counts each flag', () => {
    const c = flagCounts(links);
    expect(c).toMatchObject({ dofollow: 2, nofollow: 1, new: 1, indirect: 1, ranking: 1, low_spam: 2 });
  });

  it('groups by domain using group_count, and by normalized target URL', () => {
    const byDomain = groupLinks(links, 'domain');
    expect(byDomain.find((g) => g.key === 'a.com')).toMatchObject({ count: 2, totalKnown: 12, dofollow: 1, maxSpam: 70, targets: 1, anchors: ['Brand'] });
    const byTarget = groupLinks(links, 'target');
    expect(byTarget.map((g) => [g.key, g.count])).toEqual([['t.com', 2], ['t.com/blog', 1]]);
    expect(normalizeUrl('https://www.x.com/a/')).toBe('x.com/a');
  });
});
