// Client-side refinement of the loaded backlinks: instant, free (no API call).
import type { BacklinkItem } from './query';

export type Flag =
  | 'dofollow' | 'nofollow' | 'new' | 'lost' | 'broken' | 'indirect' | 'in_content'
  | 'ranking' | 'low_spam' | 'not_crowded' | 'original';

/** Spam score from which a link is flagged as risky (DataForSEO scale 0–100). */
export const SPAM_RISK = 50;
/** A page with more outbound links than this dilutes each one (link farms, directories). */
export const CROWDED_PAGE = 100;
const CONTENT_LOCATIONS = new Set(['article', 'main', 'section', 'p', 'blockquote']);

export const FLAG_DEFS: { key: Flag; label: string; hint: string; test: (l: BacklinkItem) => boolean }[] = [
  { key: 'dofollow', label: 'Dofollow', hint: 'Passes link equity', test: (l) => l.dofollow === true },
  { key: 'nofollow', label: 'Nofollow', hint: 'nofollow / ugc / sponsored', test: (l) => l.dofollow === false },
  { key: 'new', label: 'New', hint: 'Found on the last crawl', test: (l) => l.is_new === true },
  { key: 'lost', label: 'Lost', hint: 'Removed from the source page', test: (l) => l.is_lost === true },
  { key: 'broken', label: 'Broken target', hint: 'Points to a 4xx/5xx page', test: (l) => l.is_broken === true },
  { key: 'indirect', label: 'Indirect', hint: 'Reaches you via a redirect or canonical', test: (l) => l.is_indirect_link === true },
  { key: 'in_content', label: 'In content', hint: 'Inside <article>, <main> or <section>', test: (l) => !!l.semantic_location && CONTENT_LOCATIONS.has(l.semantic_location) },
  { key: 'ranking', label: 'Ranking page', hint: 'Source page ranks for at least one keyword (top 100)', test: (l) => (l.ranked_keywords_info?.page_from_keywords_count_top_100 ?? 0) > 0 },
  { key: 'low_spam', label: `Spam < ${SPAM_RISK}`, hint: 'Hide risky links', test: (l) => (l.backlink_spam_score ?? 0) < SPAM_RISK },
  { key: 'not_crowded', label: `≤ ${CROWDED_PAGE} outlinks`, hint: 'Hide pages crowded with external links', test: (l) => (l.page_from_external_links ?? 0) <= CROWDED_PAGE },
  { key: 'original', label: 'Original', hint: 'Present when the page was first crawled', test: (l) => l.original === true },
];

export interface LocalFilters {
  text: string;
  flags: Flag[];
  itemType: string;
}

export const EMPTY_FILTERS: LocalFilters = { text: '', flags: [], itemType: '' };

export function linkKind(l: BacklinkItem): string {
  return l.item_type || (l.image_url ? 'image' : 'anchor');
}

function haystack(l: BacklinkItem): string {
  return [l.url_from, l.domain_from, l.anchor, l.alt, l.page_from_title, l.url_to, l.text_pre, l.text_post]
    .filter(Boolean).join(' ').toLowerCase();
}

export function applyFilters(links: BacklinkItem[], f: LocalFilters): BacklinkItem[] {
  const terms = f.text.toLowerCase().split(/\s+/).filter(Boolean);
  const tests = FLAG_DEFS.filter((d) => f.flags.includes(d.key)).map((d) => d.test);
  return links.filter((l) => {
    if (f.itemType && linkKind(l) !== f.itemType) return false;
    if (tests.some((t) => !t(l))) return false;
    if (terms.length) {
      const h = haystack(l);
      if (!terms.every((t) => h.includes(t))) return false;
    }
    return true;
  });
}

/** How many of `links` each flag would keep, to show counts on the toggles. */
export function flagCounts(links: BacklinkItem[]): Record<Flag, number> {
  const out = Object.fromEntries(FLAG_DEFS.map((d) => [d.key, 0])) as Record<Flag, number>;
  for (const l of links) for (const d of FLAG_DEFS) if (d.test(l)) out[d.key]++;
  return out;
}

