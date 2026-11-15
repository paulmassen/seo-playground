// Shared by the server page (API request, history) and the client table (types only).
// Pure module: no DB, no fetch, so the request building is unit-testable.

export interface IndirectHop {
  type?: string;
  status_code?: number;
  url?: string;
}

/** The subset of a `backlinks/backlinks/live` item the page uses (the raw item has ~47 fields). */
export interface BacklinkItem {
  domain_from?: string;
  url_from?: string;
  url_to?: string;
  tld_from?: string;
  is_new?: boolean;
  is_lost?: boolean;
  backlink_spam_score?: number | null;
  rank?: number;
  page_from_rank?: number;
  domain_from_rank?: number;
  domain_from_platform_type?: string[] | null;
  domain_from_country?: string | null;
  page_from_language?: string | null;
  page_from_title?: string | null;
  page_from_external_links?: number | null;
  first_seen?: string | null;
  last_seen?: string | null;
  item_type?: string | null;
  attributes?: string[] | null;
  dofollow?: boolean;
  original?: boolean;
  alt?: string | null;
  image_url?: string | null;
  anchor?: string | null;
  text_pre?: string | null;
  text_post?: string | null;
  semantic_location?: string | null;
  links_count?: number | null;
  /** Total links from this domain/anchor when `mode` groups results (one_per_domain / one_per_anchor). */
  group_count?: number | null;
  is_broken?: boolean;
  url_to_status_code?: number | null;
  url_to_redirect_target?: string | null;
  ranked_keywords_info?: {
    page_from_keywords_count_top_3?: number;
    page_from_keywords_count_top_10?: number;
    page_from_keywords_count_top_100?: number;
  } | null;
  is_indirect_link?: boolean;
  indirect_link_path?: IndirectHop[] | null;
}

const KEPT_FIELDS: (keyof BacklinkItem)[] = [
  'domain_from', 'url_from', 'url_to', 'tld_from', 'is_new', 'is_lost', 'backlink_spam_score', 'rank',
  'page_from_rank', 'domain_from_rank', 'domain_from_platform_type', 'domain_from_country', 'page_from_language',
  'page_from_title', 'page_from_external_links', 'first_seen', 'last_seen', 'item_type', 'attributes', 'dofollow',
  'original', 'alt', 'image_url', 'anchor', 'text_pre', 'text_post', 'semantic_location', 'links_count',
  'group_count', 'is_broken', 'url_to_status_code', 'url_to_redirect_target', 'ranked_keywords_info',
  'is_indirect_link', 'indirect_link_path',
];

/** Drops the fields the page never reads, so history rows and the client payload stay small. */
export function slimBacklink(raw: Record<string, unknown>): BacklinkItem {
  const out: Record<string, unknown> = {};
  for (const k of KEPT_FIELDS) if (raw[k] !== undefined) out[k] = raw[k];
  return out as BacklinkItem;
}

/**
 * Searches saved before `rank_scale: one_hundred` was sent hold ranks on DataForSEO's default
 * 0–1000 scale. Bring them back to 0–100 so badges and thresholds mean the same thing everywhere.
 */
export function rescaleLegacyLink(l: BacklinkItem): BacklinkItem {
  const r = (v?: number) => (typeof v === 'number' ? Math.round(v / 10) : v);
  return { ...l, rank: r(l.rank), page_from_rank: r(l.page_from_rank), domain_from_rank: r(l.domain_from_rank) };
}

// ---- Query (URL params ⇄ API request) ----

export const MODES = ['as_is', 'one_per_domain', 'one_per_anchor'] as const;
export const STATUSES = ['live', 'lost', 'all'] as const;
export const ITEM_TYPES = ['anchor', 'image', 'redirect', 'canonical', 'alternate', 'meta'] as const;
export const PLATFORMS = ['blogs', 'cms', 'news', 'ecommerce', 'message-boards', 'wikis', 'organization'] as const;
export const LIMITS = [50, 100, 200, 500, 1000] as const;

export const ORDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'domain_from_rank,desc', label: 'Source domain rank (high)' },
  { value: 'page_from_rank,desc', label: 'Source page rank (high)' },
  { value: 'rank,desc', label: 'Link rank passed (high)' },
  { value: 'ranked_keywords_info.page_from_keywords_count_top_10,desc', label: 'Source page keywords in top 10' },
  { value: 'backlink_spam_score,asc', label: 'Spam score (low first)' },
  { value: 'first_seen,desc', label: 'Most recent' },
  { value: 'first_seen,asc', label: 'Oldest' },
  { value: 'last_seen,desc', label: 'Last seen (recent)' },
];

/** DataForSEO caps `filters` at 8 conditions per request. */
export const MAX_API_FILTERS = 8;
/** `offset` cannot exceed 20,000 (beyond that the API wants search_after_token). */
export const MAX_OFFSET = 20_000;

