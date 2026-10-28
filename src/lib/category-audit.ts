/**
 * Google Business Profile category audit built from one Google Maps SERP (DataForSEO
 * `serp/google/maps/live/advanced`), which, unlike the Local Finder, returns every listing's
 * primary `category`, its `additional_categories` and the language-independent `category_ids`.
 *
 * Categories are keyed by their label: every listing of one audit comes from the same request,
 * so the labels share one language. The `category_ids` are attached when they line up with the
 * labels, for the CSV export.
 */

/** Google allows one primary and up to nine additional categories per profile. */
export const MAX_ADDITIONAL_CATEGORIES = 9;

export const LEADER_COUNTS = [3, 5, 10, 20] as const;
export const DEFAULT_LEADER_COUNT = 10;

export const RADIUS_OPTIONS_KM = [1, 2, 5, 10, 20, 40] as const;
export const DEFAULT_RADIUS_KM = 5;

/** Raw `maps_search` item, limited to the fields the audit reads. */
export interface MapsSearchItem {
  type?: string;
  rank_group?: number;
  title?: string | null;
  category?: string | null;
  additional_categories?: string[] | null;
  category_ids?: string[] | null;
  cid?: string | number | null;
  place_id?: string | null;
  rating?: { value?: number | null; votes_count?: number | null } | null;
  phone?: string | null;
  url?: string | null;
  domain?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_claimed?: boolean | null;
  total_photos?: number | null;
}

export interface AuditListing {
  rank: number;
  cid: string;
  placeId: string | null;
  title: string;
  primary: string | null;
  additional: string[];
  /** Label → DataForSEO category id, when the ids line up with the labels. */
  ids: Record<string, string>;
  rating: number | null;
  reviews: number | null;
  phone: string | null;
  url: string | null;
  domain: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  claimed: boolean | null;
  photos: number | null;
}

export interface AuditTarget {
  cid: string;
  title: string;
  primary: string | null;
  additional: string[];
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const label = value.trim();
  return label || null;
}

function categoryKey(label: string): string {
  return label.toLocaleLowerCase();
}

/**
 * Google place types that Maps shows in the category list but that cannot be picked in a
 * Business Profile (they come back in English whatever the language). Shown, never suggested.
 */
const GENERIC_TYPES = new Set(['service establishment', 'establishment', 'point of interest', 'store', 'food', 'health']);

export function isGenericCategory(label: string): boolean {
  return GENERIC_TYPES.has(categoryKey(label));
}

function uniqueLabels(labels: Array<string | null>, exclude: string | null): string[] {
  const seen = new Set(exclude ? [categoryKey(exclude)] : []);
  const out: string[] = [];
  for (const label of labels) {
    if (!label || seen.has(categoryKey(label))) continue;
    seen.add(categoryKey(label));
    out.push(label);
  }
  return out;
}

/** Keeps organic listings (one per CID), renumbered 1..n in Maps order. */
export function normalizeMapsListings(items: MapsSearchItem[] | null | undefined): AuditListing[] {
  const seen = new Set<string>();
  const listings: AuditListing[] = [];
  const ordered = (items ?? [])
    .filter((item) => item.type === 'maps_search' && item.cid != null && String(item.cid) !== '')
    .sort((a, b) => (a.rank_group ?? Number.MAX_SAFE_INTEGER) - (b.rank_group ?? Number.MAX_SAFE_INTEGER));
  for (const item of ordered) {
    const cid = String(item.cid);
    if (seen.has(cid)) continue;
    seen.add(cid);
    const primary = cleanLabel(item.category);
    const additional = uniqueLabels((item.additional_categories ?? []).map(cleanLabel), primary);
    const ids: Record<string, string> = {};
    const rawIds = (item.category_ids ?? []).filter((id): id is string => typeof id === 'string' && id.trim() !== '');
    const labels = primary ? [primary, ...additional] : additional;
    // DataForSEO lists the ids in the same order as the labels; only trust that when the counts agree.
    if (rawIds.length === labels.length) labels.forEach((label, i) => { ids[label] = rawIds[i]; });
    listings.push({
      rank: listings.length + 1,
      cid,
      placeId: item.place_id ?? null,
      title: cleanLabel(item.title) ?? 'Unnamed business',
      primary,
      additional,
      ids,
      rating: typeof item.rating?.value === 'number' ? item.rating.value : null,
      reviews: typeof item.rating?.votes_count === 'number' ? item.rating.votes_count : null,
      phone: item.phone ?? null,
      url: item.url ?? null,
      domain: item.domain ?? null,
      address: item.address ?? null,
      lat: typeof item.latitude === 'number' ? item.latitude : null,
      lng: typeof item.longitude === 'number' ? item.longitude : null,
      claimed: typeof item.is_claimed === 'boolean' ? item.is_claimed : null,
      photos: typeof item.total_photos === 'number' ? item.total_photos : null,
    });
  }
  return listings;
}

