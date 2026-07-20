import { searchLocations, type LocationOption } from '@/lib/db';
import { LOCATIONS } from '@/lib/geo-options';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const results = searchLocations(q, 20);

  // A handful of countries (e.g. Russia) aren't in DataForSEO's SERP locations
  // dataset — fall back to the static country list so they stay selectable.
  const known = new Set(results.map((r) => r.name.toLowerCase()));
  const query = q.trim().toLowerCase();
  const fallbacks: LocationOption[] = LOCATIONS
    .filter((l) => !known.has(l.value.toLowerCase()) && (!query || l.value.toLowerCase().includes(query)))
    .map((l) => ({ code: 0, name: l.value, countryIso: '', type: 'Country' }));

  return NextResponse.json({ results: [...results, ...fallbacks].slice(0, 20) });
}
