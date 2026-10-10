import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfsui-rv-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import { getActiveProject } from './db';
import {
  createBenchmark, deleteBenchmark, getBenchmarkListings, getPendingTasks, getReviewsByListing, getTasks, reserveTask,
} from './review-velocity-db';
import { backfillRequests, collectReviewTasks, postReviewTasks, refreshRequests, toStoredReview, type ApiReview } from './review-velocity-tasks';

const DAY = 86_400_000;
const credentials = { login: 'l', pass: 'p' };

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
afterEach(() => vi.unstubAllGlobals());

function ts(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' +00:00');
}

/** `count` reviews, one every `everyDays` days starting yesterday. */
function apiReviews(prefix: string, count: number, everyDays: number, now: number): ApiReview[] {
  return Array.from({ length: count }, (_, i) => ({
    review_id: `${prefix}-${i}`, timestamp: ts(now - (i + 1) * everyDays * DAY), rating: { value: 5 },
    review_text: 'Great', owner_answer: i % 2 ? 'Thanks' : null, images: [], local_guide: false,
  }));
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/** Minimal DataForSEO stand-in: accepts posts, reports every task ready, serves results by cid. */
function stubApi(resultsByCid: Record<string, { items: ApiReview[]; total: number }>) {
  const posted: Array<{ id: string; cid: string; depth: number; tag: string }> = [];
  let counter = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/task_post')) {
      const body = JSON.parse(String(init?.body)) as Array<{ cid: string; depth: number; tag: string }>;
      const tasks = body.map((task) => {
        const id = `task-${++counter}`;
        posted.push({ id, cid: task.cid, depth: task.depth, tag: task.tag });
        return { id, status_code: 20100, cost: Math.ceil(task.depth / 10) * 0.00075, data: { tag: task.tag } };
      });
      return json({ tasks });
    }
    if (url.endsWith('/tasks_ready')) return json({ tasks: [{ result: posted.map((p) => ({ id: p.id })) }] });
    const id = url.split('/').pop()!;
    const task = posted.find((p) => p.id === id)!;
    const source = resultsByCid[task.cid];
    const items = source.items.slice(0, task.depth);
    return json({ tasks: [{ id, status_code: 20000, cost: 0, result: [{ place_id: `place-${task.cid}`, reviews_count: source.total, items_count: items.length, rating: { value: 4.8 }, items }] }] });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { posted, fetchMock };
}

describe('toStoredReview', () => {
  it('keeps the fields the report needs and drops undated reviews', () => {
    const stored = toStoredReview({ review_id: 'a', timestamp: '2026-08-01 10:00:00 +00:00', rating: { value: 4 }, review_text: 'Nice<br>place', images: [{}, {}], owner_answer: 'Thanks', owner_timestamp: '2026-08-02 10:00:00 +00:00', local_guide: true, reviews_count: 3 });
    expect(stored).toMatchObject({ reviewId: 'a', rating: 4, textLength: 10, photoCount: 2, ownerAnswered: true, localGuide: true, authorReviewCount: 3 });
    expect(stored!.ownerRepliedAt! - stored!.publishedAt).toBe(DAY);
    expect(toStoredReview({ review_id: 'b' })).toBeNull();
    expect(toStoredReview({ timestamp: '2026-08-01 10:00:00 +00:00' })).toBeNull();
  });
});

