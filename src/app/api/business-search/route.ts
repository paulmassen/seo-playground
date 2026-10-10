import { NextRequest, NextResponse } from 'next/server';
import { getCredentials } from '@/lib/db';
import { LANGUAGES } from '@/lib/geo-options';

export const dynamic = 'force-dynamic';

// Google Maps business lookup for the Geo-grid "Find" box, so a business can be picked by
// name (like Semrush's Map Rank Tracker) instead of geocoding an address.
// Uses DataForSEO's Google Maps SERP (about $0.002 per search).
//
// Query parameters:
//   q                    business name (required)
//   location_coordinate  "lat,lng" or "lat,lng,zoom" — usually the current map view (preferred)
//   location_code        DataForSEO location code, used when no coordinate is given
//   language             language name from the form (e.g. "French"); defaults to English

interface MapsItem {
  type?: string;
  title?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  cid?: string;
  domain?: string;
  category?: string;
  rating?: { value?: number; votes_count?: number };
}

/** Normalizes "lat,lng[,zoom]" to the "lat,lng,<zoom>z" format the Maps SERP expects; null when invalid. */
function parseMapsCoordinate(raw: string | null): string | null {
  if (!raw) return null;
  const [lat, lng, zoom] = raw.split(',').map((part) => part.trim().replace(/z$/i, ''));
  const latN = Number(lat), lngN = Number(lng);
  if (!lat || !lng || !Number.isFinite(latN) || !Number.isFinite(lngN)) return null;
  if (Math.abs(latN) > 90 || Math.abs(lngN) > 180) return null;
  const zoomN = Math.min(21, Math.max(3, Math.round(Number(zoom) || 12)));
  return `${latN.toFixed(7)},${lngN.toFixed(7)},${zoomN}z`;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim();
  if (!query) return NextResponse.json({ results: [] });

  const params = request.nextUrl.searchParams;
  const coordinate = parseMapsCoordinate(params.get('location_coordinate'));
  const locationCode = Number(params.get('location_code'));
  if (!coordinate && !(Number.isInteger(locationCode) && locationCode > 0)) {
    return NextResponse.json({ results: [], error: 'A map location (location_coordinate or location_code) is required.' }, { status: 400 });
  }
  const requestedLanguage = params.get('language')?.trim();
  const language = LANGUAGES.find((item) => item.value.toLowerCase() === requestedLanguage?.toLowerCase())?.value ?? 'English';
  const credentials = getCredentials();
  if (!credentials) return NextResponse.json({ results: [], error: 'DataForSEO credentials are not configured.' }, { status: 503 });

  try {
    const response = await fetch('https://api.dataforseo.com/v3/serp/google/maps/live/advanced', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.login}:${credentials.pass}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        keyword: query,
        ...(coordinate ? { location_coordinate: coordinate } : { location_code: locationCode }),
        language_name: language,
        depth: 10,
      }]),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return NextResponse.json({ results: [], error: `DataForSEO HTTP ${response.status}` }, { status: 502 });
    const data = await response.json() as { tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: MapsItem[] }> }> };
    const task = data.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      return NextResponse.json({ results: [], error: task?.status_message ?? 'No response from DataForSEO.' }, { status: 502 });
    }
    const results = (task.result?.[0]?.items ?? [])
      .filter((item) => item.type === 'maps_search' && item.cid && item.latitude != null && item.longitude != null)
      .slice(0, 8)
      .map((item) => ({
        title: item.title ?? 'Unnamed business',
        address: item.address ?? '',
        lat: item.latitude as number,
        lng: item.longitude as number,
        cid: String(item.cid),
        domain: item.domain ?? '',
        category: item.category ?? '',
        rating: item.rating?.value ?? null,
        reviews: item.rating?.votes_count ?? null,
      }));
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ results: [], error: error instanceof Error ? error.message : 'Business search failed.' }, { status: 502 });
  }
}
