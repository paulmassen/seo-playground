// Review Velocity storage (per-project SQLite). Tables are created on first use, so db.ts only
// exposes the project handle. Every function takes an optional explicit project ID for cron/worker use;
// without one it uses the operation's project scope (see docs/project-scope.md).
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { getProjectDataDb } from './db';
import type { Coverage } from './review-velocity';

const initialised = new WeakSet<Database.Database>();

function ensureSchema(db: Database.Database): void {
  if (initialised.has(db)) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS rv_benchmarks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      keyword TEXT NOT NULL,
      center TEXT NOT NULL,
      radius_km REAL NOT NULL,
      area_label TEXT,
      language TEXT NOT NULL,
      time_zone TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rv_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      benchmark_id TEXT NOT NULL,
      cid TEXT NOT NULL,
      place_id TEXT,
      title TEXT NOT NULL,
      address TEXT,
      category TEXT,
      lat REAL,
      lng REAL,
      is_self INTEGER NOT NULL DEFAULT 0,
      maps_rank INTEGER,
      history_complete INTEGER NOT NULL DEFAULT 0,
      coverage_from INTEGER,
      last_fetch_at INTEGER,
      added_at INTEGER NOT NULL,
      UNIQUE (benchmark_id, cid)
    );

    CREATE TABLE IF NOT EXISTS rv_reviews (
      listing_id INTEGER NOT NULL,
      review_id TEXT NOT NULL,
      published_at INTEGER NOT NULL,
      rating REAL,
      text_length INTEGER NOT NULL DEFAULT 0,
      photo_count INTEGER NOT NULL DEFAULT 0,
      owner_answered INTEGER NOT NULL DEFAULT 0,
      owner_replied_at INTEGER,
      local_guide INTEGER NOT NULL DEFAULT 0,
      author_review_count INTEGER,
      language TEXT,
      first_seen_at INTEGER NOT NULL,
      PRIMARY KEY (listing_id, review_id)
    );

    CREATE TABLE IF NOT EXISTS rv_snapshots (
      listing_id INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      reviews_count INTEGER,
      rating REAL,
      source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rv_tasks (
      task_id TEXT PRIMARY KEY,
      benchmark_id TEXT NOT NULL,
      listing_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      depth INTEGER NOT NULL,
      status TEXT NOT NULL,
      cost REAL,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS rv_discoveries (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      keyword TEXT NOT NULL,
      center TEXT NOT NULL,
      radius_km REAL NOT NULL,
      language TEXT NOT NULL,
      cost REAL,
      result_count INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rv_listings_benchmark ON rv_listings(benchmark_id);
    CREATE INDEX IF NOT EXISTS idx_rv_reviews_time ON rv_reviews(listing_id, published_at);
    CREATE INDEX IF NOT EXISTS idx_rv_snapshots_listing ON rv_snapshots(listing_id, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_rv_tasks_benchmark ON rv_tasks(benchmark_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_rv_tasks_status ON rv_tasks(status);
    -- One paid task in flight per listing: a reservation is written before posting.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rv_tasks_active ON rv_tasks(listing_id) WHERE status IN ('posting', 'pending');
  `);
  // Columns added after the first version of the tables.
  for (const [table, clause] of [['rv_benchmarks', 'ADD COLUMN area_label TEXT']]) {
    try {
      db.exec(`ALTER TABLE ${table} ${clause}`);
    } catch (error) {
      if (!(error instanceof Error && /duplicate column name/i.test(error.message))) throw error;
    }
  }
  initialised.add(db);
}

function rvDb(projectId?: string): Database.Database {
  const db = getProjectDataDb(projectId);
  ensureSchema(db);
  return db;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Benchmark {
  id: string;
  name: string;
  keyword: string;
  center: string;
  radiusKm: number;
  /** Human-readable centre ("Lyon 3e"), when it could be geocoded. */
  areaLabel: string | null;
  language: string;
  timeZone: string;
  createdAt: number;
  updatedAt: number;
}

export interface BenchmarkSummary extends Benchmark {
  listingCount: number;
  pendingTasks: number;
  lastFetchAt: number | null;
}

export interface BenchmarkListing {
  id: number;
  benchmarkId: string;
  cid: string;
  placeId: string | null;
  title: string;
  address: string | null;
  category: string | null;
  lat: number | null;
  lng: number | null;
  isSelf: boolean;
  mapsRank: number | null;
  coverage: Coverage;
  lastFetchAt: number | null;
  addedAt: number;
  /** Latest snapshot of the Google totals. */
  totalReviews: number | null;
  rating: number | null;
}

export interface NewListing {
  cid: string;
  placeId?: string | null;
  title: string;
  address?: string | null;
  category?: string | null;
  lat?: number | null;
  lng?: number | null;
  isSelf?: boolean;
  mapsRank?: number | null;
  totalReviews?: number | null;
  rating?: number | null;
}

export interface StoredReview {
  reviewId: string;
  publishedAt: number;
  rating: number | null;
  textLength: number;
  photoCount: number;
  ownerAnswered: boolean;
  ownerRepliedAt: number | null;
  localGuide: boolean;
  authorReviewCount: number | null;
  language: string | null;
}

export type TaskKind = 'backfill' | 'relaunch' | 'refresh';
export type TaskStatus = 'posting' | 'pending' | 'ready' | 'error';

export interface ReviewTask {
  taskId: string;
  benchmarkId: string;
  listingId: number;
  kind: TaskKind;
  depth: number;
  status: TaskStatus;
  cost: number | null;
  createdAt: number;
  completedAt: number | null;
  errorMessage: string | null;
}

// ─── Row mapping ──────────────────────────────────────────────────────────────

type BenchmarkRow = { id: string; name: string; keyword: string; center: string; radius_km: number; area_label: string | null; language: string; time_zone: string; created_at: number; updated_at: number };
function benchmarkFromRow(r: BenchmarkRow): Benchmark {
  return { id: r.id, name: r.name, keyword: r.keyword, center: r.center, radiusKm: r.radius_km, areaLabel: r.area_label, language: r.language, timeZone: r.time_zone, createdAt: r.created_at, updatedAt: r.updated_at };
}

type ListingRow = {
  id: number; benchmark_id: string; cid: string; place_id: string | null; title: string; address: string | null; category: string | null;
  lat: number | null; lng: number | null; is_self: number; maps_rank: number | null; history_complete: number; coverage_from: number | null;
  last_fetch_at: number | null; added_at: number; total_reviews: number | null; rating: number | null;
};
function listingFromRow(r: ListingRow): BenchmarkListing {
  return {
    id: r.id, benchmarkId: r.benchmark_id, cid: r.cid, placeId: r.place_id, title: r.title, address: r.address, category: r.category,
    lat: r.lat, lng: r.lng, isSelf: r.is_self === 1, mapsRank: r.maps_rank,
    coverage: { complete: r.history_complete === 1, from: r.coverage_from },
    lastFetchAt: r.last_fetch_at, addedAt: r.added_at, totalReviews: r.total_reviews, rating: r.rating,
  };
}

type TaskRow = { task_id: string; benchmark_id: string; listing_id: number; kind: string; depth: number; status: string; cost: number | null; created_at: number; completed_at: number | null; error_message: string | null };
function taskFromRow(r: TaskRow): ReviewTask {
  return {
    taskId: r.task_id, benchmarkId: r.benchmark_id, listingId: r.listing_id, kind: r.kind as TaskKind, depth: r.depth,
    status: r.status as TaskStatus, cost: r.cost, createdAt: r.created_at, completedAt: r.completed_at, errorMessage: r.error_message,
  };
}

// ─── Benchmarks ───────────────────────────────────────────────────────────────

export function createBenchmark(
  input: { name: string; keyword: string; center: string; radiusKm: number; areaLabel?: string | null; language: string; timeZone: string },
  listings: NewListing[],
  projectId?: string,
): { benchmark: Benchmark; listings: BenchmarkListing[] } {
  const db = rvDb(projectId);
  const id = randomUUID();
  const now = Date.now();
  db.transaction(() => {
    db.prepare(`INSERT INTO rv_benchmarks (id, name, keyword, center, radius_km, area_label, language, time_zone, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.name, input.keyword, input.center, input.radiusKm, input.areaLabel ?? null, input.language, input.timeZone, now, now);
    const insert = db.prepare(`INSERT OR IGNORE INTO rv_listings
      (benchmark_id, cid, place_id, title, address, category, lat, lng, is_self, maps_rank, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const snapshot = db.prepare('INSERT INTO rv_snapshots (listing_id, ts, reviews_count, rating, source) VALUES (?, ?, ?, ?, ?)');
    for (const l of listings) {
      const result = insert.run(id, l.cid, l.placeId ?? null, l.title, l.address ?? null, l.category ?? null, l.lat ?? null, l.lng ?? null, l.isSelf ? 1 : 0, l.mapsRank ?? null, now);
      if (result.changes > 0 && (l.totalReviews != null || l.rating != null)) {
        snapshot.run(Number(result.lastInsertRowid), now, l.totalReviews ?? null, l.rating ?? null, 'maps');
      }
    }
  })();
  return { benchmark: getBenchmark(id, projectId)!, listings: getBenchmarkListings(id, projectId) };
}

export function getBenchmark(id: string, projectId?: string): Benchmark | null {
  const row = rvDb(projectId).prepare('SELECT * FROM rv_benchmarks WHERE id = ?').get(id) as BenchmarkRow | undefined;
  return row ? benchmarkFromRow(row) : null;
}

export function listBenchmarks(projectId?: string): BenchmarkSummary[] {
  const rows = rvDb(projectId).prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM rv_listings l WHERE l.benchmark_id = b.id) AS listing_count,
      (SELECT COUNT(*) FROM rv_tasks t WHERE t.benchmark_id = b.id AND t.status IN ('posting', 'pending')) AS pending_tasks,
      (SELECT MAX(l.last_fetch_at) FROM rv_listings l WHERE l.benchmark_id = b.id) AS last_fetch_at
    FROM rv_benchmarks b ORDER BY b.updated_at DESC`).all() as Array<BenchmarkRow & { listing_count: number; pending_tasks: number; last_fetch_at: number | null }>;
  return rows.map((r) => ({ ...benchmarkFromRow(r), listingCount: r.listing_count, pendingTasks: r.pending_tasks, lastFetchAt: r.last_fetch_at }));
}

export function touchBenchmark(id: string, projectId?: string): void {
  rvDb(projectId).prepare('UPDATE rv_benchmarks SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

export function deleteBenchmark(id: string, projectId?: string): void {
  const db = rvDb(projectId);
  db.transaction(() => {
    const listingIds = (db.prepare('SELECT id FROM rv_listings WHERE benchmark_id = ?').all(id) as Array<{ id: number }>).map((r) => r.id);
    for (const listingId of listingIds) {
      db.prepare('DELETE FROM rv_reviews WHERE listing_id = ?').run(listingId);
      db.prepare('DELETE FROM rv_snapshots WHERE listing_id = ?').run(listingId);
    }
    db.prepare('DELETE FROM rv_listings WHERE benchmark_id = ?').run(id);
    // Paid tasks are kept for the Spending page; in-flight ones are closed so their results are ignored.
    db.prepare(`UPDATE rv_tasks SET status = 'error', error_message = 'Benchmark deleted', completed_at = ? WHERE benchmark_id = ? AND status IN ('posting', 'pending')`).run(Date.now(), id);
    db.prepare('DELETE FROM rv_benchmarks WHERE id = ?').run(id);
  })();
}

// ─── Listings ─────────────────────────────────────────────────────────────────

const LISTING_SELECT = `
  SELECT l.*,
    (SELECT s.reviews_count FROM rv_snapshots s WHERE s.listing_id = l.id AND s.reviews_count IS NOT NULL ORDER BY s.ts DESC LIMIT 1) AS total_reviews,
    (SELECT s.rating FROM rv_snapshots s WHERE s.listing_id = l.id AND s.rating IS NOT NULL ORDER BY s.ts DESC LIMIT 1) AS rating
  FROM rv_listings l`;

export function getBenchmarkListings(benchmarkId: string, projectId?: string): BenchmarkListing[] {
  const rows = rvDb(projectId).prepare(`${LISTING_SELECT} WHERE l.benchmark_id = ? ORDER BY l.is_self DESC, COALESCE(l.maps_rank, 9999), l.id`).all(benchmarkId) as ListingRow[];
  return rows.map(listingFromRow);
}

export function getListing(id: number, projectId?: string): BenchmarkListing | null {
  const row = rvDb(projectId).prepare(`${LISTING_SELECT} WHERE l.id = ?`).get(id) as ListingRow | undefined;
  return row ? listingFromRow(row) : null;
}

/** Marks one listing of the benchmark as "My listing" (or none when listingId is null). */
export function setSelfListing(benchmarkId: string, listingId: number | null, projectId?: string): void {
  const db = rvDb(projectId);
  db.transaction(() => {
    db.prepare('UPDATE rv_listings SET is_self = 0 WHERE benchmark_id = ?').run(benchmarkId);
    if (listingId !== null) db.prepare('UPDATE rv_listings SET is_self = 1 WHERE benchmark_id = ? AND id = ?').run(benchmarkId, listingId);
  })();
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

type ReviewRow = {
  listing_id: number; review_id: string; published_at: number; rating: number | null; text_length: number; photo_count: number;
  owner_answered: number; owner_replied_at: number | null; local_guide: number; author_review_count: number | null; language: string | null;
};

/** Reviews of the given listings, optionally only those published since `since`. */
export function getReviewsByListing(listingIds: number[], since: number | null, projectId?: string): Map<number, StoredReview[]> {
  const out = new Map<number, StoredReview[]>(listingIds.map((id) => [id, []]));
  if (listingIds.length === 0) return out;
  const placeholders = listingIds.map(() => '?').join(',');
  const rows = rvDb(projectId).prepare(`SELECT * FROM rv_reviews WHERE listing_id IN (${placeholders})${since !== null ? ' AND published_at >= ?' : ''} ORDER BY published_at DESC`)
    .all(...listingIds, ...(since !== null ? [since] : [])) as ReviewRow[];
  for (const r of rows) {
    out.get(r.listing_id)?.push({
      reviewId: r.review_id, publishedAt: r.published_at, rating: r.rating, textLength: r.text_length, photoCount: r.photo_count,
      ownerAnswered: r.owner_answered === 1, ownerRepliedAt: r.owner_replied_at, localGuide: r.local_guide === 1,
      authorReviewCount: r.author_review_count, language: r.language,
    });
  }
  return out;
}

export function countReviewsSince(listingId: number, since: number, projectId?: string): number {
  return (rvDb(projectId).prepare('SELECT COUNT(*) AS n FROM rv_reviews WHERE listing_id = ? AND published_at >= ?').get(listingId, since) as { n: number }).n;
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

/**
 * Writes a 'posting' row before the paid call. Returns null when the listing already has a task in
 * flight (the partial unique index rejects it), so two clicks can never bill the same fetch twice.
 */
export function reserveTask(input: { benchmarkId: string; listingId: number; kind: TaskKind; depth: number }, projectId?: string): string | null {
  const reservationId = `posting:${input.listingId}:${randomUUID()}`;
  const result = rvDb(projectId).prepare(`INSERT OR IGNORE INTO rv_tasks (task_id, benchmark_id, listing_id, kind, depth, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'posting', ?)`).run(reservationId, input.benchmarkId, input.listingId, input.kind, input.depth, Date.now());
  return result.changes > 0 ? reservationId : null;
}

export function confirmTask(reservationId: string, taskId: string, cost: number | null, projectId?: string): boolean {
  const result = rvDb(projectId).prepare(`UPDATE rv_tasks SET task_id = ?, status = 'pending', cost = ? WHERE task_id = ? AND status = 'posting'`)
    .run(taskId, cost, reservationId);
  return result.changes > 0;
}

export function failTask(taskId: string, message: string, projectId?: string): void {
  rvDb(projectId).prepare(`UPDATE rv_tasks SET status = 'error', error_message = ?, completed_at = ? WHERE task_id = ? AND status IN ('posting', 'pending')`)
    .run(message.slice(0, 500), Date.now(), taskId);
}

export function getPendingTasks(benchmarkId: string | null, projectId?: string): ReviewTask[] {
  const db = rvDb(projectId);
  const rows = (benchmarkId
    ? db.prepare(`SELECT * FROM rv_tasks WHERE status = 'pending' AND benchmark_id = ? ORDER BY created_at`).all(benchmarkId)
    : db.prepare(`SELECT * FROM rv_tasks WHERE status = 'pending' ORDER BY created_at`).all()) as TaskRow[];
  return rows.map(taskFromRow);
}

export function getTasks(benchmarkId: string, limit = 100, projectId?: string): ReviewTask[] {
  return (rvDb(projectId).prepare('SELECT * FROM rv_tasks WHERE benchmark_id = ? ORDER BY created_at DESC LIMIT ?').all(benchmarkId, limit) as TaskRow[]).map(taskFromRow);
}

/** Reservations left behind by a crash between reserving and posting; they block the listing otherwise. */
export function expireStaleReservations(olderThanMs: number, projectId?: string): void {
  rvDb(projectId).prepare(`UPDATE rv_tasks SET status = 'error', error_message = 'Posting did not complete', completed_at = ?
    WHERE status = 'posting' AND created_at < ?`).run(Date.now(), Date.now() - olderThanMs);
}

/**
 * Stores a finished task in one transaction: upserts the reviews, records the Google totals,
 * updates the listing coverage and closes the task. Returns false when the task was already closed.
 */
export function completeTask(
  input: {
    taskId: string;
    listingId: number;
    reviews: StoredReview[];
    snapshot: { reviewsCount: number | null; rating: number | null } | null;
    coverage: Coverage;
    fetchedAt: number;
    placeId: string | null;
    cost: number | null;
  },
  projectId?: string,
): boolean {
  const db = rvDb(projectId);
  let applied = false;
  db.transaction(() => {
    const closed = db.prepare(`UPDATE rv_tasks SET status = 'ready', completed_at = ?, cost = COALESCE(?, cost)
      WHERE task_id = ? AND status = 'pending'`).run(input.fetchedAt, input.cost, input.taskId);
    if (closed.changes === 0) return;
    applied = true;
    const upsert = db.prepare(`INSERT INTO rv_reviews
      (listing_id, review_id, published_at, rating, text_length, photo_count, owner_answered, owner_replied_at, local_guide, author_review_count, language, first_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(listing_id, review_id) DO UPDATE SET
        published_at = excluded.published_at, rating = excluded.rating, text_length = excluded.text_length,
        photo_count = excluded.photo_count, owner_answered = excluded.owner_answered, owner_replied_at = excluded.owner_replied_at,
        local_guide = excluded.local_guide, author_review_count = excluded.author_review_count, language = excluded.language`);
    for (const r of input.reviews) {
      upsert.run(input.listingId, r.reviewId, r.publishedAt, r.rating, r.textLength, r.photoCount, r.ownerAnswered ? 1 : 0,
        r.ownerRepliedAt, r.localGuide ? 1 : 0, r.authorReviewCount, r.language, input.fetchedAt);
    }
    if (input.snapshot && (input.snapshot.reviewsCount !== null || input.snapshot.rating !== null)) {
      db.prepare('INSERT INTO rv_snapshots (listing_id, ts, reviews_count, rating, source) VALUES (?, ?, ?, ?, ?)')
        .run(input.listingId, input.fetchedAt, input.snapshot.reviewsCount, input.snapshot.rating, 'reviews_task');
    }
    db.prepare(`UPDATE rv_listings SET history_complete = ?, coverage_from = ?, last_fetch_at = ?, place_id = COALESCE(?, place_id) WHERE id = ?`)
      .run(input.coverage.complete ? 1 : 0, input.coverage.from, input.fetchedAt, input.placeId, input.listingId);
  })();
  return applied;
}

// ─── Discoveries (Google Maps searches, kept for Spending) ────────────────────

export function saveDiscovery(entry: { keyword: string; center: string; radiusKm: number; language: string; cost: number | null; resultCount: number }, projectId?: string): void {
  rvDb(projectId).prepare(`INSERT INTO rv_discoveries (id, ts, keyword, center, radius_km, language, cost, result_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), Date.now(), entry.keyword, entry.center, entry.radiusKm, entry.language, entry.cost, entry.resultCount);
}
