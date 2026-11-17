// Shared helpers for DataForSEO Labs endpoints (request building, cost estimate).

/** Labs Live pricing as billed (Nov 2026): a flat fee per task plus a fee per returned item (USD). */
export const LABS_PRICE_PER_TASK = 0.012;
export const LABS_PRICE_PER_ITEM = 0.00012;

/** Upper-bound cost of a Labs Live call returning at most `limit` items. */
export function labsCostEstimate(limit: number): number {
  return LABS_PRICE_PER_TASK + LABS_PRICE_PER_ITEM * Math.max(0, limit);
}

export function cleanDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

export type LabsCondition = [string, string, unknown];

/**
 * Joins conditions with "and" in DataForSEO's filters format:
 * one condition stays flat, several become [c1, "and", c2, …]. Labs accepts 8 conditions max.
 */
export function andFilters(conditions: LabsCondition[]): unknown[] | undefined {
  if (conditions.length === 0) return undefined;
  if (conditions.length > 8) throw new Error('DataForSEO Labs accepts 8 filters at most.');
  if (conditions.length === 1) return conditions[0];
  return conditions.flatMap((c, i) => (i === 0 ? [c] : ['and', c]));
}

/** Parses a newline/comma separated domain list, cleaned and de-duplicated. */
export function parseDomainList(raw: string | undefined, max = 1000): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\n,;\s]+/)) {
    const d = cleanDomain(part);
    if (d && d.includes('.')) seen.add(d);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** Parses a positive integer query param, or null when empty/invalid. */
export function positiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Platforms DataForSEO's `exclude_top_domains` does not cover (country variants, directories,
 * social networks) but that dominate competitor lists without being real business competitors.
 */
export const EXTRA_PLATFORM_DOMAINS = [
  'tiktok.com', 'x.com', 'twitter.com', 'linkedin.com', 'snapchat.com', 'threads.net',
  'amazon.fr', 'amazon.de', 'amazon.co.uk', 'amazon.es', 'amazon.it', 'amazon.ca', 'amazon.com.br',
  'ebay.fr', 'ebay.de', 'ebay.co.uk', 'aliexpress.com', 'etsy.com', 'cdiscount.com', 'leboncoin.fr',
  'wikipedia.org', 'fr.wikipedia.org', 'en.wikipedia.org', 'wiktionary.org', 'larousse.fr',
  'tripadvisor.com', 'tripadvisor.fr', 'tripadvisor.co.uk', 'yelp.com', 'yelp.fr', 'pagesjaunes.fr',
  'dailymotion.com', 'vimeo.com', 'mappy.com', 'apple.com', 'apps.apple.com', 'play.google.com',
  'google.fr', 'google.co.uk', 'google.de', 'maps.google.com', 'bing.com', 'yahoo.com',
];