export function kindCounts(links: BacklinkItem[]): [string, number][] {
  const m = new Map<string, number>();
  for (const l of links) m.set(linkKind(l), (m.get(linkKind(l)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

// ---- Grouping ----

export interface LinkGroup {
  key: string;
  links: BacklinkItem[];
  /** Links in the loaded list. */
  count: number;
  /** Total links DataForSEO knows for this domain (only with mode one_per_domain), else = count. */
  totalKnown: number;
  dofollow: number;
  bestRank?: number;
  maxSpam?: number;
  domains: number;
  targets: number;
  anchors: string[];
  firstSeen?: string;
  hasNew: boolean;
}

export type GroupBy = 'domain' | 'target';

/** Strips protocol, www and trailing slash so http/https and / variants of a page merge. */
export function normalizeUrl(u?: string | null): string {
  if (!u) return '';
  return u.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}

export function groupLinks(links: BacklinkItem[], by: GroupBy): LinkGroup[] {
  const map = new Map<string, BacklinkItem[]>();
  for (const l of links) {
    const key = by === 'domain' ? (l.domain_from ?? '') : normalizeUrl(l.url_to);
    const arr = map.get(key);
    if (arr) arr.push(l); else map.set(key, [l]);
  }
  return [...map.entries()].map(([key, ls]) => {
    const ranks = ls.map((l) => l.domain_from_rank).filter((r): r is number => typeof r === 'number');
    const spams = ls.map((l) => l.backlink_spam_score).filter((r): r is number => typeof r === 'number');
    const anchorCounts = new Map<string, number>();
    for (const l of ls) {
      const a = (l.anchor || l.alt || '').trim();
      if (a) anchorCounts.set(a, (anchorCounts.get(a) ?? 0) + 1);
    }
    const firsts = ls.map((l) => l.first_seen).filter((s): s is string => !!s).sort();
    const known = by === 'domain' ? Math.max(ls.length, ...ls.map((l) => l.group_count ?? 0)) : ls.length;
    return {
      key,
      links: ls,
      count: ls.length,
      totalKnown: known,
      dofollow: ls.filter((l) => l.dofollow).length,
      bestRank: ranks.length ? Math.max(...ranks) : undefined,
      maxSpam: spams.length ? Math.max(...spams) : undefined,
      domains: new Set(ls.map((l) => l.domain_from)).size,
      targets: new Set(ls.map((l) => normalizeUrl(l.url_to))).size,
      anchors: [...anchorCounts.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a),
      firstSeen: firsts[0],
      hasNew: ls.some((l) => l.is_new),
    };
  });
}

// ---- Export ----

export function exportRow(l: BacklinkItem): Record<string, unknown> {
  const kw = l.ranked_keywords_info;
  return {
    source: l.url_from,
    domain_from: l.domain_from,
    title: l.page_from_title ?? '',
    anchor: l.anchor ?? l.alt ?? '',
    context: [l.text_pre, l.anchor, l.text_post].filter(Boolean).join(' '),
    target: l.url_to,
    type: linkKind(l),
    domain_rank: l.domain_from_rank ?? '',
    page_rank: l.page_from_rank ?? '',
    link_rank: l.rank ?? '',
    spam: l.backlink_spam_score ?? '',
    dofollow: l.dofollow ? 'yes' : 'no',
    attributes: (l.attributes ?? []).join(' '),
    new: l.is_new ? 'yes' : 'no',
    lost: l.is_lost ? 'yes' : 'no',
    broken: l.is_broken ? 'yes' : 'no',
    indirect: l.is_indirect_link ? (l.indirect_link_path ?? []).map((h) => `${h.type}:${h.url}`).join(' > ') || 'yes' : 'no',
    location: l.semantic_location ?? '',
    outlinks: l.page_from_external_links ?? '',
    kw_top10: kw?.page_from_keywords_count_top_10 ?? '',
    kw_top100: kw?.page_from_keywords_count_top_100 ?? '',
    country: l.domain_from_country ?? '',
    language: l.page_from_language ?? '',
    platform: (l.domain_from_platform_type ?? []).filter((p) => p !== 'unknown').join(' '),
    domain_links: l.group_count ?? '',
    first_seen: l.first_seen?.slice(0, 10) ?? '',
    last_seen: l.last_seen?.slice(0, 10) ?? '',
  };
}

export const EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: 'source', label: 'Source URL' }, { key: 'domain_from', label: 'Source Domain' }, { key: 'title', label: 'Source Title' },
  { key: 'anchor', label: 'Anchor' }, { key: 'context', label: 'Context' }, { key: 'target', label: 'Target URL' },
  { key: 'type', label: 'Type' }, { key: 'domain_rank', label: 'Domain Rank' }, { key: 'page_rank', label: 'Page Rank' },
  { key: 'link_rank', label: 'Link Rank' }, { key: 'spam', label: 'Spam Score' }, { key: 'dofollow', label: 'Dofollow' },
  { key: 'attributes', label: 'Attributes' }, { key: 'new', label: 'New' }, { key: 'lost', label: 'Lost' },
  { key: 'broken', label: 'Broken' }, { key: 'indirect', label: 'Indirect Path' }, { key: 'location', label: 'Location' },
  { key: 'outlinks', label: 'Page Outlinks' }, { key: 'kw_top10', label: 'Page KW Top 10' }, { key: 'kw_top100', label: 'Page KW Top 100' },
  { key: 'country', label: 'Country' }, { key: 'language', label: 'Language' }, { key: 'platform', label: 'Platform' },
  { key: 'domain_links', label: 'Links From Domain' }, { key: 'first_seen', label: 'First Seen' }, { key: 'last_seen', label: 'Last Seen' },
];

/** Fewer columns for the Markdown copy, which is meant to be pasted into a doc or a chat. */
export const MARKDOWN_COLUMNS = EXPORT_COLUMNS.filter((c) =>
  ['source', 'anchor', 'target', 'domain_rank', 'spam', 'dofollow', 'kw_top10', 'first_seen'].includes(c.key));