export function listingCategories(listing: { primary: string | null; additional: string[] }): string[] {
  return listing.primary ? [listing.primary, ...listing.additional] : listing.additional;
}

export interface CategoryStat {
  label: string;
  id: string | null;
  /** Listings using it, as primary or additional. */
  count: number;
  share: number;
  primaryCount: number;
  additionalCount: number;
  /** Listings among the leaders (top N) using it. */
  leaderCount: number;
  leaderShare: number;
  /** leaderShare / share: above 1 means the category is over-represented among the leaders. */
  lift: number;
  /** Best (lowest) rank of a listing using it. */
  bestRank: number;
  avgRank: number;
}

export function categoryStats(listings: AuditListing[], leaderCount: number): CategoryStat[] {
  const total = listings.length;
  const leaders = Math.min(leaderCount, total);
  const stats = new Map<string, CategoryStat & { rankSum: number }>();
  for (const listing of listings) {
    for (const label of listingCategories(listing)) {
      const key = categoryKey(label);
      let stat = stats.get(key);
      if (!stat) {
        stat = {
          label, id: null, count: 0, share: 0, primaryCount: 0, additionalCount: 0,
          leaderCount: 0, leaderShare: 0, lift: 0, bestRank: listing.rank, avgRank: 0, rankSum: 0,
        };
        stats.set(key, stat);
      }
      stat.id ??= listing.ids[label] ?? null;
      stat.count += 1;
      stat.rankSum += listing.rank;
      stat.bestRank = Math.min(stat.bestRank, listing.rank);
      if (label === listing.primary) stat.primaryCount += 1;
      else stat.additionalCount += 1;
      if (listing.rank <= leaders) stat.leaderCount += 1;
    }
  }
  return [...stats.values()]
    .map(({ rankSum, ...stat }) => {
      const share = total ? stat.count / total : 0;
      const leaderShare = leaders ? stat.leaderCount / leaders : 0;
      return { ...stat, share, leaderShare, lift: share ? leaderShare / share : 0, avgRank: stat.count ? rankSum / stat.count : 0 };
    })
    .sort((a, b) => b.leaderCount - a.leaderCount || b.count - a.count || a.bestRank - b.bestRank || a.label.localeCompare(b.label));
}

export type SuggestionKind = 'add' | 'consider' | 'keep' | 'uncommon';

export interface CategorySuggestion {
  kind: SuggestionKind;
  stat: CategoryStat;
  reason: string;
}

export interface PrimaryAdvice {
  /** Most common primary category among the leaders (ties broken over all listings). */
  label: string;
  leaderCount: number;
  count: number;
  /** Null without a target; true when the target already uses it as primary. */
  matchesTarget: boolean | null;
  targetUsesAsAdditional: boolean;
}

