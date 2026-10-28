// Read-only summaries of the current project's stored data, for the Dashboard home.
// Everything comes from the local SQLite file: no DataForSEO call is made here.
import type Database from 'better-sqlite3';
import { getProjectDataDb } from './db';

// ─── Rank Tracker ─────────────────────────────────────────────────────────────

export interface KeywordSnapshot {
  id: number;
  keyword: string;
  domain: string;
  location: string;
  /** Latest check date (YYYY-MM-DD), null when never checked. */
  date: string | null;
  position: number | null;
  previousPosition: number | null;
  /** Whether a previous check exists, so a null previousPosition means "not ranked" rather than "no data". */
  hasPrevious: boolean;
  aiOverview: boolean | null;
}

export interface RankMover {
  keyword: string;
  domain: string;
  position: number | null;
  previousPosition: number | null;
  /** Positive = moved up. Entering or leaving the results counts as the distance to depth 100. */
  change: number;
}

export interface RankSummary {
  tracked: number;
  checked: number;
  ranked: number;
  top3: number;
  top10: number;
  /** Buckets match the Rank Tracker position badges: 1–3, 4–10, 11–30, 31+. */
  top4to10: number;
  top11to30: number;
  beyond30: number;
  notRanked: number;
  avgPosition: number | null;
  improved: number;
  declined: number;
  lastCheck: string | null;
  aiOverviewSeen: number;
  aiOverviewCited: number;
  domains: string[];
  movers: RankMover[];
}

const OUT_OF_RESULTS = 101;

export function summarizeRanks(rows: KeywordSnapshot[], moverLimit = 5): RankSummary {
  const checked = rows.filter((r) => r.date !== null);
  const positions = checked.map((r) => r.position).filter((p): p is number => p !== null);
  const movers: RankMover[] = [];
  let improved = 0;
  let declined = 0;
  for (const r of checked) {
    if (!r.hasPrevious || r.position === r.previousPosition) continue;
    const change = (r.previousPosition ?? OUT_OF_RESULTS) - (r.position ?? OUT_OF_RESULTS);
    if (change > 0) improved++; else declined++;
    movers.push({ keyword: r.keyword, domain: r.domain, position: r.position, previousPosition: r.previousPosition, change });
  }
  movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.keyword.localeCompare(b.keyword));
  const withAio = checked.filter((r) => r.aiOverview !== null);
  return {
    tracked: rows.length,
    checked: checked.length,
    ranked: positions.length,
    top3: positions.filter((p) => p <= 3).length,
    top10: positions.filter((p) => p <= 10).length,
    top4to10: positions.filter((p) => p > 3 && p <= 10).length,
    top11to30: positions.filter((p) => p > 10 && p <= 30).length,
    beyond30: positions.filter((p) => p > 30).length,
    notRanked: checked.length - positions.length,
    avgPosition: positions.length > 0 ? Math.round((positions.reduce((s, p) => s + p, 0) / positions.length) * 10) / 10 : null,
    improved,
    declined,
    lastCheck: checked.reduce<string | null>((max, r) => (max === null || r.date! > max ? r.date : max), null),
    aiOverviewSeen: withAio.length,
    aiOverviewCited: withAio.filter((r) => r.aiOverview).length,
    domains: [...new Set(rows.map((r) => r.domain))],
    movers: movers.slice(0, moverLimit),
  };
}

export function getRankSummary(db: Database.Database = getProjectDataDb()): RankSummary {
  const rows = db.prepare(`
    WITH ordered AS (
      SELECT keyword_id, date, position, ai_overview,
        ROW_NUMBER() OVER (PARTITION BY keyword_id ORDER BY date DESC, id DESC) AS rn
      FROM rank_checks
    )
    SELECT k.id, k.keyword, k.domain, k.location,
      l.date, l.position, l.ai_overview, p.position AS prev_position, p.date AS prev_date
    FROM tracked_keywords k
    LEFT JOIN ordered l ON l.keyword_id = k.id AND l.rn = 1
    LEFT JOIN ordered p ON p.keyword_id = k.id AND p.rn = 2
  `).all() as Array<{
    id: number; keyword: string; domain: string; location: string; date: string | null; position: number | null;
    ai_overview: number | null; prev_position: number | null; prev_date: string | null;
  }>;
  return summarizeRanks(rows.map((r) => ({
    id: r.id, keyword: r.keyword, domain: r.domain, location: r.location, date: r.date, position: r.position,
    previousPosition: r.prev_position, hasPrevious: r.prev_date !== null,
    aiOverview: r.ai_overview === null ? null : r.ai_overview === 1,
  })));
}

