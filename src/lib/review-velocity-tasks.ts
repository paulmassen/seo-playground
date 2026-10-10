// Review Velocity — DataForSEO task lifecycle: post (reservation first, so a listing is never
// billed twice), collect finished tasks, merge reviews, and relaunch once when 3 months are not covered.
// Every function takes an explicit project ID so it is safe from pages, actions and the cron worker.
import {
  completeTask, confirmTask, countReviewsSince, expireStaleReservations, failTask, getBenchmark, getListing,
  getPendingTasks, reserveTask, type Benchmark, type BenchmarkListing, type StoredReview, type TaskKind,
} from './review-velocity-db';
import {
  INITIAL_DEPTH, MAX_DEPTH, isCovered, mergeCoverage, parseLatLng, parseReviewTimestamp, refreshDepth, relaunchDepth, windowCutoff,
} from './review-velocity';

const API = 'https://api.dataforseo.com/v3/business_data/google/reviews';

export interface Credentials { login: string; pass: string }

function authHeader(credentials: Credentials): string {
  return `Basic ${Buffer.from(`${credentials.login}:${credentials.pass}`).toString('base64')}`;
}

// ─── API → storage ────────────────────────────────────────────────────────────

export interface ApiReview {
  review_id?: string;
  timestamp?: string;
  rating?: { value?: number } | null;
  review_text?: string | null;
  original_review_text?: string | null;
  original_language?: string | null;
  images?: unknown[] | null;
  owner_answer?: string | null;
  owner_timestamp?: string | null;
  local_guide?: boolean | null;
  reviews_count?: number | null;
}

/** Keeps only what the comparison needs; reviews without an ID or a date cannot be counted and are dropped. */
export function toStoredReview(item: ApiReview): StoredReview | null {
  const publishedAt = parseReviewTimestamp(item.timestamp);
  if (!item.review_id || publishedAt === null) return null;
  const text = (item.review_text ?? item.original_review_text ?? '').replace(/<br\s*\/?>/gi, ' ').trim();
  return {
    reviewId: item.review_id,
    publishedAt,
    rating: typeof item.rating?.value === 'number' ? item.rating.value : null,
    textLength: text.length,
    photoCount: Array.isArray(item.images) ? item.images.length : 0,
    ownerAnswered: Boolean(item.owner_answer && item.owner_answer.trim()),
    ownerRepliedAt: parseReviewTimestamp(item.owner_timestamp),
    localGuide: item.local_guide === true,
    authorReviewCount: typeof item.reviews_count === 'number' ? item.reviews_count : null,
    language: item.original_language ?? null,
  };
}

// ─── Posting ──────────────────────────────────────────────────────────────────

export interface TaskRequest { listing: BenchmarkListing; kind: TaskKind; depth: number }
export interface PostOutcome { posted: number; skipped: number; errors: string[] }

/** Location for a cid lookup: a 1 km circle around the listing (falls back to the benchmark centre). */
function locationCoordinate(listing: BenchmarkListing, benchmark: Benchmark): string {
  const point = listing.lat !== null && listing.lng !== null ? { lat: listing.lat, lng: listing.lng } : parseLatLng(benchmark.center);
  if (!point) return '0,0,1000';
  return `${point.lat.toFixed(7)},${point.lng.toFixed(7)},1000`;
}