export interface CategoryAudit {
  total: number;
  leaders: number;
  stats: CategoryStat[];
  primary: PrimaryAdvice | null;
  /** Ordered additional categories to use (excluding the advised primary), at most nine. */
  suggestedSet: CategoryStat[];
  suggestions: CategorySuggestion[];
  target: (AuditTarget & { rank: number | null }) | null;
  gap: GapCheck | null;
}

export interface GapCheck {
  /** Compared against the top 3 (or fewer when the results are short). */
  benchmarkSize: number;
  targetRating: number | null;
  targetReviews: number | null;
  targetCategories: number;
  avgRating: number | null;
  avgReviews: number | null;
  avgCategories: number;
  maxReviews: number | null;
  /** Categories used by at least two of the top 3 that the target lacks. */
  missingFromTop: string[];
}

/** A category counts as "recommended" when this share of the leaders use it, with at least two of them. */
export const ADD_THRESHOLD = 0.4;
/** Below ADD_THRESHOLD, still worth a look from this share of the leaders, or of all listings. */
export const CONSIDER_THRESHOLD = 0.2;

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function advisePrimary(listings: AuditListing[], leaders: number): Omit<PrimaryAdvice, 'matchesTarget' | 'targetUsesAsAdditional'> | null {
  const counts = new Map<string, { label: string; leaderCount: number; count: number; bestRank: number }>();
  for (const listing of listings) {
    if (!listing.primary || isGenericCategory(listing.primary)) continue;
    const key = categoryKey(listing.primary);
    const entry = counts.get(key) ?? { label: listing.primary, leaderCount: 0, count: 0, bestRank: listing.rank };
    entry.count += 1;
    if (listing.rank <= leaders) entry.leaderCount += 1;
    entry.bestRank = Math.min(entry.bestRank, listing.rank);
    counts.set(key, entry);
  }
  const best = [...counts.values()].sort((a, b) => b.leaderCount - a.leaderCount || b.count - a.count || a.bestRank - b.bestRank)[0];
  return best ? { label: best.label, leaderCount: best.leaderCount, count: best.count } : null;
}

function isAddWorthy(stat: CategoryStat): boolean {
  return !isGenericCategory(stat.label) && stat.leaderCount >= 2 && stat.leaderShare >= ADD_THRESHOLD;
}

function isConsiderWorthy(stat: CategoryStat): boolean {
  if (isGenericCategory(stat.label)) return false;
  return (stat.leaderCount >= 1 && stat.leaderShare >= CONSIDER_THRESHOLD) || (stat.count >= 2 && stat.share >= CONSIDER_THRESHOLD);
}

function usage(stat: CategoryStat, leaders: number, total: number): string {
  return `Used by ${stat.leaderCount} of the top ${leaders} (${pct(stat.leaderShare)}) and ${stat.count} of ${total} listings overall`;
}

