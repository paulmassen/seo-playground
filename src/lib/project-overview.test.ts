import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { cleanLabel, getRankSummary, getRecentSavedResults, summarizeRanks, type KeywordSnapshot } from './project-overview';

const kw = (over: Partial<KeywordSnapshot>): KeywordSnapshot => ({
  id: 1, keyword: 'k', domain: 'example.com', location: 'France', date: '2026-10-10',
  position: null, previousPosition: null, hasPrevious: false, aiOverview: null, ...over,
});

describe('summarizeRanks', () => {
  it('buckets positions like the Rank Tracker badges and ignores unchecked keywords', () => {
    const s = summarizeRanks([
      kw({ position: 2 }), kw({ position: 7 }), kw({ position: 15 }), kw({ position: 45 }),
      kw({ position: null }), kw({ date: null }),
    ]);
    expect(s).toMatchObject({ tracked: 6, checked: 5, ranked: 4, top3: 1, top4to10: 1, top11to30: 1, beyond30: 1, notRanked: 1, top10: 2, avgPosition: 17.3 });
  });

  it('ranks movers by size, counting entering or leaving the results as a move', () => {
    const s = summarizeRanks([
      kw({ keyword: 'up', position: 3, previousPosition: 8, hasPrevious: true }),
      kw({ keyword: 'lost', position: null, previousPosition: 12, hasPrevious: true }),
      kw({ keyword: 'same', position: 4, previousPosition: 4, hasPrevious: true }),
      kw({ keyword: 'first', position: 5 }),
    ]);
    expect(s.improved).toBe(1);
    expect(s.declined).toBe(1);
    expect(s.movers.map((m) => m.keyword)).toEqual(['lost', 'up']);
  });
});

describe('queries', () => {
  it('reads the latest and previous check per keyword', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE tracked_keywords (id INTEGER PRIMARY KEY, keyword TEXT, domain TEXT, location TEXT, language TEXT, created_at INTEGER);
      CREATE TABLE rank_checks (id INTEGER PRIMARY KEY, keyword_id INTEGER, checked_at INTEGER, date TEXT, position INTEGER, ai_overview INTEGER);
      INSERT INTO tracked_keywords VALUES (1, 'a', 'x.com', 'FR', 'fr', 0), (2, 'b', 'x.com', 'FR', 'fr', 0);
      INSERT INTO rank_checks (keyword_id, checked_at, date, position, ai_overview) VALUES
        (1, 0, '2026-10-01', 9, NULL), (1, 0, '2026-10-02', 4, 1), (1, 0, '2026-09-30', 20, NULL);
    `);
    const s = getRankSummary(db);
    expect(s).toMatchObject({ tracked: 2, checked: 1, top10: 1, improved: 1, lastCheck: '2026-10-02', aiOverviewCited: 1 });
    expect(s.movers[0]).toMatchObject({ keyword: 'a', position: 4, previousPosition: 9, change: 5 });
  });

  it('merges saved searches across tools, newest first, skipping missing tables', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE serp_searches (id TEXT, ts INTEGER, keyword TEXT, cost REAL);
      CREATE TABLE domain_intersection_searches (id TEXT, ts INTEGER, target1 TEXT, target2 TEXT, cost REAL);
      INSERT INTO serp_searches VALUES ('s1', 1, 'plombier', 0.002);
      INSERT INTO domain_intersection_searches VALUES ('d1', 2, 'a.com', 'b.com', NULL);
    `);
    const { items, total } = getRecentSavedResults(10, db);
    expect(total).toBe(2);
    expect(items[0]).toMatchObject({ tool: 'Domain Intersection', label: 'a.com vs b.com', cost: null, href: '/dashboard/domain-intersection?history_id=d1#results' });
    expect(items[1]).toMatchObject({ tool: 'SERP Checker', label: 'plombier' });
  });

  it('flattens multi-line keyword lists', () => {
    expect(cleanLabel('a\r\n b\n\nc')).toBe('a, b, c');
    expect(cleanLabel(null)).toBe('Untitled');
  });
});
