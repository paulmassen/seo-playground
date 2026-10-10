'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCredentials, getCurrentProject, runWithCurrentProject } from '@/lib/db';
import { LANGUAGES } from '@/lib/geo-options';
import { isValidTimeZone, parseLatLng, MAX_LISTINGS } from '@/lib/review-velocity';
import {
  createBenchmark, deleteBenchmark, getBenchmark, getBenchmarkListings, saveDiscovery, setSelfListing, touchBenchmark, type NewListing,
} from '@/lib/review-velocity-db';
import { discoverListings, type DiscoveredListing } from '@/lib/review-velocity-discovery';
import { backfillRequests, postReviewTasks, refreshRequests } from '@/lib/review-velocity-tasks';

const PATH = '/dashboard/review-velocity';
const DISCOVERY_DEPTHS = [20, 40, 100];

function cleanLanguage(value: unknown): string {
  const requested = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return LANGUAGES.find((l) => l.value.toLowerCase() === requested)?.value ?? 'English';
}

function cleanRadius(value: unknown): number {
  const radius = Number(value);
  return Number.isFinite(radius) ? Math.min(50, Math.max(0.5, radius)) : 5;
}

export interface DiscoverInput { keyword: string; center: string; radiusKm: number; language: string; depth: number }
export interface DiscoverResult { results: DiscoveredListing[]; cost: number | null; error?: string }

/** Google Maps search for the keyword around the chosen centre (one paid live call). */
export async function discoverListingsAction(input: DiscoverInput): Promise<DiscoverResult> {
  return runWithCurrentProject(async () => {
    const keyword = String(input.keyword ?? '').trim().slice(0, 200);
    const center = parseLatLng(String(input.center ?? ''));
    if (!keyword) return { results: [], cost: null, error: 'Enter a keyword.' };
    if (!center) return { results: [], cost: null, error: 'Click the map to choose the centre of the area.' };
    const credentials = getCredentials();
    if (!credentials) return { results: [], cost: null, error: 'DataForSEO credentials are missing. Configure them in Settings.' };
    const radiusKm = cleanRadius(input.radiusKm);
    const language = cleanLanguage(input.language);
    const depth = DISCOVERY_DEPTHS.includes(Number(input.depth)) ? Number(input.depth) : 40;
    const found = await discoverListings(credentials, { keyword, lat: center.lat, lng: center.lng, radiusKm, language, depth });
    saveDiscovery({ keyword, center: `${center.lat.toFixed(6)},${center.lng.toFixed(6)}`, radiusKm, language, cost: found.cost, resultCount: found.results.length });
    return found;
  });
}

export interface CreateBenchmarkInput {
  name?: string;
  keyword: string;
  center: string;
  radiusKm: number;
  areaLabel?: string | null;
  language: string;
  timeZone: string;
  listings: NewListing[];
}

/** Saves the benchmark and posts the first fetch (100 newest reviews) for every selected listing. */
export async function createBenchmarkAction(input: CreateBenchmarkInput): Promise<{ id?: string; error?: string; warnings?: string[] }> {
  return runWithCurrentProject(async () => {
    const keyword = String(input.keyword ?? '').trim().slice(0, 200);
    const center = parseLatLng(String(input.center ?? ''));
    if (!keyword || !center) return { error: 'A keyword and an area are required.' };
    const credentials = getCredentials();
    if (!credentials) return { error: 'DataForSEO credentials are missing. Configure them in Settings.' };

    const seen = new Set<string>();
    const listings: NewListing[] = [];
    for (const raw of Array.isArray(input.listings) ? input.listings : []) {
      const cid = String(raw?.cid ?? '').trim();
      if (!/^\d{5,25}$/.test(cid) || seen.has(cid)) continue;
      seen.add(cid);
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      listings.push({
        cid,
        placeId: typeof raw.placeId === 'string' ? raw.placeId : null,
        title: String(raw.title ?? 'Unnamed business').slice(0, 200),
        address: typeof raw.address === 'string' ? raw.address.slice(0, 300) : null,
        category: typeof raw.category === 'string' ? raw.category.slice(0, 120) : null,
        lat: num(raw.lat), lng: num(raw.lng), mapsRank: num(raw.mapsRank),
        totalReviews: num(raw.totalReviews), rating: num(raw.rating),
        isSelf: raw.isSelf === true,
      });
    }
    if (listings.length === 0) return { error: 'Select at least one listing.' };
    if (listings.length > MAX_LISTINGS) return { error: `Select at most ${MAX_LISTINGS} listings.` };
    if (listings.filter((l) => l.isSelf).length > 1) return { error: 'Only one listing can be marked as yours.' };

    const projectId = getCurrentProject().id;
    const timeZone = isValidTimeZone(String(input.timeZone ?? '')) ? String(input.timeZone) : 'UTC';
    const name = String(input.name ?? '').trim().slice(0, 120) || keyword;
    const { benchmark, listings: saved } = createBenchmark({
      name, keyword, center: `${center.lat.toFixed(6)},${center.lng.toFixed(6)}`,
      radiusKm: cleanRadius(input.radiusKm), areaLabel: typeof input.areaLabel === 'string' ? input.areaLabel.trim().slice(0, 120) || null : null,
      language: cleanLanguage(input.language), timeZone,
    }, listings, projectId);
    const outcome = await postReviewTasks(projectId, credentials, benchmark, backfillRequests(saved));
    revalidatePath(PATH);
    return { id: benchmark.id, warnings: outcome.errors.length ? outcome.errors : undefined };
  });
}

/** Fetches the reviews published since the last fetch (or a full backfill for listings never fetched). */
export async function refreshBenchmarkAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const id = String(formData.get('id') ?? '');
    const benchmark = getBenchmark(id);
    const credentials = getCredentials();
    if (!benchmark || !credentials) return;
    const projectId = getCurrentProject().id;
    await postReviewTasks(projectId, credentials, benchmark, refreshRequests(benchmark, getBenchmarkListings(id), projectId));
    touchBenchmark(id);
    revalidatePath(PATH);
  });
}

export async function setSelfListingAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const id = String(formData.get('id') ?? '');
    const raw = String(formData.get('listing_id') ?? '');
    if (!getBenchmark(id)) return;
    setSelfListing(id, raw ? Number(raw) : null);
    revalidatePath(PATH);
  });
}

export async function deleteBenchmarkAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const id = String(formData.get('id') ?? '');
    if (getBenchmark(id)) deleteBenchmark(id);
    revalidatePath(PATH);
    redirect(PATH);
  });
}
