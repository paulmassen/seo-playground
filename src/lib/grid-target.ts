/**
 * Decides whether a Local Finder listing is the monitored target.
 *
 * A target can be:
 * - a Google listing picked from the map search, stored as "Business Name (cid:1234…)":
 *   matched on the listing's CID only (exact listing, like Semrush's Map Rank Tracker).
 * - a domain or URL: matched on the hostname, ignoring protocol and "www.", so
 *   "https://example.com" and "www.example.com" behave the same. A path, if given,
 *   must also appear in the listing's URL (useful for multi-location brands).
 * - anything else: case-insensitive partial match on the business name, domain or URL.
 *
 * Local Finder listings frequently come back without `domain`/`url` (only a title),
 * so a domain/URL target also matches on its brand label ("saint-esteve" -> "saintesteve")
 * against the normalized listing title.
 */

export interface ListingLike {
  title?: string | null;
  domain?: string | null;
  url?: string | null;
  cid?: string | number | null;
}

export function parseTargetCid(target: string): string | null {
  const match = target.match(/cid:\s*(\d+)/i);
  return match ? match[1] : null;
}

export function formatBusinessTarget(title: string, cid: string): string {
  return `${title.trim()} (cid:${cid})`;
}

/** Lowercase, accent-free, letters and digits only. */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseUrl(value: string): { host: string; path: string } | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`);
    return { host: url.hostname.replace(/^www\./, ''), path: url.pathname.replace(/\/+$/, '') };
  } catch {
    return null;
  }
}

function looksLikeDomain(value: string): boolean {
  return /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i.test(value.trim());
}

/** Returns the registrable host label when the target looks like a domain/URL ("https://www.saint-esteve.com/x" -> "saint-esteve"). */
function brandFromDomainTarget(target: string): string | null {
  const host = target.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  const brand = normalize(host.split('.')[0]);
  // Very short labels would match unrelated titles.
  return brand.length >= 4 ? brand : null;
}

export function matchesGridTarget(target: string, listing: ListingLike): boolean {
  const cid = parseTargetCid(target);
  if (cid) return listing.cid != null && String(listing.cid) === cid;

  const needle = target.trim().toLowerCase();
  if (!needle) return false;
  const title = (listing.title ?? '').toLowerCase();
  if (title.includes(needle)
    || (listing.domain ?? '').toLowerCase().includes(needle)
    || (listing.url ?? '').toLowerCase().includes(needle)) return true;

  if (!looksLikeDomain(needle)) return false;
  const wanted = parseUrl(needle);
  if (!wanted) return false;

  // Hostname match regardless of protocol / "www."; a requested path must appear in the listing URL.
  const hostMatches = (value?: string | null) => {
    const got = value ? parseUrl(value) : null;
    return !!got && (got.host === wanted.host || got.host.endsWith(`.${wanted.host}`));
  };
  const listingUrl = listing.url ? parseUrl(listing.url) : null;
  if (hostMatches(listing.url) && (!wanted.path || listingUrl!.path.startsWith(wanted.path))) return true;
  if (!wanted.path && hostMatches(listing.domain)) return true;

  // A listing with a URL of its own is only ours if the host matched above when a path was requested.
  if (wanted.path && listing.url) return false;
  const brand = brandFromDomainTarget(needle);
  return brand !== null && normalize(title).includes(brand);
}

interface PointLike {
  rank: number | null;
  items?: Array<{ rank_group: number; title: string; domain?: string; url?: string; cid?: string; is_target: boolean }>;
}

/**
 * Recomputes `is_target` and `rank` from the stored listings, so runs saved before
 * the matching was fixed report correct numbers without touching the database.
 */
export function reconcileGridPoints<T extends PointLike>(points: T[], target: string): T[] {
  return points.map((point) => {
    if (!point.items?.length) return point;
    const items = point.items.map((item) => ({ ...item, is_target: matchesGridTarget(target, item) }));
    const ranks = items.filter((item) => item.is_target).map((item) => item.rank_group);
    return { ...point, items, rank: ranks.length ? Math.min(...ranks) : null };
  });
}
