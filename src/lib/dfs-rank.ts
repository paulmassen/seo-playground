/**
 * DataForSEO returns domain and page ranks on a 0–1000 scale unless `rank_scale: one_hundred` is sent,
 * and the Domain Analytics endpoints (Whois, Technologies) don't accept that option at all.
 * Every view shows ranks on 0–100, so ranks stored or received on 0–1000 go through here.
 */
export function rankTo100<T extends number | null | undefined>(value: T): T {
  return (typeof value === 'number' ? Math.round(value / 10) : value) as T;
}

const RANK_FIELDS = ['rank', 'domain_from_rank', 'page_from_rank', 'domain_rank', 'main_domain_rank'] as const;

/** Copy of `item` with its rank fields (top level only) converted from 0–1000 to 0–100. */
export function ranksTo100<T extends object>(item: T): T {
  const out = { ...item } as Record<string, unknown>;
  for (const key of RANK_FIELDS) if (typeof out[key] === 'number') out[key] = rankTo100(out[key] as number);
  return out as T;
}
