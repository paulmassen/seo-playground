// Finds the Google Maps listings competing on a keyword inside a circle (DataForSEO Maps SERP, live).
import { distanceKm, zoomForRadius } from './review-velocity';
import type { Credentials } from './review-velocity-tasks';

export interface DiscoveredListing {
  cid: string;
  placeId: string | null;
  title: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
  rating: number | null;
  totalReviews: number | null;
  /** Position in the Maps results (1 = first). */
  mapsRank: number;
  distanceKm: number;
  insideRadius: boolean;
}

interface MapsItem {
  type?: string;
  rank_group?: number;
  rank_absolute?: number;
  title?: string;
  address?: string;
  category?: string;
  latitude?: number;
  longitude?: number;
  cid?: string;
  place_id?: string;
  rating?: { value?: number; votes_count?: number } | null;
}

export async function discoverListings(
  credentials: Credentials,
  input: { keyword: string; lat: number; lng: number; radiusKm: number; language: string; depth: number },
): Promise<{ results: DiscoveredListing[]; cost: number | null; error?: string }> {
  const zoom = zoomForRadius(input.lat, input.radiusKm);
  try {
    const response = await fetch('https://api.dataforseo.com/v3/serp/google/maps/live/advanced', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.login}:${credentials.pass}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        keyword: input.keyword,
        location_coordinate: `${input.lat.toFixed(7)},${input.lng.toFixed(7)},${zoom}z`,
        language_name: input.language,
        depth: input.depth,
      }]),
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) return { results: [], cost: null, error: `DataForSEO HTTP ${response.status}` };
    const data = await response.json() as { cost?: number; tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: MapsItem[] | null }> | null }> };
    const task = data.tasks?.[0];
    const cost = task?.cost ?? data.cost ?? null;
    if (!task || task.status_code !== 20000) return { results: [], cost, error: task?.status_message ?? 'No response from DataForSEO.' };

    const seen = new Set<string>();
    const results: DiscoveredListing[] = [];
    for (const item of task.result?.[0]?.items ?? []) {
      if (item.type !== 'maps_search' || !item.cid || item.latitude == null || item.longitude == null) continue;
      const cid = String(item.cid);
      if (seen.has(cid)) continue;
      seen.add(cid);
      const distance = distanceKm(input.lat, input.lng, item.latitude, item.longitude);
      results.push({
        cid,
        placeId: item.place_id ?? null,
        title: item.title ?? 'Unnamed business',
        address: item.address ?? '',
        category: item.category ?? '',
        lat: item.latitude,
        lng: item.longitude,
        rating: item.rating?.value ?? null,
        totalReviews: item.rating?.votes_count ?? null,
        mapsRank: item.rank_group ?? results.length + 1,
        distanceKm: Math.round(distance * 10) / 10,
        insideRadius: distance <= input.radiusKm,
      });
    }
    return { results, cost };
  } catch (error) {
    return { results: [], cost: null, error: error instanceof Error ? error.message : 'Google Maps search failed.' };
  }
}
