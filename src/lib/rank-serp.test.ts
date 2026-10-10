import { describe, it, expect } from 'vitest';
import { diffTopResults, extractTopResults, matchRankSerp, rankHost, stopCrawlOnMatch } from './rank-serp';

const organic = (rank_group: number, domain: string) => ({
  type: 'organic', rank_group, rank_absolute: rank_group + 3, domain, url: `https://${domain}/page`, title: domain,
});

describe('matchRankSerp', () => {
  it('returns the organic position of the tracked domain, including www and subdomains', () => {
    const items = [organic(1, 'fr.wikipedia.org'), organic(2, 'www.example.com'), organic(3, 'blog.example.com')];
    expect(matchRankSerp(items, 'https://www.example.com/')).toEqual({
      position: 2, url: 'https://www.example.com/page', title: 'www.example.com', aiOverview: null,
      topResults: [
        { position: 1, domain: 'fr.wikipedia.org', url: 'https://fr.wikipedia.org/page', title: 'fr.wikipedia.org' },
        { position: 2, domain: 'example.com', url: 'https://www.example.com/page', title: 'www.example.com' },
        { position: 3, domain: 'blog.example.com', url: 'https://blog.example.com/page', title: 'blog.example.com' },
      ],
    });
  });

  it('does not match a domain that merely ends with the tracked name', () => {
    expect(matchRankSerp([organic(1, 'www.notexample.com')], 'example.com').position).toBeNull();
  });

  it('reports an AI Overview citation even when the domain has no organic position', () => {
    const items = [
      { type: 'ai_overview', rank_group: 1, references: [{ domain: 'fr.wikipedia.org' }], items: [{ references: [{ domain: 'example.com' }] }] },
      organic(1, 'fr.wikipedia.org'),
    ];
    expect(matchRankSerp(items, 'example.com')).toEqual({
      position: null, url: null, title: null, aiOverview: true,
      topResults: [{ position: 1, domain: 'fr.wikipedia.org', url: 'https://fr.wikipedia.org/page', title: 'fr.wikipedia.org' }],
    });
  });

  it('distinguishes an AI Overview that cites other sites from a SERP without one', () => {
    const overview = { type: 'ai_overview', references: [{ domain: 'fr.wikipedia.org' }], items: null };
    expect(matchRankSerp([overview, organic(1, 'example.com')], 'example.com').aiOverview).toBe(false);
    expect(matchRankSerp([organic(1, 'example.com')], 'example.com').aiOverview).toBeNull();
  });
});

describe('stopCrawlOnMatch', () => {
  it('targets the bare host with its subdomains', () => {
    expect(rankHost('https://www.Example.com/fr/')).toBe('example.com');
    expect(stopCrawlOnMatch('https://www.example.com/fr/')).toEqual([{ match_type: 'with_subdomains', match_value: 'example.com' }]);
  });
});

describe('extractTopResults', () => {
  it('keeps only organic results ranked 1 to 10, in order', () => {
    const items = [{ type: 'paid', rank_group: 1, domain: 'ad.com' }, organic(12, 'late.com'), organic(2, 'b.com'), organic(1, 'a.com'), { type: 'people_also_ask' }];
    expect(extractTopResults(items)?.map((r) => r.domain)).toEqual(['a.com', 'b.com']);
  });

  it('returns null when the SERP has no organic result', () => {
    expect(extractTopResults([])).toBeNull();
  });
});

describe('diffTopResults', () => {
  const top = (...domains: string[]) => domains.map((domain, i) => ({ position: i + 1, domain, url: `https://${domain}/`, title: null }));

  it('flags moves, new entries and dropped domains by domain', () => {
    const diff = diffTopResults(top('a.com', 'c.com', 'b.com'), top('a.com', 'b.com', 'd.com'));
    expect(diff.rows.map((r) => [r.domain, r.previousPosition])).toEqual([['a.com', 1], ['c.com', null], ['b.com', 2]]);
    expect(diff.dropped).toEqual([{ domain: 'd.com', position: 3 }]);
  });

  it('treats every row as unchanged baseline when there is no previous top 10', () => {
    expect(diffTopResults(top('a.com'), null)).toEqual({ rows: [{ position: 1, domain: 'a.com', url: 'https://a.com/', title: null, previousPosition: null }], dropped: [] });
  });
});
