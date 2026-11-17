// Shared by the server page and the client table (no 'use client' here).

export interface RankedKwItem {
  keyword_data?: {
    keyword?: string;
    keyword_info?: {
      search_volume?: number;
      cpc?: number;
      competition?: number;
      competition_level?: string;
      search_volume_trend?: { monthly?: number; quarterly?: number; yearly?: number } | null;
    };
    keyword_properties?: { keyword_difficulty?: number };
    search_intent_info?: { main_intent?: string };
    serp_info?: { serp_item_types?: string[] | null } | null;
  };
  ranked_serp_element?: {
    serp_item?: {
      type?: string;
      rank_group?: number;
      rank_absolute?: number;
      url?: string;
      relative_url?: string;
      title?: string;
      domain?: string;
      is_featured_snippet?: boolean;
      etv?: number;
      estimated_paid_traffic_cost?: number;
      rank_changes?: {
        previous_rank_absolute?: number | null;
        is_new?: boolean;
        is_up?: boolean;
        is_down?: boolean;
      } | null;
    };
    serp_item_types?: string[] | null;
    is_lost?: boolean;
  };
}

export type Movement = 'new' | 'up' | 'down' | 'lost' | 'same';

export function movementOf(item: RankedKwItem): Movement {
  const el = item.ranked_serp_element;
  const ch = el?.serp_item?.rank_changes;
  if (el?.is_lost) return 'lost';
  if (ch?.is_new) return 'new';
  if (ch?.is_up) return 'up';
  if (ch?.is_down) return 'down';
  return 'same';
}

/** Positions gained since the previous check (absolute ranks; positive = better). */
export function rankDelta(item: RankedKwItem): number | null {
  const it = item.ranked_serp_element?.serp_item;
  const prev = it?.rank_changes?.previous_rank_absolute;
  if (prev == null || it?.rank_absolute == null) return null;
  return prev - it.rank_absolute;
}

export function pagePath(item: RankedKwItem): string {
  const it = item.ranked_serp_element?.serp_item;
  if (it?.relative_url) return it.relative_url;
  try { return new URL(it?.url ?? '').pathname; } catch { return it?.url ?? ''; }
}

export const SERP_FEATURE_LABELS: Record<string, string> = {
  featured_snippet: 'Featured snippet',
  people_also_ask: 'People also ask',
  local_pack: 'Local pack',
  ai_overview: 'AI overview',
  images: 'Images',
  video: 'Videos',
  shopping: 'Shopping',
  popular_products: 'Products',
  top_stories: 'Top stories',
  knowledge_graph: 'Knowledge panel',
  paid: 'Ads',
};