export function buildCategoryAudit(
  listings: AuditListing[],
  options: { leaderCount?: number; target?: AuditTarget | null } = {},
): CategoryAudit {
  const total = listings.length;
  const leaders = Math.min(options.leaderCount ?? DEFAULT_LEADER_COUNT, total);
  const stats = categoryStats(listings, leaders);

  // Prefer the categories found in the results: they come from the same request as the competitors.
  const ranked = options.target ? listings.find((listing) => listing.cid === options.target!.cid) : undefined;
  const target = options.target
    ? {
      cid: options.target.cid,
      title: ranked?.title ?? options.target.title,
      primary: ranked ? ranked.primary : options.target.primary,
      additional: ranked ? ranked.additional : options.target.additional,
      rank: ranked?.rank ?? null,
    }
    : null;
  const targetKeys = new Set(target ? listingCategories(target).map(categoryKey) : []);

  const primaryBase = advisePrimary(listings, leaders);
  const primary: PrimaryAdvice | null = primaryBase && {
    ...primaryBase,
    matchesTarget: target ? (target.primary ? categoryKey(target.primary) === categoryKey(primaryBase.label) : false) : null,
    targetUsesAsAdditional: !!target && target.additional.some((label) => categoryKey(label) === categoryKey(primaryBase.label)),
  };

  const primaryKey = primary ? categoryKey(primary.label) : null;
  const suggestedSet = stats
    .filter((stat) => categoryKey(stat.label) !== primaryKey && (isAddWorthy(stat) || isConsiderWorthy(stat)))
    .slice(0, MAX_ADDITIONAL_CATEGORIES);

  const suggestions: CategorySuggestion[] = [];
  if (target) {
    for (const stat of stats) {
      const key = categoryKey(stat.label);
      const has = targetKeys.has(key);
      if (!has) {
        if (key === primaryKey) continue; // covered by the primary advice
        if (isAddWorthy(stat)) suggestions.push({ kind: 'add', stat, reason: `${usage(stat, leaders, total)}, missing from your profile.` });
        else if (isConsiderWorthy(stat)) suggestions.push({ kind: 'consider', stat, reason: `${usage(stat, leaders, total)}. Add it only if it describes a service you offer.` });
      }
    }
    for (const label of listingCategories(target)) {
      if (isGenericCategory(label)) continue;
      const stat = stats.find((item) => categoryKey(item.label) === categoryKey(label));
      if (stat && stat.count - (ranked ? 1 : 0) > 0) {
        suggestions.push({ kind: 'keep', stat, reason: `${usage(stat, leaders, total)}${ranked ? ' (yours included)' : ''}.` });
      } else {
        const own: CategoryStat = stat ?? {
          label, id: null, count: 0, share: 0, primaryCount: 0, additionalCount: 0,
          leaderCount: 0, leaderShare: 0, lift: 0, bestRank: 0, avgRank: 0,
        };
        suggestions.push({ kind: 'uncommon', stat: own, reason: 'No competitor in these results uses it. Keep it if it matches your business: it can still win other searches.' });
      }
    }
  }

  let gap: GapCheck | null = null;
  if (target) {
    const top = listings.filter((listing) => listing.rank <= 3 && listing.cid !== target.cid);
    const ownListing = ranked;
    const missingCounts = new Map<string, { label: string; n: number }>();
    for (const listing of top) {
      for (const label of listingCategories(listing)) {
        if (targetKeys.has(categoryKey(label)) || isGenericCategory(label)) continue;
        const entry = missingCounts.get(categoryKey(label)) ?? { label, n: 0 };
        entry.n += 1;
        missingCounts.set(categoryKey(label), entry);
      }
    }
    const reviews = top.map((listing) => listing.reviews).filter((n): n is number => n !== null);
    gap = {
      benchmarkSize: top.length,
      targetRating: ownListing?.rating ?? null,
      targetReviews: ownListing?.reviews ?? null,
      targetCategories: listingCategories(target).length,
      avgRating: mean(top.map((listing) => listing.rating).filter((n): n is number => n !== null)),
      avgReviews: mean(reviews),
      avgCategories: mean(top.map((listing) => listingCategories(listing).length)) ?? 0,
      maxReviews: reviews.length ? Math.max(...reviews) : null,
      missingFromTop: [...missingCounts.values()].filter((entry) => entry.n >= Math.min(2, top.length)).map((entry) => entry.label),
    };
  }

  return { total, leaders, stats, primary, suggestedSet, suggestions, target, gap };
}

/** Parses the target carried in the URL: categories are joined with "|". */
export function parseAuditTarget(params: { target_cid?: string; target_title?: string; target_primary?: string; target_additional?: string }): AuditTarget | null {
  const cid = params.target_cid?.trim();
  if (!cid || !/^\d+$/.test(cid)) return null;
  const primary = cleanLabel(params.target_primary);
  return {
    cid,
    title: cleanLabel(params.target_title) ?? 'Your business',
    primary,
    additional: uniqueLabels((params.target_additional ?? '').split('|').map(cleanLabel), primary),
  };
}