// ─── Saved results (history across tools) ─────────────────────────────────────

interface HistorySource {
  table: string;
  tool: string;
  /** SQL expression giving a human label for the saved query. */
  label: string;
  href: (id: string) => string;
}

const q = (path: string, param = 'history_id') => (id: string) => `${path}?${param}=${encodeURIComponent(id)}#results`;

// Saved one-off searches. Recurring checks (Rank Tracker, Prompt Tracker, Geo-grid, Review Velocity)
// have their own panels and would otherwise flood the list with scheduled runs.
const HISTORY_SOURCES: HistorySource[] = [
  { table: 'serp_searches', tool: 'SERP Checker', label: 'keyword', href: q('/dashboard/serp') },
  { table: 'lf_searches', tool: 'Local Finder', label: 'keyword', href: q('/dashboard/local-finder') },
  { table: 'gbp_category_audits', tool: 'GBP Category Audit', label: "keyword || ' · ' || area", href: q('/dashboard/gbp-categories') },
  { table: 'kw_overview_searches', tool: 'Keyword Overview', label: 'keywords', href: q('/dashboard/keyword-overview') },
  { table: 'keyword_ideas_searches', tool: 'Keyword Ideas', label: 'keyword', href: q('/dashboard/keyword-ideas') },
  { table: 'related_kw_searches', tool: 'Related Keywords', label: 'keyword', href: q('/dashboard/related-keywords') },
  { table: 'kd_searches', tool: 'Keyword Data', label: 'label', href: q('/dashboard/keyword-data') },
  { table: 'kw_difficulty_searches', tool: 'Keyword Difficulty', label: 'keywords', href: q('/dashboard/keyword-difficulty') },
  { table: 'search_intent_searches', tool: 'Search Intent', label: 'keywords', href: q('/dashboard/search-intent') },
  { table: 'top_searches_searches', tool: 'Top Searches', label: 'location', href: q('/dashboard/top-searches') },
  { table: 'ranked_kw_searches', tool: 'Ranked Keywords', label: 'target', href: q('/dashboard/ranked-keywords') },
  { table: 'competitors_searches', tool: 'Competitors', label: 'target', href: q('/dashboard/competitors') },
  { table: 'domain_intersection_searches', tool: 'Domain Intersection', label: "target1 || ' vs ' || target2", href: q('/dashboard/domain-intersection') },
  { table: 'page_intersection_searches', tool: 'Page Intersection', label: 'pages', href: q('/dashboard/page-intersection') },
  { table: 'hist_rank_searches', tool: 'Historical Rank', label: 'target', href: q('/dashboard/historical-rank') },
  { table: 'subdomains_searches', tool: 'Subdomains', label: 'target', href: q('/dashboard/subdomains') },
  { table: 'traffic_estimation_searches', tool: 'Traffic Estimation', label: 'targets', href: q('/dashboard/traffic-estimation') },
  { table: 'domain_tech_searches', tool: 'Technologies', label: 'target', href: (id) => `/dashboard/domain-analytics/technologies?mode=domain&history_id=${encodeURIComponent(id)}#results` },
  { table: 'domain_whois_searches', tool: 'Whois', label: 'domain', href: q('/dashboard/domain-analytics/whois') },
  { table: 'domain_categories_searches', tool: 'Categories', label: 'target', href: q('/dashboard/domain-analytics/categories') },
  { table: 'backlinks_searches', tool: 'Backlinks', label: 'target', href: q('/dashboard/backlinks') },
  { table: 'ref_domains_searches', tool: 'Referring Domains', label: 'target', href: q('/dashboard/backlinks/referring-domains') },
  { table: 'anchors_searches', tool: 'Anchors', label: 'target', href: q('/dashboard/backlinks/anchors') },
  { table: 'bl_broken', tool: 'Broken Backlinks', label: 'target', href: q('/dashboard/backlinks/broken') },
  { table: 'bl_ref_networks', tool: 'Referring Networks', label: 'target', href: q('/dashboard/backlinks/referring-networks') },
  { table: 'bl_page_intersection', tool: 'Backlinks Page Intersection', label: 'targets', href: q('/dashboard/backlinks/page-intersection') },
  { table: 'bl_domain_intersection', tool: 'Backlinks Domain Intersection', label: "target1 || ' vs ' || target2", href: q('/dashboard/backlinks/domain-intersection') },
  { table: 'bl_history', tool: 'Backlinks History', label: 'target', href: q('/dashboard/backlinks/history') },
  { table: 'bl_bulk_backlinks', tool: 'Bulk Backlinks', label: 'targets', href: q('/dashboard/backlinks/bulk-backlinks') },
  { table: 'bl_bulk_ref_domains', tool: 'Bulk Ref. Domains', label: 'targets', href: q('/dashboard/backlinks/bulk-referring-domains') },
  { table: 'ai_visibility_searches', tool: 'AI Visibility', label: 'target', href: q('/dashboard/ai-visibility') },
  { table: 'ai_optimization_searches', tool: 'AI Optimization', label: 'target', href: q('/dashboard/ai-optimization') },
  { table: 'llm_response_searches', tool: 'AI Prompt Test', label: 'prompt', href: q('/dashboard/llm-responses') },
  { table: 'ai_kwdata_searches', tool: 'AI Keyword Data', label: 'keywords', href: q('/dashboard/ai-keyword-data') },
  { table: 'fan_out_searches', tool: 'Query Fan-Out', label: 'seeds', href: q('/dashboard/query-fan-out') },
  { table: 'web_mentions_searches', tool: 'Web Mentions', label: 'keyword', href: q('/dashboard/web-mentions') },
  { table: 'reviews_tasks', tool: 'Google Reviews', label: 'business', href: (id) => `/dashboard/google-reviews?id=${encodeURIComponent(id)}` },
  { table: 'instant_page_searches', tool: 'Instant Pages', label: 'url', href: (id) => `/dashboard/on-page/instant-pages?id=${encodeURIComponent(id)}` },
  { table: 'site_audit_tasks', tool: 'Site Audit', label: 'target', href: (id) => `/dashboard/on-page/site-audit?task_id=${encodeURIComponent(id)}` },
  { table: 'onpage_tasks', tool: 'Microdata', label: 'url', href: (id) => `/dashboard/on-page/microdata?task_id=${encodeURIComponent(id)}` },
];

