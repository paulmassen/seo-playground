// Shared by the server page and the client table (no 'use client' here).

export interface SerpElement { url?: string; rank_group?: number; rank_absolute?: number; }

export interface PageIntersectionItem {
  keyword_data?: {
    keyword?: string;
    keyword_info?: { search_volume?: number; cpc?: number };
    keyword_properties?: { keyword_difficulty?: number };
  };
  /** Keyed "1".."20", matching the order of the submitted pages. */
  intersection_result?: Record<string, SerpElement | SerpElement[] | null>;
  /** Legacy shape kept for older saved searches. */
  ranked_serp_element?: { items?: SerpElement[] };
  keyword_difficulty?: number;
}

/** Organic position of page `index` (0-based) on this keyword. */
export function pagePosition(item: PageIntersectionItem, index: number): number | undefined {
  const raw = item.intersection_result?.[String(index + 1)];
  const el = Array.isArray(raw) ? raw[0] : raw;
  if (el) return el.rank_group ?? el.rank_absolute;
  return item.ranked_serp_element?.items?.[index]?.rank_absolute;
}