export async function postReviewTasks(projectId: string, credentials: Credentials, benchmark: Benchmark, requests: TaskRequest[]): Promise<PostOutcome> {
  const reserved: Array<{ reservationId: string; request: TaskRequest }> = [];
  let skipped = 0;
  for (const request of requests) {
    const reservationId = reserveTask({ benchmarkId: benchmark.id, listingId: request.listing.id, kind: request.kind, depth: request.depth }, projectId);
    if (reservationId) reserved.push({ reservationId, request });
    else skipped++;
  }
  if (reserved.length === 0) return { posted: 0, skipped, errors: [] };

  const errors: string[] = [];
  const failAll = (message: string) => {
    for (const r of reserved) failTask(r.reservationId, message, projectId);
    errors.push(message);
    return { posted: 0, skipped, errors };
  };

  let data: { status_code?: number; status_message?: string; tasks?: Array<{ id?: string; status_code?: number; status_message?: string; cost?: number; data?: { tag?: string } }> };
  try {
    const response = await fetch(`${API}/task_post`, {
      method: 'POST',
      headers: { Authorization: authHeader(credentials), 'Content-Type': 'application/json' },
      body: JSON.stringify(reserved.map(({ reservationId, request }) => ({
        cid: request.listing.cid,
        location_coordinate: locationCoordinate(request.listing, benchmark),
        language_name: benchmark.language,
        depth: request.depth,
        sort_by: 'newest',
        tag: reservationId,
      }))),
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) return failAll(`DataForSEO HTTP ${response.status}`);
    data = await response.json();
  } catch (error) {
    return failAll(error instanceof Error ? error.message : 'Could not reach DataForSEO.');
  }

  const tasks = data.tasks ?? [];
  let posted = 0;
  reserved.forEach(({ reservationId, request }, index) => {
    const task = tasks.find((t) => t.data?.tag === reservationId) ?? tasks[index];
    if (task?.id && task.status_code === 20100) {
      if (confirmTask(reservationId, task.id, typeof task.cost === 'number' ? task.cost : null, projectId)) posted++;
    } else {
      const message = task?.status_message ?? data.status_message ?? 'Task was not accepted.';
      failTask(reservationId, message, projectId);
      errors.push(`${request.listing.title}: ${message}`);
    }
  });
  return { posted, skipped, errors };
}

/** Initial fetch for newly added listings. */
export function backfillRequests(listings: BenchmarkListing[]): TaskRequest[] {
  return listings.map((listing) => ({ listing, kind: 'backfill' as const, depth: INITIAL_DEPTH }));
}

/** Incremental fetch sized from each listing's pace; listings never fetched get a full backfill. */
export function refreshRequests(benchmark: Benchmark, listings: BenchmarkListing[], projectId: string, now = Date.now()): TaskRequest[] {
  const cutoff = windowCutoff(now, benchmark.timeZone);
  return listings.map((listing) => {
    if (listing.lastFetchAt === null) return { listing, kind: 'backfill' as const, depth: INITIAL_DEPTH };
    const depth = refreshDepth({ lastFetchAt: listing.lastFetchAt, reviewsInWindow: countReviewsSince(listing.id, cutoff, projectId), windowStart: cutoff, now });
    return { listing, kind: 'refresh' as const, depth };
  });
}

// ─── Collecting ───────────────────────────────────────────────────────────────

interface TaskGetResponse {
  cost?: number;
  tasks?: Array<{
    id?: string;
    status_code?: number;
    status_message?: string;
    cost?: number;
    result?: Array<{
      place_id?: string;
      reviews_count?: number;
      items_count?: number;
      rating?: { value?: number; votes_count?: number } | null;
      items?: ApiReview[] | null;
    }> | null;
  }>;
}

/** Task states that mean "not finished yet" (handed to the crawler / in queue). */
const STILL_RUNNING = new Set([40601, 40602]);
/** Google returned no review at all for the listing. */
const NO_RESULTS = 40102;
/** Direct task_get for tasks missing from tasks_ready: at most once per interval per task. */
const DIRECT_CHECK_AFTER_MS = 3 * 60_000;
const DIRECT_CHECK_INTERVAL_MS = 2 * 60_000;
const lastDirectCheck = new Map<string, number>();

export interface CollectOutcome { completed: number; failed: number; relaunched: number; pending: number }

async function readyTaskIds(credentials: Credentials): Promise<Set<string>> {
  try {
    const response = await fetch(`${API}/tasks_ready`, { headers: { Authorization: authHeader(credentials) }, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return new Set();
    const data = await response.json() as { tasks?: Array<{ result?: Array<{ id: string }> | null }> };
    return new Set((data.tasks?.[0]?.result ?? []).map((r) => r.id));
  } catch {
    return new Set();
  }
}

/**
 * Collects finished tasks (of one benchmark, or all when benchmarkId is null), merges them and
 * relaunches once the listings whose first fetch did not reach back 3 months.
 */
export async function collectReviewTasks(projectId: string, credentials: Credentials, benchmarkId: string | null, now = Date.now()): Promise<CollectOutcome> {
  expireStaleReservations(10 * 60_000, projectId);
  const pending = getPendingTasks(benchmarkId, projectId);
  const outcome: CollectOutcome = { completed: 0, failed: 0, relaunched: 0, pending: pending.length };
  if (pending.length === 0) return outcome;

  const ready = await readyTaskIds(credentials);
  const candidates = pending.filter((task) => {
    if (ready.has(task.taskId)) return true;
    if (now - task.createdAt < DIRECT_CHECK_AFTER_MS) return false;
    return now - (lastDirectCheck.get(task.taskId) ?? 0) >= DIRECT_CHECK_INTERVAL_MS;
  });

  const relaunches = new Map<string, TaskRequest[]>();
  for (const task of candidates) {
    lastDirectCheck.set(task.taskId, now);
    let data: TaskGetResponse;
    try {
      const response = await fetch(`${API}/task_get/${task.taskId}`, { headers: { Authorization: authHeader(credentials) }, cache: 'no-store', signal: AbortSignal.timeout(60_000) });
      if (!response.ok) continue;
      data = await response.json();
    } catch {
      continue;
    }
    const apiTask = data.tasks?.[0];
    const code = apiTask?.status_code;
    if (!apiTask || code === undefined || STILL_RUNNING.has(code)) continue;

    const listing = getListing(task.listingId, projectId);
    const benchmark = getBenchmark(task.benchmarkId, projectId);
    if (!listing || !benchmark) { failTask(task.taskId, 'Listing no longer exists', projectId); outcome.failed++; continue; }
    if (code !== 20000 && code !== NO_RESULTS) { failTask(task.taskId, apiTask.status_message ?? `DataForSEO status ${code}`, projectId); outcome.failed++; continue; }

    const result = code === 20000 ? apiTask.result?.[0] ?? null : null;
    const items = result?.items ?? [];
    const reviews = items.map(toStoredReview).filter((r): r is StoredReview => r !== null);
    const total = result?.reviews_count ?? null;
    // Fewer items than requested (or all of them) means nothing older exists.
    const exhausted = code === NO_RESULTS || items.length < task.depth || (total !== null && items.length >= total);
    const coverage = mergeCoverage(
      { ...listing.coverage, lastFetchAt: listing.lastFetchAt },
      { timestamps: reviews.map((r) => r.publishedAt), exhausted, fetchedAt: now },
    );
    // Task-level cost first; 0 means "not reported", which keeps the task_post estimate.
    const cost = apiTask.cost || data.cost || null;
    const applied = completeTask({
      taskId: task.taskId, listingId: listing.id, reviews,
      snapshot: result ? { reviewsCount: total, rating: result.rating?.value ?? null } : null,
      coverage, fetchedAt: now, placeId: result?.place_id ?? null, cost,
    }, projectId);
    if (!applied) continue;
    lastDirectCheck.delete(task.taskId);
    outcome.completed++;

    // One automatic relaunch when the 3-month window is still not covered.
    const cutoff = windowCutoff(now, benchmark.timeZone);
    if (task.kind !== 'relaunch' && !isCovered(coverage, cutoff) && task.depth < MAX_DEPTH && reviews.length > 0) {
      const oldest = Math.min(...reviews.map((r) => r.publishedAt));
      const depth = relaunchDepth(reviews.length, oldest, cutoff, now, task.depth);
      const list = relaunches.get(benchmark.id) ?? [];
      list.push({ listing: { ...listing, coverage }, kind: 'relaunch', depth });
      relaunches.set(benchmark.id, list);
    }
  }

  for (const [id, requests] of relaunches) {
    const benchmark = getBenchmark(id, projectId);
    if (!benchmark) continue;
    const posted = await postReviewTasks(projectId, credentials, benchmark, requests);
    outcome.relaunched += posted.posted;
  }
  outcome.pending = getPendingTasks(benchmarkId, projectId).length;
  return outcome;
}
