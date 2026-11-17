// Types, prices and URL helpers shared by the Technologies page and its client components.
// Must stay free of server-only imports (fs, db).

export interface TechCatalogCategory { id: string; path: string; title: string; technologies: string[] }
export interface TechCatalogGroup { id: string; title: string; categories: TechCatalogCategory[] }
export interface TechCatalog { fetched_at: string; groups: TechCatalogGroup[] }

/** `technologies` as DataForSEO returns it: { group_id: { category_id: ["Tech", ...] } }. */
export type TechCategories = Record<string, Record<string, string[]>>;

export interface TechDomainItem {
  domain?: string;
  title?: string;
  description?: string;
  meta_keywords?: string[] | null;
  domain_rank?: number;
  last_visited?: string;
  country_iso_code?: string;
  language_code?: string;
  content_language_code?: string;
  phone_numbers?: string[] | null;
  emails?: string[] | null;
  social_graph_urls?: string[] | null;
  technologies?: TechCategories | null;
}

// ---- Prices (USD) ----
// Recorded cost of a domain_technologies call is $0.012 (DataForSEO pricing page: $0.012 per task).
export const PRICE_DOMAIN = 0.012;
// Measured on real calls (Nov 2026): $0.012 per task + $0.0012 per returned row
// (domains_by_technology: 3 domains → $0.0156; technology_stats: 10 points → $0.024, 46 → $0.0672).
export const PRICE_FIND_TASK = 0.012;
export const PRICE_FIND_ITEM = 0.0012;
export const PRICE_STATS_TASK = 0.012;
export const PRICE_STATS_ITEM = 0.0012;
export const STATS_MIN_DATE = '2022-10-31';
export const MAX_COMPARE = 5;

export function estimateFindPrice(limit: number) {
  return PRICE_FIND_TASK + limit * PRICE_FIND_ITEM;
}

// ---- Find Domains settings ----

export type FindBy = 'technology' | 'category' | 'group' | 'keyword';
export type MatchMode = 'as_is' | 'entry';

export const ORDER_OPTIONS = [
  { value: 'domain_rank,desc', label: 'Domain rank, high → low' },
  { value: 'domain_rank,asc', label: 'Domain rank, low → high' },
  { value: 'last_visited,desc', label: 'Recently crawled first' },
  { value: 'domain,asc', label: 'Domain name, A → Z' },
  { value: 'country_iso_code,asc', label: 'Country, A → Z' },
] as const;

/** Most common `language_code` values in the Technologies index. */
export const LANGUAGE_CODES = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' },
  { value: 'nl', label: 'Dutch' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'pl', label: 'Polish' },
  { value: 'sv', label: 'Swedish' },
  { value: 'da', label: 'Danish' },
  { value: 'no', label: 'Norwegian' },
  { value: 'fi', label: 'Finnish' },
  { value: 'cs', label: 'Czech' },
  { value: 'ro', label: 'Romanian' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'el', label: 'Greek' },
  { value: 'tr', label: 'Turkish' },
  { value: 'ru', label: 'Russian' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'ar', label: 'Arabic' },
  { value: 'he', label: 'Hebrew' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
  { value: 'id', label: 'Indonesian' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'th', label: 'Thai' },
] as const;

/** Everything that defines one Find Domains request; also stored as JSON in history. */
export interface FindParams {
  by: FindBy;
  /** Technology name, category id or group id depending on `by`. */
  value: string;
  /** "group.category" for an exact technology path (set when picked from the catalogue or a chip). */
  path: string;
  keyword: string;
  match: MatchMode;
  country: string;
  /** Minimum domain rank on the app's 0–100 scale. */
  minDr: number;
  lang: string;
  order: string;
  limit: number;
  page: number;
}

export function findParamsToQuery(p: FindParams, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ mode: 'find', by: p.by });
  if (p.by === 'technology' && p.value) q.set('technology', p.value);
  if (p.by === 'category' && p.value) q.set('category', p.value);
  if (p.by === 'group' && p.value) q.set('group', p.value);
  if (p.by === 'technology' && p.path) q.set('path', p.path);
  if (p.keyword) q.set('keyword', p.keyword);
  if (p.match !== 'as_is') q.set('match', p.match);
  if (p.country) q.set('country', p.country);
  if (p.minDr > 0) q.set('min_dr', String(p.minDr));
  if (p.lang) q.set('lang', p.lang);
  if (p.order !== ORDER_OPTIONS[0].value) q.set('order', p.order);
  q.set('limit', String(p.limit));
  if (p.page > 0) q.set('page', String(p.page));
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

const BASE = '/dashboard/domain-analytics/technologies';

/** Link that opens Find Domains prefilled for one technology, without spending (prefill=1). */
export function findByTechHref(name: string, path?: string) {
  const q = new URLSearchParams({ mode: 'find', by: 'technology', technology: name, prefill: '1' });
  if (path) q.set('path', path);
  return `${BASE}?${q.toString()}`;
}

/** Link that opens the Analyze Domain form prefilled, without spending (prefill=1). */
export function analyzeDomainHref(domain: string) {
  return `${BASE}?${new URLSearchParams({ mode: 'domain', target: domain, prefill: '1' }).toString()}`;
}

export function formatLabel(slug: string) {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Unique technology names of a domain profile, with their "group.category" path. */
export function flattenTechs(techs?: TechCategories | null): Array<{ name: string; group: string; category: string; path: string }> {
  const out: Array<{ name: string; group: string; category: string; path: string }> = [];
  const seen = new Set<string>();
  for (const [group, cats] of Object.entries(techs ?? {})) {
    for (const [category, names] of Object.entries(cats ?? {})) {
      for (const name of names ?? []) {
        if (seen.has(name)) continue;
        seen.add(name);
        out.push({ name, group, category, path: `${group}.${category}` });
      }
    }
  }
  return out;
}

/** Short plain-language description of each DataForSEO technology group. */
export const GROUP_HELP: Record<string, string> = {
  add_ons: 'Plugins and widgets bolted onto the site (page builders, sliders, review widgets…).',
  analytics: 'Audience measurement, tag managers, heatmaps and A/B testing.',
  booking: 'Appointment, reservation and ticketing systems.',
  business_tools: 'Back-office tools exposed on the site (forms, scheduling, document tools).',
  communication: 'Live chat, chatbots, email and messaging tools.',
  content: 'CMS, blog engines, page builders and documentation platforms: how pages are made.',
  location: 'Maps, store locators and geolocation services.',
  marketing: 'Advertising pixels, CRM, email marketing, SEO and affiliate tools.',
  media: 'Video players, image CDNs, audio and media galleries.',
  other: 'Technologies DataForSEO does not file under a more specific group.',
  privacy: 'Cookie banners and consent management platforms (CMP).',
  sales: 'E-commerce platforms, carts, payment processors and subscriptions.',
  security: 'Bot protection, CAPTCHAs, WAF and SSL providers.',
  servers: 'Hosting, CDN, web servers, databases and operating systems.',
  user_generated_content: 'Reviews, comments, forums and social sharing.',
  utilities: 'Generic helpers such as polyfills and font loaders.',
  web_development: 'Frameworks, JavaScript libraries and programming languages.',
};