export interface SavedResult {
  tool: string;
  label: string;
  ts: number;
  cost: number | null;
  href: string;
}

/** Collapses multi-line keyword lists into one readable line. */
export function cleanLabel(raw: string | null): string {
  const parts = (raw ?? '').split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
  return parts.join(', ') || 'Untitled';
}

function hasColumns(db: Database.Database, table: string, columns: string[]): boolean {
  const names = new Set((db.prepare('SELECT name FROM pragma_table_info(?)').all(table) as Array<{ name: string }>).map((c) => c.name));
  return columns.every((c) => names.has(c));
}

export function getRecentSavedResults(limit = 8, db: Database.Database = getProjectDataDb()): { items: SavedResult[]; total: number } {
  const sources = HISTORY_SOURCES
    .map((s, index) => ({ ...s, index }))
    .filter((s) => hasColumns(db, s.table, ['id', 'ts', 'cost']));
  if (sources.length === 0) return { items: [], total: 0 };
  const union = sources
    .map((s) => `SELECT ${s.index} AS src, id, ts, cost, CAST(${s.label} AS TEXT) AS label FROM ${s.table}`)
    .join(' UNION ALL ');
  const rows = db.prepare(`SELECT * FROM (${union}) ORDER BY ts DESC LIMIT ?`).all(limit) as Array<{ src: number; id: string; ts: number; cost: number | null; label: string | null }>;
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM (${union})`).get() as { total: number };
  return {
    total,
    items: rows.map((r) => {
      const source = HISTORY_SOURCES[r.src];
      return { tool: source.tool, label: cleanLabel(r.label), ts: r.ts, cost: r.cost, href: source.href(String(r.id)) };
    }),
  };
}