export type Mode = (typeof MODES)[number];
export type Status = (typeof STATUSES)[number];

export interface BacklinksQuery {
  target: string;
  limit: number;
  offset: number;
  orderBy: string;
  mode: Mode;
  status: Status;
  dofollow: boolean | null;
  newOnly: boolean;
  minDr: number | null;
  minPageRank: number | null;
  maxSpam: number | null;
  itemType: string;
  anchor: string;
  domainFrom: string;
  urlTo: string;
  country: string;
  language: string;
  platform: string;
  /** yyyy-mm-dd */
  since: string;
  includeSubdomains: boolean;
  excludeInternal: boolean;
}

export type RawParams = Record<string, string | string[] | undefined>;

function str(p: RawParams, k: string): string {
  const v = p[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
}

function num(p: RawParams, k: string, min: number, max: number): number | null {
  const s = str(p, k);
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** '' (= no filter) unless the value is one of the allowed ones. */
function optionalOneOf(value: string, allowed: readonly string[]): string {
  return allowed.includes(value) ? value : '';
}

export function cleanTarget(t: string): string {
  return t.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
}

export function parseQuery(p: RawParams): BacklinksQuery {
  const limitRaw = Number(str(p, 'limit'));
  const dofollow = str(p, 'dofollow');
  const order = str(p, 'order_by');
  const since = str(p, 'since');
  return {
    target: cleanTarget(str(p, 'target')),
    limit: (LIMITS as readonly number[]).includes(limitRaw) ? limitRaw : 100,
    offset: num(p, 'offset', 0, MAX_OFFSET) ?? 0,
    orderBy: ORDER_OPTIONS.some((o) => o.value === order) ? order : 'domain_from_rank,desc',
    mode: oneOf(str(p, 'mode'), MODES, 'as_is'),
    status: oneOf(str(p, 'status'), STATUSES, 'live'),
    dofollow: dofollow === 'true' ? true : dofollow === 'false' ? false : null,
    newOnly: str(p, 'new') === '1',
    minDr: num(p, 'min_dr', 0, 100),
    minPageRank: num(p, 'min_pr', 0, 100),
    maxSpam: num(p, 'max_spam', 0, 100),
    itemType: optionalOneOf(str(p, 'item_type'), ITEM_TYPES),
    anchor: str(p, 'anchor').slice(0, 200),
    domainFrom: str(p, 'domain_from').slice(0, 200).toLowerCase(),
    urlTo: str(p, 'url_to').slice(0, 500),
    country: /^[a-z]{2}$/i.test(str(p, 'country')) ? str(p, 'country').toUpperCase() : '',
    language: /^[a-z]{2}$/i.test(str(p, 'language')) ? str(p, 'language').toLowerCase() : '',
    platform: optionalOneOf(str(p, 'platform'), PLATFORMS),
    since: /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : '',
    includeSubdomains: str(p, 'subdomains') !== '0',
    excludeInternal: str(p, 'internal') !== '1',
  };
}

/** `like` patterns treat % and _ as wildcards; escape them so user text is matched literally. */
function likeContains(s: string): string {
  return `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

type Condition = [string, string, string | number | boolean];

export function buildFilterConditions(q: BacklinksQuery): Condition[] {
  const c: Condition[] = [];
  if (q.dofollow !== null) c.push(['dofollow', '=', q.dofollow]);
  if (q.newOnly) c.push(['is_new', '=', true]);
  if (q.minDr !== null && q.minDr > 0) c.push(['domain_from_rank', '>=', q.minDr]);
  if (q.minPageRank !== null && q.minPageRank > 0) c.push(['page_from_rank', '>=', q.minPageRank]);
  if (q.maxSpam !== null && q.maxSpam < 100) c.push(['backlink_spam_score', '<=', q.maxSpam]);
  if (q.itemType) c.push(['item_type', '=', q.itemType]);
  if (q.anchor) c.push(['anchor', 'ilike', likeContains(q.anchor)]);
  if (q.domainFrom) c.push(['domain_from', 'ilike', likeContains(q.domainFrom)]);
  if (q.urlTo) c.push(['url_to', 'ilike', likeContains(q.urlTo)]);
  if (q.country) c.push(['domain_from_country', '=', q.country]);
  if (q.language) c.push(['page_from_language', '=', q.language]);
  if (q.platform) c.push(['domain_from_platform_type', 'has', q.platform]);
  if (q.since) c.push(['first_seen', '>', `${q.since} 00:00:00 +00:00`]);
  return c;
}

/** DataForSEO's filter syntax: a single condition stays flat, several are joined with "and". */
export function joinFilters(conds: Condition[]): unknown[] | undefined {
  if (conds.length === 0) return undefined;
  if (conds.length === 1) return conds[0];
  return conds.flatMap((cond, i) => (i === 0 ? [cond] : ['and', cond]));
}

export function buildLinksBody(q: BacklinksQuery): { body?: Record<string, unknown>; error?: string } {
  const conds = buildFilterConditions(q);
  if (conds.length > MAX_API_FILTERS) {
    return { error: `DataForSEO accepts at most ${MAX_API_FILTERS} filters per request; ${conds.length} are set. Remove a few, then refine the loaded list with the quick filters.` };
  }
  const body: Record<string, unknown> = {
    target: q.target,
    limit: q.limit,
    mode: q.mode,
    backlinks_status_type: q.status,
    include_subdomains: q.includeSubdomains,
    exclude_internal_backlinks: q.excludeInternal,
    rank_scale: 'one_hundred',
    order_by: [q.orderBy],
  };
  if (q.offset > 0) body.offset = q.offset;
  const filters = joinFilters(conds);
  if (filters) body.filters = filters;
  return { body };
}

export function buildSummaryBody(q: BacklinksQuery): Record<string, unknown> {
  return {
    target: q.target,
    include_subdomains: q.includeSubdomains,
    exclude_internal_backlinks: q.excludeInternal,
    rank_scale: 'one_hundred',
    internal_list_limit: 20,
  };
}

/** Back to URL params (only non-default values), for pagination, history and summary drill-down links. */
export function queryToParams(q: BacklinksQuery, overrides: Partial<BacklinksQuery> = {}): URLSearchParams {
  const m = { ...q, ...overrides };
  const p = new URLSearchParams();
  p.set('target', m.target);
  if (m.limit !== 100) p.set('limit', String(m.limit));
  if (m.offset > 0) p.set('offset', String(m.offset));
  if (m.orderBy !== 'domain_from_rank,desc') p.set('order_by', m.orderBy);
  if (m.mode !== 'as_is') p.set('mode', m.mode);
  if (m.status !== 'live') p.set('status', m.status);
  if (m.dofollow !== null) p.set('dofollow', String(m.dofollow));
  if (m.newOnly) p.set('new', '1');
  if (m.minDr !== null) p.set('min_dr', String(m.minDr));
  if (m.minPageRank !== null) p.set('min_pr', String(m.minPageRank));
  if (m.maxSpam !== null) p.set('max_spam', String(m.maxSpam));
  if (m.itemType) p.set('item_type', m.itemType);
  if (m.anchor) p.set('anchor', m.anchor);
  if (m.domainFrom) p.set('domain_from', m.domainFrom);
  if (m.urlTo) p.set('url_to', m.urlTo);
  if (m.country) p.set('country', m.country);
  if (m.language) p.set('language', m.language);
  if (m.platform) p.set('platform', m.platform);
  if (m.since) p.set('since', m.since);
  if (!m.includeSubdomains) p.set('subdomains', '0');
  if (!m.excludeInternal) p.set('internal', '1');
  return p;
}

/** Stable identity of everything that changes the API answer (dedupe + history). */
export function queryKey(q: BacklinksQuery): string {
  return queryToParams(q).toString();
}

const MODE_LABEL: Record<Mode, string> = { as_is: 'All links', one_per_domain: 'One per domain', one_per_anchor: 'One per anchor' };
const STATUS_LABEL: Record<Status, string> = { live: 'Live', lost: 'Lost', all: 'Live + lost' };

/** Human-readable chips for the API-side settings that differ from the defaults. */
export function describeQuery(q: BacklinksQuery): string[] {
  const out: string[] = [];
  if (q.mode !== 'as_is') out.push(MODE_LABEL[q.mode]);
  if (q.status !== 'live') out.push(STATUS_LABEL[q.status]);
  if (q.dofollow !== null) out.push(q.dofollow ? 'Dofollow' : 'Nofollow');
  if (q.newOnly) out.push('New only');
  if (q.minDr) out.push(`Domain rank ≥ ${q.minDr}`);
  if (q.minPageRank) out.push(`Page rank ≥ ${q.minPageRank}`);
  if (q.maxSpam !== null && q.maxSpam < 100) out.push(`Spam ≤ ${q.maxSpam}`);
  if (q.itemType) out.push(`Type: ${q.itemType}`);
  if (q.anchor) out.push(`Anchor ∋ “${q.anchor}”`);
  if (q.domainFrom) out.push(`Domain ∋ “${q.domainFrom}”`);
  if (q.urlTo) out.push(`Target ∋ “${q.urlTo}”`);
  if (q.country) out.push(`Country: ${q.country}`);
  if (q.language) out.push(`Lang: ${q.language}`);
  if (q.platform) out.push(`Platform: ${q.platform}`);
  if (q.since) out.push(`Since ${q.since}`);
  if (!q.includeSubdomains) out.push('No subdomains');
  if (!q.excludeInternal) out.push('With internal links');
  return out;
}

export function hasAdvancedFilters(q: BacklinksQuery): boolean {
  return buildFilterConditions(q).length > 0 || !q.includeSubdomains || !q.excludeInternal;
}