describe('review task lifecycle', () => {
  it('backfills, completes small listings, relaunches busy ones once, then refreshes incrementally', async () => {
    const projectId = getActiveProject().id;
    const now = Date.UTC(2026, 7, 15, 10);
    const { benchmark, listings } = createBenchmark(
      { name: 'Plumbers Lyon', keyword: 'plombier', center: '45.76,4.83', radiusKm: 5, language: 'French', timeZone: 'UTC' },
      [
        { cid: 'quiet', title: 'Quiet', lat: 45.76, lng: 4.83, totalReviews: 40, rating: 4.5, mapsRank: 2 },
        { cid: 'busy', title: 'Busy', lat: 45.77, lng: 4.84, isSelf: true, totalReviews: 900, rating: 4.9, mapsRank: 1 },
      ],
      projectId,
    );
    expect(listings).toHaveLength(2);

    // Quiet: 40 reviews in total (fewer than the depth). Busy: 3 reviews a day, 900 in total.
    const busyItems = Array.from({ length: 900 }, (_, i) => ({
      review_id: `busy-${i}`, timestamp: ts(now - (i + 1) * (DAY / 3)), rating: { value: 5 }, review_text: 'ok',
    }));
    const api = stubApi({ quiet: { items: apiReviews('quiet', 40, 4, now), total: 40 }, busy: { items: busyItems, total: 900 } });

    const posted = await postReviewTasks(projectId, credentials, benchmark, backfillRequests(listings));
    expect(posted).toEqual({ posted: 2, skipped: 0, errors: [] });
    // A second click while tasks are in flight posts nothing.
    expect((await postReviewTasks(projectId, credentials, benchmark, backfillRequests(listings))).skipped).toBe(2);

    const first = await collectReviewTasks(projectId, credentials, benchmark.id, now);
    expect(first.completed).toBe(2);
    expect(first.relaunched).toBe(1); // only Busy: 100 reviews covered ~33 days

    let stored = getBenchmarkListings(benchmark.id, projectId);
    const quiet = stored.find((l) => l.cid === 'quiet')!;
    const busy = stored.find((l) => l.cid === 'busy')!;
    expect(quiet.coverage.complete).toBe(true);
    expect(quiet.totalReviews).toBe(40);
    expect(busy.coverage.complete).toBe(false);

    const relaunch = api.posted.find((p) => p.cid === 'busy' && p.depth > 100)!;
    expect(relaunch.depth).toBeGreaterThanOrEqual(330); // > 3 months at 3 per day
    const second = await collectReviewTasks(projectId, credentials, benchmark.id, now);
    expect(second.completed).toBe(1);
    expect(second.relaunched).toBe(0); // never relaunched twice

    stored = getBenchmarkListings(benchmark.id, projectId);
    const busyAfter = stored.find((l) => l.cid === 'busy')!;
    expect(busyAfter.coverage.from).not.toBeNull();
    expect(busyAfter.coverage.from!).toBeLessThan(Date.UTC(2026, 4, 1)); // reaches before the 1 May cutoff
    const reviews = getReviewsByListing([busy.id], null, projectId).get(busy.id)!;
    expect(new Set(reviews.map((r) => r.reviewId)).size).toBe(reviews.length); // merged without duplicates

    // A week later: refresh depth is sized from the pace (3/day × 7 days × 1.5 + 10 ≈ 50), not a full backfill.
    const later = now + 7 * DAY;
    const requests = refreshRequests(benchmark, stored, projectId, later);
    const busyRefresh = requests.find((r) => r.listing.cid === 'busy')!;
    expect(busyRefresh.kind).toBe('refresh');
    expect(busyRefresh.depth).toBeGreaterThanOrEqual(40);
    expect(busyRefresh.depth).toBeLessThanOrEqual(60);

    const tasks = getTasks(benchmark.id, 100, projectId);
    expect(tasks.filter((t) => t.status === 'ready')).toHaveLength(3);
    expect(tasks.every((t) => t.cost !== null)).toBe(true);
  });

  it('marks tasks as failed when the API rejects them and frees the listing', async () => {
    const projectId = getActiveProject().id;
    const { benchmark, listings } = createBenchmark(
      { name: 'Bad', keyword: 'x', center: '45,4', radiusKm: 1, language: 'French', timeZone: 'UTC' },
      [{ cid: 'bad', title: 'Bad' }], projectId,
    );
    vi.stubGlobal('fetch', vi.fn(async () => json({ tasks: [{ status_code: 40501, status_message: 'Invalid Field' }] })));
    const outcome = await postReviewTasks(projectId, credentials, benchmark, backfillRequests(listings));
    expect(outcome.posted).toBe(0);
    expect(outcome.errors[0]).toMatch(/Invalid Field/);
    expect(getPendingTasks(benchmark.id, projectId)).toHaveLength(0);
    expect(reserveTask({ benchmarkId: benchmark.id, listingId: listings[0].id, kind: 'backfill', depth: 100 }, projectId)).not.toBeNull();
  });

  it('deletes a benchmark with its listings and closes in-flight tasks', () => {
    const projectId = getActiveProject().id;
    const { benchmark, listings } = createBenchmark(
      { name: 'Tmp', keyword: 'x', center: '45,4', radiusKm: 1, language: 'French', timeZone: 'UTC' },
      [{ cid: 'tmp', title: 'Tmp' }], projectId,
    );
    reserveTask({ benchmarkId: benchmark.id, listingId: listings[0].id, kind: 'backfill', depth: 100 }, projectId);
    deleteBenchmark(benchmark.id, projectId);
    expect(getBenchmarkListings(benchmark.id, projectId)).toHaveLength(0);
    expect(getTasks(benchmark.id, 10, projectId).every((t) => t.status === 'error')).toBe(true);
  });
});
