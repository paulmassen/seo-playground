import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { reconcileGridPoints } from './grid-target';
import type { RankTopResult } from './rank-serp';

// Operation-local identity, never the mutable UI selection after an await.
const projectScope = new AsyncLocalStorage<string>();
const dataDbs = new Map<string, Database.Database>();
let controlDb: Database.Database | null = null;

export interface Project {
  id: string;
  name: string;
  domain: string;
  defaultLocation: string;
  defaultLanguage: string;
  defaultCoordinates: string;
  rankTrackerDepth: string;
  createdAt: number;
}

type ProjectRow = {
  id: string;
  name: string;
  domain: string;
  default_location: string;
  default_language: string;
  default_coordinates: string;
  rank_tracker_depth: string;
  created_at: number;
};

const PROJECT_SETTING_COLUMNS = {
  default_domain: 'domain',
  default_location: 'default_location',
  default_language: 'default_language',
  default_coordinates: 'default_coordinates',
  rank_tracker_depth: 'rank_tracker_depth',
} as const;

function baseDbPath(): string {
  return process.env.DB_PATH ?? path.join(process.cwd(), 'seo-playground.db');
}

/** SQLite file holding the login accounts and sessions; kept apart from the SEO data. */
export function authDbPath(): string {
  return `${baseDbPath()}.auth`;
}

function controlDbPath(): string {
  return `${baseDbPath()}.projects`;
}

function dataDbPath(projectId: string): string {
  const base = baseDbPath();
  if (projectId === 'default') return base;
  const parsed = path.parse(base);
  return path.join(parsed.dir, `${parsed.name}.project-${projectId}${parsed.ext}`);
}

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    defaultLocation: row.default_location,
    defaultLanguage: row.default_language,
    defaultCoordinates: row.default_coordinates,
    rankTrackerDepth: row.rank_tracker_depth,
    createdAt: row.created_at,
  };
}

function legacySettings(): Record<string, string> {
  const legacyPath = baseDbPath();
  if (!fs.existsSync(legacyPath)) return {};
  const db = new Database(legacyPath, { readonly: true });
  try {
    const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get();
    if (!table) return {};
    const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  } finally {
    db.close();
  }
}

function getControlDb(): Database.Database {
  if (controlDb) return controlDb;

  const db = new Database(controlDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL UNIQUE,
      default_location TEXT NOT NULL DEFAULT '',
      default_language TEXT NOT NULL DEFAULT '',
      default_coordinates TEXT NOT NULL DEFAULT '',
      rank_tracker_depth TEXT NOT NULL DEFAULT '100',
      created_at INTEGER NOT NULL
    );
  `);

  const count = db.prepare('SELECT COUNT(*) AS count FROM projects').get() as { count: number };
  if (count.count === 0) {
    // The former single database is the data store for the initial project, so no
    // search history needs copying during the migration.
    const legacy = legacySettings();
    const domain = normalizeDomain(legacy.default_domain || '') || 'default.local';
    const now = Date.now();
    db.prepare(`INSERT INTO projects
      (id, name, domain, default_location, default_language, default_coordinates, rank_tracker_depth, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('default', 'Default Project', domain, legacy.default_location ?? '', legacy.default_language ?? '', legacy.default_coordinates ?? '', legacy.rank_tracker_depth ?? '100', now);
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('active_project_id', 'default');
    for (const key of ['dfs-login', 'dfs-pass']) {
      if (legacy[key]) db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(key, legacy[key]);
    }
  }

  controlDb = db;
  return db;
}

export function getProjects(): Project[] {
  const rows = getControlDb().prepare('SELECT * FROM projects ORDER BY created_at ASC').all() as ProjectRow[];
  return rows.map(projectFromRow);
}

export function getActiveProject(): Project {
  const db = getControlDb();
  const activeId = (db.prepare('SELECT value FROM app_settings WHERE key = ?').get('active_project_id') as { value: string } | undefined)?.value;
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(activeId) as ProjectRow | undefined;
  if (row) return projectFromRow(row);

  const fallback = db.prepare('SELECT * FROM projects ORDER BY created_at ASC LIMIT 1').get() as ProjectRow;
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('active_project_id', fallback.id);
  return projectFromRow(fallback);
}

/** The global UI selection is intentionally separate from this operation's project. */
export function getCurrentProject(): Project {
  const projectId = projectScope.getStore();
  if (projectId === undefined) return getActiveProject();
  const row = getControlDb().prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as ProjectRow | undefined;
  if (!row) throw new Error('Project not found.');
  return projectFromRow(row);
}

/** Explicit scope for an operation; deleted projects never fall back to the UI selection. */
export function runInProjectScope<T>(projectId: string, operation: () => T): T {
  if (!projectExists(projectId)) throw new Error('Project not found.');
  return projectScope.run(projectId, operation);
}

/** Capture synchronously, before authentication/searchParams/network awaits. Nested calls reuse the scope. */
export function runWithCurrentProject<T>(operation: () => T): T {
  return runInProjectScope(getCurrentProject().id, operation);
}

/**
 * Wrap each server page, not its layout: React renders child components separately.
 * This covers the function's async work, not deferred child Server Components.
 * Server actions must remain exported async functions and call runWithCurrentProject inside.
 * This is identity routing, not authorization or per-user project selection.
 */
export function withProjectScope<Args extends unknown[], Result>(operation: (...args: Args) => Promise<Result>) {
  return async (...args: Args): Promise<Result> => runWithCurrentProject(() => operation(...args));
}

export function createProject(input: Pick<Project, 'name' | 'domain' | 'defaultLocation' | 'defaultLanguage' | 'defaultCoordinates' | 'rankTrackerDepth'>): Project {
  const name = input.name.trim();
  const domain = normalizeDomain(input.domain);
  if (!name) throw new Error('A project name is required.');
  if (!domain) throw new Error('A domain is required.');
  const id = randomUUID();
  try {
    getControlDb().prepare(`INSERT INTO projects
      (id, name, domain, default_location, default_language, default_coordinates, rank_tracker_depth, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, name, domain, input.defaultLocation.trim(), input.defaultLanguage.trim(), input.defaultCoordinates.trim(), input.rankTrackerDepth || '100', Date.now());
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: projects\.domain/.test(error.message)) {
      throw new Error('A project already exists for this domain.');
    }
    throw error;
  }
  return getProjects().find((project) => project.id === id)!;
}

export function updateProject(id: string, input: Pick<Project, 'name' | 'domain' | 'defaultLocation' | 'defaultLanguage' | 'defaultCoordinates' | 'rankTrackerDepth'>): void {
  const name = input.name.trim();
  const domain = normalizeDomain(input.domain);
  if (!name) throw new Error('A project name is required.');
  if (!domain) throw new Error('A domain is required.');
  try {
    const result = getControlDb().prepare(`UPDATE projects SET
      name = ?, domain = ?, default_location = ?, default_language = ?, default_coordinates = ?, rank_tracker_depth = ?
      WHERE id = ?`)
      .run(name, domain, input.defaultLocation.trim(), input.defaultLanguage.trim(), input.defaultCoordinates.trim(), input.rankTrackerDepth || '100', id);
    if (result.changes === 0) throw new Error('Project not found.');
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: projects\.domain/.test(error.message)) {
      throw new Error('A project already exists for this domain.');
    }
    throw error;
  }
}

export function projectExists(id: string): boolean {
  return Boolean(getControlDb().prepare('SELECT 1 FROM projects WHERE id = ?').get(id));
}

export function setActiveProject(id: string): void {
  const exists = getControlDb().prepare('SELECT 1 FROM projects WHERE id = ?').get(id);
  if (!exists) throw new Error('Project not found.');
  getControlDb().prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('active_project_id', id);
}

export function deleteProject(id: string): void {
  const db = getControlDb();
  const projects = getProjects();
  if (projects.length === 1) throw new Error('You need at least one project.');
  const project = projects.find((item) => item.id === id);
  if (!project) throw new Error('Project not found.');
  const active = getActiveProject();
  if (active.id === id) db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('active_project_id', projects.find((item) => item.id !== id)!.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);

  const dataDb = dataDbs.get(id);
  if (dataDb) {
    dataDb.close();
    dataDbs.delete(id);
  }
  const projectPath = dataDbPath(id);
  if (fs.existsSync(projectPath)) fs.unlinkSync(projectPath);
  for (const suffix of ['-wal', '-shm']) {
    const auxiliaryPath = `${projectPath}${suffix}`;
    if (fs.existsSync(auxiliaryPath)) fs.unlinkSync(auxiliaryPath);
  }
}

function getDbForProject(projectId: string): Database.Database {
  // Check even cached handles: deletion by another process must not resurrect a data file.
  if (!projectExists(projectId)) throw new Error('Project not found.');
  const existing = dataDbs.get(projectId);
  if (existing) return existing;
  const db = new Database(dataDbPath(projectId));
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  initSchema(db);
  seedLocations(db);
  seedCategories(db);
  dataDbs.set(projectId, db);
  return db;
}

function getDb(): Database.Database {
  return getDbForProject(getCurrentProject().id);
}

/**
 * Data store for feature modules that keep their own tables (e.g. review-velocity-db.ts).
 * With an explicit ID (cron, workers) the project must still exist; without one it uses the operation's scope.
 */
export function getProjectDataDb(projectId?: string): Database.Database {
  return projectId ? getDbForProject(projectId) : getDb();
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS serp_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      keyword TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      device TEXT NOT NULL,
      depth INTEGER NOT NULL,
      result_count INTEGER NOT NULL,
      items TEXT NOT NULL,
      target_hits TEXT,
      cost REAL
    );

    CREATE TABLE IF NOT EXISTS kd_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      se TEXT NOT NULL,
      se_type TEXT NOT NULL,
      label TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      params TEXT NOT NULL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lf_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      keyword TEXT NOT NULL,
      location TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      params TEXT NOT NULL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS target_domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kw_overview_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      keywords TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );



    CREATE TABLE IF NOT EXISTS backlinks_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target TEXT NOT NULL,
      cost REAL,
      result TEXT NOT NULL,
      links TEXT,
      links_total INTEGER
    );

    CREATE TABLE IF NOT EXISTS competitors_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ranked_kw_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS onpage_tasks (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      url TEXT NOT NULL,
      target TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      cost REAL,
      error_message TEXT,
      result TEXT
    );

    CREATE TABLE IF NOT EXISTS tracked_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      domain TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT 'France',
      language TEXT NOT NULL DEFAULT 'fr',
      created_at INTEGER NOT NULL,
      UNIQUE(keyword, domain, location, language)
    );

    CREATE TABLE IF NOT EXISTS rank_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword_id INTEGER NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
      checked_at INTEGER NOT NULL,
      date TEXT NOT NULL,
      position INTEGER,
      url TEXT,
      title TEXT,
      cost REAL
    );

    CREATE TABLE IF NOT EXISTS rank_tasks (
      task_id TEXT PRIMARY KEY,
      keyword_id INTEGER NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      cost REAL,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS rank_tracker_schedules (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      time_of_day TEXT NOT NULL,
      time_zone TEXT NOT NULL,
      next_run_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ref_domains_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target TEXT NOT NULL,
      cost REAL,
      total INTEGER,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS anchors_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target TEXT NOT NULL,
      cost REAL,
      total INTEGER,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hist_rank_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      date_from TEXT NOT NULL DEFAULT '',
      date_to TEXT NOT NULL DEFAULT '',
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS domain_intersection_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target1 TEXT NOT NULL,
      target2 TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kw_difficulty_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      keywords TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS related_kw_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      keyword TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      depth INTEGER NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS grid_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      series_id TEXT NOT NULL DEFAULT '',
      keyword TEXT NOT NULL,
      target TEXT NOT NULL,
      center TEXT NOT NULL,
      grid_size INTEGER NOT NULL,
      spacing_km REAL NOT NULL,
      language TEXT NOT NULL,
      cost REAL,
      results TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS grid_schedules (
      series_id TEXT PRIMARY KEY,
      keyword TEXT NOT NULL,
      target TEXT NOT NULL,
      center TEXT NOT NULL,
      grid_size INTEGER NOT NULL,
      spacing_km REAL NOT NULL,
      language TEXT NOT NULL,
      queue_mode TEXT NOT NULL DEFAULT 'standard',
      frequency TEXT NOT NULL,
      weekday INTEGER,
      time_of_day TEXT NOT NULL DEFAULT '08:00',
      time_zone TEXT NOT NULL DEFAULT 'UTC',
      next_run_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS instant_page_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      url TEXT NOT NULL,
      cost REAL,
      result TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews_tasks (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      business TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      depth INTEGER NOT NULL,
      sort_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      cost REAL,
      result_count INTEGER,
      result TEXT
    );

    CREATE TABLE IF NOT EXISTS site_audit_tasks (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target TEXT NOT NULL,
      start_url TEXT,
      max_crawl_pages INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      pages_crawled INTEGER,
      cost REAL,
      error_message TEXT,
      summary TEXT,
      pages TEXT
    );

    CREATE TABLE IF NOT EXISTS top_searches_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      limit_count INTEGER NOT NULL,
      result_count INTEGER NOT NULL,
      total_count INTEGER,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS domain_tech_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target TEXT NOT NULL,
      cost REAL,
      result TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS domain_find_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      mode TEXT NOT NULL,
      query TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      total_count INTEGER,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS domain_whois_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      domain TEXT NOT NULL,
      cost REAL,
      result TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bl_ref_networks (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bl_page_intersection (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      targets TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bl_domain_intersection (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target1 TEXT NOT NULL,
      target2 TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bl_history (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bl_bulk_backlinks (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      targets TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bl_bulk_ref_domains (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      targets TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bl_broken (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target TEXT NOT NULL,
      dofollow_only INTEGER NOT NULL DEFAULT 0,
      result_count INTEGER NOT NULL,
      total INTEGER,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS keyword_ideas_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      keyword TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_intent_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      keywords TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS page_intersection_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      pages TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS domain_categories_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subdomains_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS traffic_estimation_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      targets TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_kwdata_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      keywords TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS llm_response_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      platform TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT NOT NULL,
      web_search INTEGER NOT NULL DEFAULT 0,
      cost REAL,
      result TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_visibility_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      mode TEXT NOT NULL,
      target TEXT NOT NULL,
      platform TEXT NOT NULL,
      cost REAL,
      result TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fan_out_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      seeds TEXT NOT NULL,
      platform TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      seed_count INTEGER NOT NULL,
      query_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL,
      seed_summary TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS llm_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt TEXT NOT NULL,
      platform TEXT NOT NULL,
      model TEXT NOT NULL,
      web_search INTEGER NOT NULL DEFAULT 0,
      country_code TEXT NOT NULL DEFAULT '',
      brand TEXT NOT NULL DEFAULT '',
      domain TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS llm_prompt_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id INTEGER NOT NULL REFERENCES llm_prompts(id) ON DELETE CASCADE,
      checked_at INTEGER NOT NULL,
      date TEXT NOT NULL,
      platform TEXT NOT NULL,
      model TEXT NOT NULL,
      mentioned INTEGER NOT NULL DEFAULT 0,
      brand_mentions INTEGER NOT NULL DEFAULT 0,
      domain_cited INTEGER NOT NULL DEFAULT 0,
      answer TEXT,
      sources TEXT,
      cost REAL,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS llm_prompt_schedules (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      time_of_day TEXT NOT NULL,
      time_zone TEXT NOT NULL,
      next_run_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_optimization_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      target TEXT NOT NULL,
      target_type TEXT NOT NULL,
      platform TEXT NOT NULL,
      location TEXT NOT NULL,
      language TEXT NOT NULL,
      limit_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS web_mentions_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      keyword TEXT NOT NULL,
      page_types TEXT NOT NULL,
      limit_count INTEGER NOT NULL,
      total_count INTEGER,
      cost REAL,
      items TEXT NOT NULL,
      summary TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dfs_locations (
      location_code INTEGER PRIMARY KEY,
      location_name TEXT NOT NULL,
      country_iso_code TEXT NOT NULL,
      location_type TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dfs_categories (
      category_code INTEGER PRIMARY KEY,
      category_name TEXT NOT NULL,
      category_code_parent INTEGER
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_dfs_locations_name ON dfs_locations(location_name)`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_rank_checks_kw ON rank_checks(keyword_id, checked_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rank_tasks_status ON rank_tasks(status, created_at ASC)`);
  // Before 0.6.0 two overlapping runs could leave two pending tasks for one keyword, which would
  // make the unique index below fail and the project unopenable. Keep the oldest, fail the others.
  db.prepare(`UPDATE rank_tasks
    SET status = 'failed', completed_at = ?, error_message = 'Duplicate pending check for this keyword.'
    WHERE status IN ('posting', 'pending') AND rowid NOT IN (
      SELECT MIN(rowid) FROM rank_tasks WHERE status IN ('posting', 'pending') GROUP BY keyword_id
    )`).run(Date.now());
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_rank_tasks_active_keyword ON rank_tasks(keyword_id) WHERE status IN ('posting', 'pending')`);

  // Migrations — add columns that may not exist in older DBs. Only the expected
  // "column already exists" error is swallowed; anything else (a real syntax error, a
  // locked/corrupt DB) rethrows instead of failing silently.
  addColumnIfMissing(db, 'serp_searches', 'ADD COLUMN target_hits TEXT');
  addColumnIfMissing(db, 'serp_searches', 'ADD COLUMN cost REAL');
  addColumnIfMissing(db, 'backlinks_searches', 'ADD COLUMN links TEXT');
  addColumnIfMissing(db, 'backlinks_searches', 'ADD COLUMN links_total INTEGER');
  addColumnIfMissing(db, 'grid_searches', `ADD COLUMN status TEXT NOT NULL DEFAULT 'done'`);
  addColumnIfMissing(db, 'grid_searches', 'ADD COLUMN task_ids TEXT');
  addColumnIfMissing(db, 'grid_searches', `ADD COLUMN queue_mode TEXT NOT NULL DEFAULT 'live'`);
  addColumnIfMissing(db, 'grid_searches', `ADD COLUMN series_id TEXT NOT NULL DEFAULT ''`);
  addColumnIfMissing(db, 'reviews_tasks', 'ADD COLUMN meta TEXT');
  addColumnIfMissing(db, 'rank_checks', 'ADD COLUMN ai_overview INTEGER');
  addColumnIfMissing(db, 'rank_checks', 'ADD COLUMN top_results TEXT');
  addColumnIfMissing(db, 'domain_find_searches', 'ADD COLUMN keyword TEXT');
  addColumnIfMissing(db, 'domain_find_searches', 'ADD COLUMN technology TEXT');
  addColumnIfMissing(db, 'hist_rank_searches', `ADD COLUMN date_from TEXT NOT NULL DEFAULT ''`);
  addColumnIfMissing(db, 'hist_rank_searches', `ADD COLUMN date_to TEXT NOT NULL DEFAULT ''`);

  backfillGridSeriesIds(db);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_grid_searches_series ON grid_searches(series_id, ts DESC)`);
}

/** Runs saved before monitors existed have no series_id; persist it so a series can be queried directly. */
function backfillGridSeriesIds(db: Database.Database): void {
  const rows = db.prepare(`SELECT id, keyword, center, grid_size, spacing_km, target, language FROM grid_searches WHERE series_id = ''`)
    .all() as Array<{ id: string; keyword: string; center: string; grid_size: number; spacing_km: number; target: string; language: string }>;
  if (rows.length === 0) return;
  const update = db.prepare('UPDATE grid_searches SET series_id = ? WHERE id = ?');
  db.transaction(() => {
    for (const row of rows) {
      update.run(gridSeriesId(row.keyword, row.center, row.grid_size, row.spacing_km, row.target, row.language), row.id);
    }
  })();
}

function addColumnIfMissing(db: Database.Database, table: string, alterClause: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ${alterClause}`);
  } catch (err) {
    if (err instanceof Error && /duplicate column name/i.test(err.message)) return;
    throw err;
  }
}

// --- DataForSEO locations (country/region/city picker) ---

function parseLocationsCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function seedLocations(db: Database.Database): void {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM dfs_locations').get() as { count: number };
  if (count > 0) return;

  const csvPath = path.join(process.cwd(), 'data', 'dfs-locations.csv');
  if (!fs.existsSync(csvPath)) return;

  const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(Boolean);
  const insert = db.prepare('INSERT OR IGNORE INTO dfs_locations (location_code, location_name, country_iso_code, location_type) VALUES (?, ?, ?, ?)');
  const insertAll = db.transaction((rows: string[][]) => {
    for (const row of rows) insert.run(Number(row[0]), row[1], row[2], row[3]);
  });
  const rows = lines.slice(1).map(parseLocationsCsvLine);
  insertAll(rows);
}

function seedCategories(db: Database.Database): void {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM dfs_categories').get() as { count: number };
  if (count > 0) return;

  const csvPath = path.join(process.cwd(), 'data', 'dfs-categories.csv');
  if (!fs.existsSync(csvPath)) return;

  const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(Boolean);
  const insert = db.prepare('INSERT OR IGNORE INTO dfs_categories (category_code, category_name, category_code_parent) VALUES (?, ?, ?)');
  const insertAll = db.transaction((rows: string[][]) => {
    for (const row of rows) insert.run(Number(row[0]), row[1], row[2] ? Number(row[2]) : null);
  });
  const rows = lines.slice(1).map(parseLocationsCsvLine);
  insertAll(rows);
}

/** Resolves a DataForSEO Labs category code to its full breadcrumb path, e.g. "Home & Garden > Home Improvement > Plumbing". */
export function getCategoryPath(code: number): string {
  const db = getDb();
  const row = db.prepare('SELECT category_code, category_name, category_code_parent FROM dfs_categories WHERE category_code = ?')
    .get(code) as { category_code: number; category_name: string; category_code_parent: number | null } | undefined;
  if (!row) return `Category ${code}`;

  const path = [row.category_name];
  let parentCode = row.category_code_parent;
  const seen = new Set([row.category_code]);
  while (parentCode !== null && !seen.has(parentCode)) {
    seen.add(parentCode);
    const parent = db.prepare('SELECT category_name, category_code_parent FROM dfs_categories WHERE category_code = ?')
      .get(parentCode) as { category_name: string; category_code_parent: number | null } | undefined;
    if (!parent) break;
    path.unshift(parent.category_name);
    parentCode = parent.category_code_parent;
  }
  return path.join(' > ');
}

export interface LocationOption {
  code: number;
  name: string;
  countryIso: string;
  type: string;
}

const LOCATION_TYPE_RANK = `CASE location_type
  WHEN 'Country' THEN 0
  WHEN 'Region' THEN 1 WHEN 'State' THEN 1 WHEN 'Province' THEN 1
  WHEN 'City' THEN 2 WHEN 'City Region' THEN 2
  WHEN 'County' THEN 3 WHEN 'Department' THEN 3 WHEN 'Municipality' THEN 3 WHEN 'Canton' THEN 3 WHEN 'Governorate' THEN 3
  WHEN 'District' THEN 4 WHEN 'Borough' THEN 4
  ELSE 5
END`;

export function searchLocations(query: string, limit = 20): LocationOption[] {
  const db = getDb();
  const tokens = query.trim().split(/\s+/).filter(Boolean);

  type Row = { location_code: number; location_name: string; country_iso_code: string; location_type: string };

  let rows: Row[];
  if (tokens.length === 0) {
    rows = db
      .prepare(`SELECT location_code, location_name, country_iso_code, location_type FROM dfs_locations WHERE location_type = 'Country' ORDER BY location_name ASC LIMIT ?`)
      .all(limit) as Row[];
  } else {
    const whereClause = tokens.map(() => 'location_name LIKE ?').join(' AND ');
    const whereParams = tokens.map((t) => `%${t}%`);
    rows = db
      .prepare(
        `SELECT location_code, location_name, country_iso_code, location_type FROM dfs_locations
         WHERE ${whereClause}
         ORDER BY
           (LOWER(location_name) = LOWER(?)) DESC,
           (location_name LIKE ?) DESC,
           ${LOCATION_TYPE_RANK} ASC,
           LENGTH(location_name) ASC
         LIMIT ?`
      )
      .all(...whereParams, query.trim(), `${tokens[0]},%`, limit) as Row[];
  }
  return rows.map((r) => ({ code: r.location_code, name: r.location_name, countryIso: r.country_iso_code, type: r.location_type }));
}

// --- Settings ---

export function getSetting(key: string): string | null {
  if (key in PROJECT_SETTING_COLUMNS) {
    const project = getCurrentProject();
    const column = PROJECT_SETTING_COLUMNS[key as keyof typeof PROJECT_SETTING_COLUMNS];
    return projectFromRow(getControlDb().prepare('SELECT * FROM projects WHERE id = ?').get(project.id) as ProjectRow)[column === 'default_location' ? 'defaultLocation' : column === 'default_language' ? 'defaultLanguage' : column === 'default_coordinates' ? 'defaultCoordinates' : column === 'rank_tracker_depth' ? 'rankTrackerDepth' : 'domain'];
  }
  const row = getControlDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  if (key in PROJECT_SETTING_COLUMNS) {
    const project = getCurrentProject();
    const current = project;
    updateProject(project.id, {
      name: current.name,
      domain: key === 'default_domain' ? value : current.domain,
      defaultLocation: key === 'default_location' ? value : current.defaultLocation,
      defaultLanguage: key === 'default_language' ? value : current.defaultLanguage,
      defaultCoordinates: key === 'default_coordinates' ? value : current.defaultCoordinates,
      rankTrackerDepth: key === 'rank_tracker_depth' ? value : current.rankTrackerDepth,
    });
    return;
  }
  getControlDb().prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
}

export function deleteSetting(key: string): void {
  if (key in PROJECT_SETTING_COLUMNS) {
    setSetting(key, '');
    return;
  }
  getControlDb().prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

// --- Credentials ---

export function getCredentials(): { login: string; pass: string } | null {
  const login = getSetting('dfs-login');
  const pass = getSetting('dfs-pass');
  if (!login || !pass) return null;
  return { login, pass };
}

export function saveCredentials(login: string, pass: string): void {
  setSetting('dfs-login', login);
  setSetting('dfs-pass', pass);
}

export function clearCredentials(): void {
  deleteSetting('dfs-login');
  deleteSetting('dfs-pass');
}

// --- Target domains ---

export function getTargetDomains(): string[] {
  const rows = getDb().prepare('SELECT domain FROM target_domains ORDER BY created_at DESC').all() as { domain: string }[];
  const projectDomain = getCurrentProject().domain;
  return [...new Set([projectDomain, ...rows.map((r) => r.domain)])];
}

export function addTargetDomain(domain: string): void {
  const clean = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  getDb().prepare('INSERT OR IGNORE INTO target_domains (domain, created_at) VALUES (?, ?)').run(clean, Date.now());
}

export function removeTargetDomain(domain: string): void {
  getDb().prepare('DELETE FROM target_domains WHERE domain = ?').run(domain);
}

// --- SERP history ---

export interface TargetHit {
  domain: string;
  position: number;
}

export interface SerpHistoryEntry {
  id: string;
  ts: number;
  keyword: string;
  location: string;
  language: string;
  device: string;
  depth: number;
  count: number;
  cost?: number;
  targetHits?: TargetHit[];
}

export function getSerpHistory(): SerpHistoryEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, keyword, location, language, device, depth, result_count, target_hits, cost FROM serp_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; keyword: string; location: string; language: string; device: string; depth: number; result_count: number; target_hits: string | null; cost: number | null }>;
  return rows.map((r) => ({
    ...r,
    count: r.result_count,
    cost: r.cost ?? undefined,
    targetHits: r.target_hits ? JSON.parse(r.target_hits) : undefined,
  }));
}

export function saveSerpSearch<T>(entry: SerpHistoryEntry, items: T[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO serp_searches (id, ts, keyword, location, language, device, depth, result_count, items, target_hits, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.keyword, entry.location, entry.language, entry.device, entry.depth, entry.count, JSON.stringify(items), entry.targetHits ? JSON.stringify(entry.targetHits) : null, entry.cost ?? null);
}

export function getSerpResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM serp_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Keyword Data history ---

export interface KdHistoryEntry {
  id: string;
  ts: number;
  se: string;
  seType: string;
  label: string;
  count: number;
  cost?: number;
  params: Record<string, string>;
}

export function getKdHistory(): KdHistoryEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, se, se_type, label, result_count, cost, params FROM kd_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; se: string; se_type: string; label: string; result_count: number; cost: number | null; params: string }>;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, se: r.se, seType: r.se_type, label: r.label,
    count: r.result_count, cost: r.cost ?? undefined, params: JSON.parse(r.params),
  }));
}

export function saveKdSearch<T>(entry: KdHistoryEntry, items: T[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO kd_searches (id, ts, se, se_type, label, result_count, cost, params, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.se, entry.seType, entry.label, entry.count, entry.cost ?? null, JSON.stringify(entry.params), JSON.stringify(items));
}

export function getKdResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM kd_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Local Finder history ---

export interface LfHistoryEntry {
  id: string;
  ts: number;
  keyword: string;
  location: string;
  count: number;
  cost?: number;
  params: Record<string, string>;
}

export function getLfHistory(): LfHistoryEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, keyword, location, result_count, cost, params FROM lf_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; keyword: string; location: string; result_count: number; cost: number | null; params: string }>;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, keyword: r.keyword, location: r.location,
    count: r.result_count, cost: r.cost ?? undefined, params: JSON.parse(r.params),
  }));
}

export function saveLfSearch<T>(entry: LfHistoryEntry, items: T[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO lf_searches (id, ts, keyword, location, result_count, cost, params, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.keyword, entry.location, entry.count, entry.cost ?? null, JSON.stringify(entry.params), JSON.stringify(items));
}

export function getLfResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM lf_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- OnPage tasks ---

export interface OnpageTask {
  id: string;
  ts: number;
  url: string;
  target: string;
  status: 'pending' | 'in_progress' | 'finished' | 'error';
  cost?: number;
  errorMessage?: string;
}

export function getOnpageTasks(): OnpageTask[] {
  const rows = getDb().prepare('SELECT id, ts, url, target, status, cost, error_message FROM onpage_tasks ORDER BY ts DESC LIMIT 30').all() as Array<{
    id: string; ts: number; url: string; target: string; status: string; cost: number | null; error_message: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, url: r.url, target: r.target,
    status: r.status as OnpageTask['status'],
    cost: r.cost ?? undefined,
    errorMessage: r.error_message ?? undefined,
  }));
}

export function upsertOnpageTask(task: OnpageTask): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO onpage_tasks (id, ts, url, target, status, cost, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(task.id, task.ts, task.url, task.target, task.status, task.cost ?? null, task.errorMessage ?? null);
}

export function getOnpageResult<T>(taskId: string): T | null {
  const row = getDb().prepare('SELECT result FROM onpage_tasks WHERE id = ?').get(taskId) as { result: string | null } | undefined;
  if (!row?.result) return null;
  try { return JSON.parse(row.result) as T; } catch { return null; }
}

export function saveOnpageResult<T>(taskId: string, result: T): void {
  getDb().prepare('UPDATE onpage_tasks SET result = ?, status = ? WHERE id = ?').run(JSON.stringify(result), 'finished', taskId);
}

// --- Ranked Keywords ---

export interface RankedKwSearchEntry {
  id: string;
  ts: number;
  target: string;
  location: string;
  language: string;
  count: number;
  totalCount: number;
  cost?: number;
}

export function getRankedKwHistory(): RankedKwSearchEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, target, location, language, result_count, total_count, cost FROM ranked_kw_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; target: string; location: string; language: string; result_count: number; total_count: number; cost: number | null }>;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, target: r.target, location: r.location, language: r.language,
    count: r.result_count, totalCount: r.total_count, cost: r.cost ?? undefined,
  }));
}

export function saveRankedKwSearch<T>(entry: RankedKwSearchEntry, items: T[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO ranked_kw_searches (id, ts, target, location, language, result_count, total_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.target, entry.location, entry.language, entry.count, entry.totalCount, entry.cost ?? null, JSON.stringify(items));
}

export function getRankedKwResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM ranked_kw_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Keyword Overview ---

export interface KwOverviewSearchEntry {
  id: string;
  ts: number;
  keywords: string;
  location: string;
  language: string;
  count: number;
  cost?: number;
}

export function getKwOverviewHistory(): KwOverviewSearchEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, keywords, location, language, result_count, cost FROM kw_overview_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; keywords: string; location: string; language: string; result_count: number; cost: number | null }>;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, keywords: r.keywords, location: r.location, language: r.language,
    count: r.result_count, cost: r.cost ?? undefined,
  }));
}

export function saveKwOverviewSearch<T>(entry: KwOverviewSearchEntry, items: T[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO kw_overview_searches (id, ts, keywords, location, language, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.keywords, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items));
}

export function getKwOverviewResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM kw_overview_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Backlinks ---

export interface BacklinksSearchEntry {
  id: string;
  ts: number;
  target: string;
  cost?: number;
  linksTotal?: number;
}

export function getBacklinksHistory(): BacklinksSearchEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, target, cost, links_total FROM backlinks_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; target: string; cost: number | null; links_total: number | null }>;
  return rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, cost: r.cost ?? undefined, linksTotal: r.links_total ?? undefined }));
}

export function saveBacklinksSearch<T, L>(entry: BacklinksSearchEntry, result: T, links?: L[], linksTotal?: number): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO backlinks_searches (id, ts, target, cost, result, links, links_total) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.target, entry.cost ?? null, JSON.stringify(result), links ? JSON.stringify(links) : null, linksTotal ?? null);
}

export function getBacklinksResult<T>(id: string): T | null {
  const row = getDb().prepare('SELECT result FROM backlinks_searches WHERE id = ?').get(id) as { result: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.result) as T; } catch { return null; }
}

export function getBacklinksLinks<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT links FROM backlinks_searches WHERE id = ?').get(id) as { links: string | null } | undefined;
  if (!row?.links) return null;
  try { return JSON.parse(row.links) as T[]; } catch { return null; }
}

// --- Competitors ---

export interface CompetitorsSearchEntry {
  id: string;
  ts: number;
  target: string;
  location: string;
  language: string;
  count: number;
  cost?: number;
}

export function getCompetitorsHistory(): CompetitorsSearchEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, target, location, language, result_count, cost FROM competitors_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; target: string; location: string; language: string; result_count: number; cost: number | null }>;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, target: r.target, location: r.location, language: r.language,
    count: r.result_count, cost: r.cost ?? undefined,
  }));
}

export function saveCompetitorsSearch<T>(entry: CompetitorsSearchEntry, items: T[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO competitors_searches (id, ts, target, location, language, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.target, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items));
}

export function getCompetitorsResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM competitors_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Rank Tracker ---

export interface TrackedKeyword {
  id: number;
  keyword: string;
  domain: string;
  location: string;
  language: string;
  createdAt: number;
}

export interface RankCheck {
  id: number;
  keywordId: number;
  checkedAt: number;
  date: string;
  position: number | null;
  url: string | null;
  title: string | null;
  cost: number | null;
  /** Whether the AI Overview cited the domain; null when there was none or the check predates this. */
  aiOverview: boolean | null;
}

export function getTrackedKeywords(): TrackedKeyword[] {
  return trackedKeywordsFromDb(getDb());
}

function trackedKeywordsFromDb(db: Database.Database): TrackedKeyword[] {
  const rows = db.prepare('SELECT id, keyword, domain, location, language, created_at FROM tracked_keywords ORDER BY created_at DESC').all() as Array<{
    id: number; keyword: string; domain: string; location: string; language: string; created_at: number;
  }>;
  return rows.map((r) => ({ id: r.id, keyword: r.keyword, domain: r.domain, location: r.location, language: r.language, createdAt: r.created_at }));
}

export function getTrackedKeywordsForProject(projectId: string): TrackedKeyword[] {
  return trackedKeywordsFromDb(getDbForProject(projectId));
}

export function addTrackedKeyword(keyword: string, domain: string, location: string, language: string): number {
  const result = getDb().prepare(
    'INSERT OR IGNORE INTO tracked_keywords (keyword, domain, location, language, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(keyword.trim(), domain.trim(), location, language, Date.now());
  if (result.changes === 0) {
    const row = getDb().prepare('SELECT id FROM tracked_keywords WHERE keyword = ? AND domain = ? AND location = ? AND language = ?').get(keyword.trim(), domain.trim(), location, language) as { id: number };
    return row.id;
  }
  return result.lastInsertRowid as number;
}

export function removeTrackedKeyword(id: number): void {
  getDb().prepare('DELETE FROM rank_tasks WHERE keyword_id = ?').run(id);
  getDb().prepare('DELETE FROM tracked_keywords WHERE id = ?').run(id);
}

type RankCheckResult = { position: number | null; url: string | null; title: string | null; aiOverview: boolean | null; topResults: RankTopResult[] | null };

function topResultsValue(topResults: RankTopResult[] | null): string | null {
  return topResults && topResults.length > 0 ? JSON.stringify(topResults) : null;
}

function parseTopResults(raw: string | null): RankTopResult[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as RankTopResult[] : null;
  } catch {
    return null;
  }
}

type RankCheckRow = { id: number; keyword_id: number; checked_at: number; date: string; position: number | null; url: string | null; title: string | null; cost: number | null; ai_overview: number | null };

function rankCheckFromRow(r: RankCheckRow): RankCheck {
  return {
    id: r.id, keywordId: r.keyword_id, checkedAt: r.checked_at, date: r.date, position: r.position, url: r.url, title: r.title,
    cost: r.cost, aiOverview: r.ai_overview === null ? null : r.ai_overview === 1,
  };
}

function aiOverviewValue(aiOverview: boolean | null): number | null {
  return aiOverview === null ? null : aiOverview ? 1 : 0;
}

export function saveRankCheck(keywordId: number, result: RankCheckResult, cost: number | null): void {
  const now = Date.now();
  const date = new Date(now).toISOString().split('T')[0];
  const aiOverview = aiOverviewValue(result.aiOverview);
  // Only one check per day per keyword — upsert by date
  const existing = getDb().prepare('SELECT id FROM rank_checks WHERE keyword_id = ? AND date = ?').get(keywordId, date) as { id: number } | undefined;
  if (existing) {
    getDb().prepare('UPDATE rank_checks SET checked_at = ?, position = ?, url = ?, title = ?, cost = ?, ai_overview = ?, top_results = ? WHERE id = ?')
      .run(now, result.position, result.url, result.title, cost, aiOverview, topResultsValue(result.topResults), existing.id);
  } else {
    getDb().prepare('INSERT INTO rank_checks (keyword_id, checked_at, date, position, url, title, cost, ai_overview, top_results) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(keywordId, now, date, result.position, result.url, result.title, cost, aiOverview, topResultsValue(result.topResults));
  }
}

export interface PendingRankTask {
  taskId: string;
  keywordId: number;
  domain: string;
  cost: number | null;
}

export interface RankTaskReservation {
  reservationId: string;
  keywordId: number;
}

function pendingRankTasksFromDb(db: Database.Database): PendingRankTask[] {
  const rows = db.prepare(`SELECT rank_tasks.task_id, rank_tasks.keyword_id, tracked_keywords.domain, rank_tasks.cost
    FROM rank_tasks JOIN tracked_keywords ON tracked_keywords.id = rank_tasks.keyword_id
    WHERE rank_tasks.status = 'pending' ORDER BY rank_tasks.created_at ASC`).all() as Array<{
      task_id: string; keyword_id: number; domain: string; cost: number | null;
    }>;
  return rows.map((row) => ({ taskId: row.task_id, keywordId: row.keyword_id, domain: row.domain, cost: row.cost }));
}

function reserveRankTasksToDb(db: Database.Database, keywordIds: number[]): RankTaskReservation[] {
  const now = Date.now();
  const reservations: RankTaskReservation[] = [];
  const stmt = db.prepare(`INSERT OR IGNORE INTO rank_tasks
    (task_id, keyword_id, status, cost, created_at, completed_at, error_message)
    VALUES (?, ?, 'posting', NULL, ?, NULL, NULL)`);
  db.transaction(() => {
    for (const keywordId of keywordIds) {
      const reservationId = `posting:${keywordId}:${randomUUID()}`;
      const result = stmt.run(reservationId, keywordId, now);
      if (result.changes > 0) reservations.push({ reservationId, keywordId });
    }
  })();
  return reservations;
}

export function reserveRankTasksForProject(projectId: string, keywordIds: number[]): RankTaskReservation[] {
  return reserveRankTasksToDb(getDbForProject(projectId), keywordIds);
}

export function confirmRankTaskReservationForProject(projectId: string, reservationId: string, taskId: string, cost: number | null): boolean {
  const result = getDbForProject(projectId).prepare(`UPDATE rank_tasks
    SET task_id = ?, status = 'pending', cost = ?, error_message = NULL
    WHERE task_id = ? AND status = 'posting'`).run(taskId, cost, reservationId);
  return result.changes > 0;
}

export function failRankTaskReservationForProject(projectId: string, reservationId: string, errorMessage: string): void {
  getDbForProject(projectId).prepare(`UPDATE rank_tasks
    SET status = 'failed', completed_at = ?, error_message = ?
    WHERE task_id = ? AND status = 'posting'`).run(Date.now(), errorMessage.slice(0, 500), reservationId);
}

/** Stores the task_post cost, the price of the full depth; completing the task replaces it with the amount billed. */
export function savePendingRankTask(keywordId: number, taskId: string, cost: number | null): void {
  savePendingRankTaskToDb(getDb(), keywordId, taskId, cost);
}

function savePendingRankTaskToDb(db: Database.Database, keywordId: number, taskId: string, cost: number | null): void {
  db.prepare(`INSERT OR REPLACE INTO rank_tasks
    (task_id, keyword_id, status, cost, created_at, completed_at, error_message)
    VALUES (?, ?, 'pending', ?, ?, NULL, NULL)`).run(taskId, keywordId, cost, Date.now());
}

export function savePendingRankTaskForProject(projectId: string, keywordId: number, taskId: string, cost: number | null): void {
  savePendingRankTaskToDb(getDbForProject(projectId), keywordId, taskId, cost);
}

export function getPendingRankTasks(): PendingRankTask[] {
  return pendingRankTasksFromDb(getDb());
}

export function getPendingRankTasksForProject(projectId: string): PendingRankTask[] {
  return pendingRankTasksFromDb(getDbForProject(projectId));
}

export function completeRankTaskForProject(
  projectId: string, taskId: string, result: RankCheckResult, billedCost: number | null,
): void {
  const db = getDbForProject(projectId);
  const task = db.prepare('SELECT keyword_id FROM rank_tasks WHERE task_id = ?').get(taskId) as { keyword_id: number } | undefined;
  if (!task) return;
  const now = Date.now();
  const date = new Date(now).toISOString().split('T')[0];
  const existing = db.prepare('SELECT id FROM rank_checks WHERE keyword_id = ? AND date = ?').get(task.keyword_id, date) as { id: number } | undefined;
  if (existing) {
    db.prepare('UPDATE rank_checks SET checked_at = ?, position = ?, url = ?, title = ?, ai_overview = ?, top_results = ? WHERE id = ?')
      .run(now, result.position, result.url, result.title, aiOverviewValue(result.aiOverview), topResultsValue(result.topResults), existing.id);
  } else {
    // task_post quotes the full depth; a crawl stopped on the match is billed for fewer pages.
    const cost = billedCost !== null ? { cost: billedCost }
      : db.prepare('SELECT cost FROM rank_tasks WHERE task_id = ?').get(taskId) as { cost: number | null };
    db.prepare('INSERT INTO rank_checks (keyword_id, checked_at, date, position, url, title, cost, ai_overview, top_results) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(task.keyword_id, now, date, result.position, result.url, result.title, cost.cost, aiOverviewValue(result.aiOverview), topResultsValue(result.topResults));
  }
  db.prepare(`UPDATE rank_tasks SET status = 'done', completed_at = ?, error_message = NULL, cost = COALESCE(?, cost) WHERE task_id = ?`).run(now, billedCost, taskId);
}

export function failRankTaskForProject(projectId: string, taskId: string, errorMessage: string): void {
  getDbForProject(projectId).prepare(`UPDATE rank_tasks
    SET status = 'failed', completed_at = ?, error_message = ? WHERE task_id = ?`)
    .run(Date.now(), errorMessage.slice(0, 500), taskId);
}

export interface RankTrackerSchedule {
  timeOfDay: string;
  timeZone: string;
  nextRunAt: number;
}

export interface DueRankTrackerSchedule extends RankTrackerSchedule {
  projectId: string;
  depth: string;
}

function rankScheduleFromRow(row: { time_of_day: string; time_zone: string; next_run_at: number }): RankTrackerSchedule {
  return { timeOfDay: row.time_of_day, timeZone: row.time_zone, nextRunAt: row.next_run_at };
}

export function getRankTrackerSchedule(): RankTrackerSchedule | null {
  const row = getDb().prepare('SELECT time_of_day, time_zone, next_run_at FROM rank_tracker_schedules WHERE id = 1')
    .get() as { time_of_day: string; time_zone: string; next_run_at: number } | undefined;
  return row ? rankScheduleFromRow(row) : null;
}

export function saveRankTrackerSchedule(input: { timeOfDay: string; timeZone: string }): RankTrackerSchedule {
  const now = Date.now();
  const timeOfDay = validTimeOfDay(input.timeOfDay);
  const timeZone = validTimeZone(input.timeZone);
  const nextRunAt = nextDailyRun(timeOfDay, timeZone, now);
  getDb().prepare(`INSERT INTO rank_tracker_schedules (id, time_of_day, time_zone, next_run_at, created_at, updated_at)
    VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET time_of_day = excluded.time_of_day, time_zone = excluded.time_zone,
      next_run_at = excluded.next_run_at, updated_at = excluded.updated_at`)
    .run(timeOfDay, timeZone, nextRunAt, now, now);
  return { timeOfDay, timeZone, nextRunAt };
}

export function deleteRankTrackerSchedule(): void {
  getDb().prepare('DELETE FROM rank_tracker_schedules WHERE id = 1').run();
}

/** Claims due daily rank runs across projects so overlapping worker requests cannot duplicate a batch. */
export function claimDueRankTrackerSchedules(now = Date.now()): DueRankTrackerSchedule[] {
  const due: DueRankTrackerSchedule[] = [];
  for (const project of getProjects()) {
    const db = getDbForProject(project.id);
    const row = db.prepare('SELECT time_of_day, time_zone, next_run_at FROM rank_tracker_schedules WHERE id = 1 AND next_run_at <= ?')
      .get(now) as { time_of_day: string; time_zone: string; next_run_at: number } | undefined;
    if (!row) continue;
    const schedule = rankScheduleFromRow(row);
    const nextRunAt = nextDailyRun(schedule.timeOfDay, schedule.timeZone, now);
    const claimed = db.prepare('UPDATE rank_tracker_schedules SET next_run_at = ?, updated_at = ? WHERE id = 1 AND next_run_at = ?')
      .run(nextRunAt, now, schedule.nextRunAt);
    if (claimed.changes === 1) due.push({ ...schedule, nextRunAt, projectId: project.id, depth: project.rankTrackerDepth });
  }
  return due;
}

/** Reopens a claimed daily run after an upstream posting failure. */
export function retryClaimedRankTrackerSchedule(projectId: string, claimedNextRunAt: number, now = Date.now()): void {
  getDbForProject(projectId).prepare(`UPDATE rank_tracker_schedules SET next_run_at = ?, updated_at = ?
    WHERE id = 1 AND next_run_at = ?`).run(now + 5 * 60_000, now, claimedNextRunAt);
}

// top_results is left out: it is loaded on demand, not with every row of the keyword list.
const RANK_CHECK_COLUMNS = 'id, keyword_id, checked_at, date, position, url, title, cost, ai_overview';

export function getRankHistory(keywordId: number, days = 30): RankCheck[] {
  const rows = getDb().prepare(
    `SELECT ${RANK_CHECK_COLUMNS} FROM rank_checks WHERE keyword_id = ? ORDER BY date DESC LIMIT ?`
  ).all(keywordId, days) as RankCheckRow[];
  return rows.map(rankCheckFromRow);
}

export function getLatestRankCheck(keywordId: number): RankCheck | null {
  const row = getDb().prepare(
    `SELECT ${RANK_CHECK_COLUMNS} FROM rank_checks WHERE keyword_id = ? ORDER BY date DESC LIMIT 1`
  ).get(keywordId) as RankCheckRow | undefined;
  return row ? rankCheckFromRow(row) : null;
}

export interface RankTopResultsCheck {
  date: string;
  position: number | null;
  topResults: RankTopResult[];
}

/** Checks that saved their first results page, newest first. Older checks predate the feature and are skipped. */
export function getRankTopResultsHistory(keywordId: number, days = 30): RankTopResultsCheck[] {
  const rows = getDb().prepare(
    'SELECT date, position, top_results FROM rank_checks WHERE keyword_id = ? AND top_results IS NOT NULL ORDER BY date DESC LIMIT ?'
  ).all(keywordId, days) as Array<{ date: string; position: number | null; top_results: string }>;
  return rows.flatMap((row) => {
    const topResults = parseTopResults(row.top_results);
    return topResults ? [{ date: row.date, position: row.position, topResults }] : [];
  });
}

// --- Referring Domains ---

export interface RefDomainsSearchEntry {
  id: string;
  ts: number;
  target: string;
  cost?: number;
  total?: number;
}

export function getRefDomainsHistory(): RefDomainsSearchEntry[] {
  const rows = getDb().prepare('SELECT id, ts, target, cost, total FROM ref_domains_searches ORDER BY ts DESC LIMIT 30').all() as Array<{
    id: string; ts: number; target: string; cost: number | null; total: number | null;
  }>;
  return rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, cost: r.cost ?? undefined, total: r.total ?? undefined }));
}

export function saveRefDomainsSearch<T>(entry: RefDomainsSearchEntry, items: T[]): void {
  getDb().prepare('INSERT OR REPLACE INTO ref_domains_searches (id, ts, target, cost, total, items) VALUES (?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.target, entry.cost ?? null, entry.total ?? null, JSON.stringify(items));
}

export function getRefDomainsResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM ref_domains_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Anchors ---

export interface AnchorsSearchEntry {
  id: string;
  ts: number;
  target: string;
  cost?: number;
  total?: number;
}

export function getAnchorsHistory(): AnchorsSearchEntry[] {
  const rows = getDb().prepare('SELECT id, ts, target, cost, total FROM anchors_searches ORDER BY ts DESC LIMIT 30').all() as Array<{
    id: string; ts: number; target: string; cost: number | null; total: number | null;
  }>;
  return rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, cost: r.cost ?? undefined, total: r.total ?? undefined }));
}

export function saveAnchorsSearch<T>(entry: AnchorsSearchEntry, items: T[]): void {
  getDb().prepare('INSERT OR REPLACE INTO anchors_searches (id, ts, target, cost, total, items) VALUES (?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.target, entry.cost ?? null, entry.total ?? null, JSON.stringify(items));
}

export function getAnchorsResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM anchors_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Historical Rank Overview ---

export interface HistRankSearchEntry {
  id: string;
  ts: number;
  target: string;
  location: string;
  language: string;
  dateFrom?: string;
  dateTo?: string;
  cost?: number;
}

export function getHistRankHistory(): HistRankSearchEntry[] {
  const rows = getDb().prepare('SELECT id, ts, target, location, language, date_from, date_to, cost FROM hist_rank_searches ORDER BY ts DESC LIMIT 30').all() as Array<{
    id: string; ts: number; target: string; location: string; language: string; date_from: string; date_to: string; cost: number | null;
  }>;
  return rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, location: r.location, language: r.language, dateFrom: r.date_from || undefined, dateTo: r.date_to || undefined, cost: r.cost ?? undefined }));
}

export function saveHistRankSearch<T>(entry: HistRankSearchEntry, items: T[]): void {
  getDb().prepare('INSERT OR REPLACE INTO hist_rank_searches (id, ts, target, location, language, date_from, date_to, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.target, entry.location, entry.language, entry.dateFrom ?? '', entry.dateTo ?? '', entry.cost ?? null, JSON.stringify(items));
}

export function getHistRankResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM hist_rank_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Domain Intersection ---

export interface DomainIntersectionSearchEntry {
  id: string;
  ts: number;
  target1: string;
  target2: string;
  location: string;
  language: string;
  count: number;
  totalCount: number;
  cost?: number;
}

export function getDomainIntersectionHistory(): DomainIntersectionSearchEntry[] {
  const rows = getDb().prepare('SELECT id, ts, target1, target2, location, language, result_count, total_count, cost FROM domain_intersection_searches ORDER BY ts DESC LIMIT 30').all() as Array<{
    id: string; ts: number; target1: string; target2: string; location: string; language: string; result_count: number; total_count: number; cost: number | null;
  }>;
  return rows.map((r) => ({ id: r.id, ts: r.ts, target1: r.target1, target2: r.target2, location: r.location, language: r.language, count: r.result_count, totalCount: r.total_count, cost: r.cost ?? undefined }));
}

export function saveDomainIntersectionSearch<T>(entry: DomainIntersectionSearchEntry, items: T[]): void {
  getDb().prepare('INSERT OR REPLACE INTO domain_intersection_searches (id, ts, target1, target2, location, language, result_count, total_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.target1, entry.target2, entry.location, entry.language, entry.count, entry.totalCount, entry.cost ?? null, JSON.stringify(items));
}

export function getDomainIntersectionResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM domain_intersection_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Keyword Difficulty ---

export interface KwDifficultySearchEntry {
  id: string;
  ts: number;
  keywords: string;
  location: string;
  language: string;
  count: number;
  cost?: number;
}

export function getKwDifficultyHistory(): KwDifficultySearchEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, keywords, location, language, result_count, cost FROM kw_difficulty_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; keywords: string; location: string; language: string; result_count: number; cost: number | null }>;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, keywords: r.keywords, location: r.location, language: r.language,
    count: r.result_count, cost: r.cost ?? undefined,
  }));
}

export function saveKwDifficultySearch<T>(entry: KwDifficultySearchEntry, items: T[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO kw_difficulty_searches (id, ts, keywords, location, language, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.keywords, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items));
}

export function getKwDifficultyResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM kw_difficulty_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Related Keywords ---

export interface RelatedKwSearchEntry {
  id: string;
  ts: number;
  keyword: string;
  location: string;
  language: string;
  depth: number;
  count: number;
  cost?: number;
}

export function getRelatedKwHistory(): RelatedKwSearchEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, keyword, location, language, depth, result_count, cost FROM related_kw_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; keyword: string; location: string; language: string; depth: number; result_count: number; cost: number | null }>;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, keyword: r.keyword, location: r.location, language: r.language,
    depth: r.depth, count: r.result_count, cost: r.cost ?? undefined,
  }));
}

export function saveRelatedKwSearch<T>(entry: RelatedKwSearchEntry, items: T[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO related_kw_searches (id, ts, keyword, location, language, depth, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.keyword, entry.location, entry.language, entry.depth, entry.count, entry.cost ?? null, JSON.stringify(items));
}

export function getRelatedKwResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM related_kw_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Grid Search ---

export type GridQueueMode = 'live' | 'priority' | 'standard';
export type GridStatus = 'done' | 'pending' | 'error';

export interface GridHistorySummary {
  totalPoints: number;
  foundCount: number;
  avgRank: number | null;
  top3Count: number;
  ato: number;
}

export interface GridSearchEntry {
  id: string;
  /** Stable identity for a monitored query. Multiple runs belong to one series. */
  series_id: string;
  ts: number;
  keyword: string;
  target: string;
  center: string;
  grid_size: number;
  spacing_km: number;
  language: string;
  cost?: number;
  status: GridStatus;
  queue_mode: GridQueueMode;
  summary?: GridHistorySummary;
}

export type GridScheduleFrequency = 'daily' | 'weekly';

export interface GridSchedule {
  series_id: string;
  keyword: string;
  target: string;
  center: string;
  grid_size: number;
  spacing_km: number;
  language: string;
  queue_mode: GridQueueMode;
  frequency: GridScheduleFrequency;
  weekday: number | null;
  time_of_day: string;
  time_zone: string;
  next_run_at: number;
}

export interface DueGridSchedule extends GridSchedule {
  projectId: string;
  /** The slot this claim was for; `next_run_at` already points at the following one. */
  scheduled_at: number;
}

export interface GridTaskPoint {
  task_id: string;
  row: number;
  col: number;
  lat: number;
  lng: number;
}

export interface GridLocalItem {
  rank_group: number;
  title: string;
  domain?: string;
  url?: string;
  cid?: string;
  rating_value?: number;
  rating_votes?: number;
  is_target: boolean;
}

export interface GridPoint {
  row: number;
  col: number;
  lat?: number;
  lng?: number;
  rank: number | null;
  items?: GridLocalItem[];
}

/**
 * A deterministic query fingerprint. Queue mode is deliberately excluded: changing
 * the API delivery mode does not make this a different location/ranking monitor.
 */
export function gridSeriesId(
  keyword: string, center: string, gridSize: number, spacingKm: number, target: string, language: string,
): string {
  const key = [keyword.trim().toLowerCase(), center.trim(), gridSize, spacingKm, target.trim().toLowerCase(), language.trim().toLowerCase()].join('|');
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `grid-${hash.toString(16).padStart(8, '0')}`;
}

function entryFromGridRow(row: {
  id: string; ts: number; series_id: string; keyword: string; target: string; center: string; grid_size: number; spacing_km: number; language: string;
  cost: number | null; status: string; queue_mode: string; results?: string | null; task_ids?: string | null;
}): GridSearchEntry & { task_ids?: GridTaskPoint[] } {
  return {
    id: row.id,
    series_id: row.series_id || gridSeriesId(row.keyword, row.center, row.grid_size, row.spacing_km, row.target, row.language),
    ts: row.ts, keyword: row.keyword, target: row.target, center: row.center,
    grid_size: row.grid_size, spacing_km: row.spacing_km, language: row.language, cost: row.cost ?? undefined,
    status: (row.status ?? 'done') as GridStatus,
    queue_mode: (row.queue_mode ?? 'live') as GridQueueMode,
    summary: row.status === 'pending' ? undefined : summarizeGridResults(row.results ?? null, row.target),
    task_ids: row.task_ids ? JSON.parse(row.task_ids) as GridTaskPoint[] : undefined,
  };
}

/** Mirrors the ATO/avg-rank formula in grid-insights.ts's computeGridSummary — duplicated (not imported) so lib/ doesn't depend on app/ code. */
function summarizeGridResults(resultsJson: string | null, target: string): GridHistorySummary | undefined {
  if (!resultsJson) return undefined;
  let points: GridPoint[];
  try {
    points = reconcileGridPoints(JSON.parse(resultsJson) as GridPoint[], target);
  } catch {
    return undefined;
  }
  const totalPoints = points.length;
  if (totalPoints === 0) return undefined;
  const ranked = points.filter((p) => p.rank !== null);
  const top3Count = points.filter((p) => p.rank !== null && p.rank <= 3).length;
  const avgRank = ranked.length > 0
    ? Math.round((ranked.reduce((s, p) => s + p.rank!, 0) / ranked.length) * 10) / 10
    : null;
  const ato = Math.round((points.reduce((s, p) => s + (21 - Math.min(p.rank ?? 21, 21)), 0) / (totalPoints * 20)) * 100);
  return { totalPoints, foundCount: ranked.length, avgRank, top3Count, ato };
}

export function getGridHistory(): GridSearchEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, series_id, keyword, target, center, grid_size, spacing_km, language, cost, status, queue_mode, results FROM grid_searches ORDER BY ts DESC LIMIT 100')
    .all() as Array<{ id: string; ts: number; series_id: string; keyword: string; target: string; center: string; grid_size: number; spacing_km: number; language: string; cost: number | null; status: string; queue_mode: string; results: string | null }>;
  return rows.map(entryFromGridRow);
}

/** Every run of one monitor, newest first. Not derived from getGridHistory(), whose cap spans all monitors. */
export function getGridSeriesHistory(seriesId: string): GridSearchEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, series_id, keyword, target, center, grid_size, spacing_km, language, cost, status, queue_mode, results FROM grid_searches WHERE series_id = ? ORDER BY ts DESC')
    .all(seriesId) as Array<{ id: string; ts: number; series_id: string; keyword: string; target: string; center: string; grid_size: number; spacing_km: number; language: string; cost: number | null; status: string; queue_mode: string; results: string | null }>;
  return rows.map(entryFromGridRow);
}

export function getGridEntry(id: string): (GridSearchEntry & { task_ids?: GridTaskPoint[] }) | null {
  return getGridEntryForProject(getCurrentProject().id, id);
}

export function getGridEntryForProject(projectId: string, id: string): (GridSearchEntry & { task_ids?: GridTaskPoint[] }) | null {
  const row = getDbForProject(projectId)
    .prepare('SELECT id, ts, series_id, keyword, target, center, grid_size, spacing_km, language, cost, status, queue_mode, task_ids FROM grid_searches WHERE id = ?')
    .get(id) as { id: string; ts: number; series_id: string; keyword: string; target: string; center: string; grid_size: number; spacing_km: number; language: string; cost: number | null; status: string; queue_mode: string; task_ids: string | null } | undefined;
  if (!row) return null;
  return entryFromGridRow(row);
}

export function saveGridSearch(entry: GridSearchEntry, results: GridPoint[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO grid_searches (id, ts, series_id, keyword, target, center, grid_size, spacing_km, language, cost, results, status, queue_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.series_id, entry.keyword, entry.target, entry.center, entry.grid_size, entry.spacing_km, entry.language, entry.cost ?? null, JSON.stringify(results), entry.status, entry.queue_mode);
}

export function saveGridSearchPending(entry: GridSearchEntry, taskPoints: GridTaskPoint[]): void {
  saveGridSearchPendingToDb(getDb(), entry, taskPoints);
}

function saveGridSearchPendingToDb(db: Database.Database, entry: GridSearchEntry, taskPoints: GridTaskPoint[]): void {
  db
    .prepare('INSERT OR REPLACE INTO grid_searches (id, ts, series_id, keyword, target, center, grid_size, spacing_km, language, cost, results, status, queue_mode, task_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.series_id, entry.keyword, entry.target, entry.center, entry.grid_size, entry.spacing_km, entry.language, entry.cost ?? null, '[]', 'pending', entry.queue_mode, JSON.stringify(taskPoints));
}

export function saveGridSearchPendingForProject(projectId: string, entry: GridSearchEntry, taskPoints: GridTaskPoint[]): void {
  saveGridSearchPendingToDb(getDbForProject(projectId), entry, taskPoints);
}

export function getGridProgress(id: string): { results: GridPoint[]; pendingTasks: GridTaskPoint[] } | null {
  return getGridProgressFromDb(getDb(), id);
}

function getGridProgressFromDb(db: Database.Database, id: string): { results: GridPoint[]; pendingTasks: GridTaskPoint[] } | null {
  const row = db
    .prepare('SELECT results, task_ids FROM grid_searches WHERE id = ?')
    .get(id) as { results: string; task_ids: string | null } | undefined;
  if (!row) return null;
  return {
    results: row.results ? JSON.parse(row.results) as GridPoint[] : [],
    pendingTasks: row.task_ids ? JSON.parse(row.task_ids) as GridTaskPoint[] : [],
  };
}

export function getGridProgressForProject(projectId: string, id: string): { results: GridPoint[]; pendingTasks: GridTaskPoint[] } | null {
  return getGridProgressFromDb(getDbForProject(projectId), id);
}

/**
 * Merges newly-ready points into a grid search's accumulated results and shrinks the pending task
 * list accordingly, so an already-collected task is never re-queried on a later poll.
 * Cost is charged in full by DataForSEO at task-creation time (task_post) and is set once by
 * saveGridSearchPending — it's deliberately never touched here. task_get's cost field just echoes
 * that already-billed amount on a task's first ready-check (and reports 0 on any re-check), so
 * summing it here would double-count spend already captured at posting time.
 */
export function updateGridProgress(id: string, accumulatedResults: GridPoint[], stillPendingTasks: GridTaskPoint[]): void {
  updateGridProgressInDb(getDb(), id, accumulatedResults, stillPendingTasks);
}

function updateGridProgressInDb(db: Database.Database, id: string, accumulatedResults: GridPoint[], stillPendingTasks: GridTaskPoint[]): void {
  const done = stillPendingTasks.length === 0;
  db
    .prepare('UPDATE grid_searches SET results = ?, status = ?, task_ids = ? WHERE id = ?')
    .run(JSON.stringify(accumulatedResults), done ? 'done' : 'pending', done ? null : JSON.stringify(stillPendingTasks), id);
}

export function updateGridProgressForProject(projectId: string, id: string, accumulatedResults: GridPoint[], stillPendingTasks: GridTaskPoint[]): void {
  updateGridProgressInDb(getDbForProject(projectId), id, accumulatedResults, stillPendingTasks);
}

export function getPendingGridEntriesForProject(projectId: string): Array<GridSearchEntry & { task_ids?: GridTaskPoint[] }> {
  const rows = getDbForProject(projectId)
    .prepare(`SELECT id, ts, series_id, keyword, target, center, grid_size, spacing_km, language, cost, status, queue_mode, task_ids
      FROM grid_searches WHERE status = 'pending' ORDER BY ts ASC LIMIT 100`)
    .all() as Array<{ id: string; ts: number; series_id: string; keyword: string; target: string; center: string; grid_size: number; spacing_km: number; language: string; cost: number | null; status: string; queue_mode: string; task_ids: string | null }>;
  return rows.map(entryFromGridRow);
}

export function getGridResults(id: string): GridPoint[] | null {
  const row = getDb().prepare('SELECT results, target FROM grid_searches WHERE id = ?').get(id) as { results: string; target: string } | undefined;
  if (!row) return null;
  try {
    // Re-derive target matches so runs saved with the old matching report correct ranks.
    const parsed = reconcileGridPoints(JSON.parse(row.results) as GridPoint[], row.target);
    return parsed.length > 0 ? parsed : null;
  } catch { return null; }
}

function parseScheduleRow(row: {
  series_id: string; keyword: string; target: string; center: string; grid_size: number; spacing_km: number; language: string;
  queue_mode: string; frequency: string; weekday: number | null; time_of_day: string; time_zone: string; next_run_at: number;
}): GridSchedule {
  return {
    series_id: row.series_id, keyword: row.keyword, target: row.target, center: row.center,
    grid_size: row.grid_size, spacing_km: row.spacing_km, language: row.language,
    queue_mode: (row.queue_mode ?? 'standard') as GridQueueMode,
    frequency: row.frequency as GridScheduleFrequency,
    weekday: row.weekday, time_of_day: row.time_of_day, time_zone: row.time_zone, next_run_at: row.next_run_at,
  };
}

function validTimeOfDay(value: string): string {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : '08:00';
}

function validTimeZone(value: string): string {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return value;
  } catch {
    return 'UTC';
  }
}

function zonedParts(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute') };
}

function timeZoneOffset(timestamp: number, timeZone: string): number {
  const parts = zonedParts(timestamp, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - timestamp;
}

function localTimeToTimestamp(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
  const localUtc = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = localUtc - timeZoneOffset(localUtc, timeZone);
  // Re-evaluate once so DST offset changes on the target date are applied.
  timestamp = localUtc - timeZoneOffset(timestamp, timeZone);
  return timestamp;
}

function nextDailyRun(timeOfDay: string, timeZone: string, after: number): number {
  const [hour, minute] = validTimeOfDay(timeOfDay).split(':').map(Number);
  const local = zonedParts(after, validTimeZone(timeZone));
  for (let offset = 0; offset <= 1; offset += 1) {
    const day = new Date(Date.UTC(local.year, local.month - 1, local.day + offset));
    const candidate = localTimeToTimestamp(
      day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, minute, validTimeZone(timeZone),
    );
    if (candidate > after + 5_000) return candidate;
  }
  return after + 86_400_000;
}

function nextGridScheduleRun(schedule: Pick<GridSchedule, 'frequency' | 'weekday' | 'time_of_day' | 'time_zone'>, after: number): number {
  const timeZone = validTimeZone(schedule.time_zone);
  const [hour, minute] = validTimeOfDay(schedule.time_of_day).split(':').map(Number);
  const local = zonedParts(after, timeZone);
  const firstDay = new Date(Date.UTC(local.year, local.month - 1, local.day));
  for (let offset = 0; offset <= 8; offset += 1) {
    const candidateDay = new Date(firstDay.getTime() + offset * 86_400_000);
    if (schedule.frequency === 'weekly' && candidateDay.getUTCDay() !== (schedule.weekday ?? 1)) continue;
    const candidate = localTimeToTimestamp(
      candidateDay.getUTCFullYear(), candidateDay.getUTCMonth() + 1, candidateDay.getUTCDate(), hour, minute, timeZone,
    );
    if (candidate > after + 5_000) return candidate;
  }
  // Only reachable with malformed input; preserve a predictable future retry.
  return after + 86_400_000;
}

export function getGridSchedule(seriesId: string): GridSchedule | null {
  const row = getDb().prepare(`SELECT series_id, keyword, target, center, grid_size, spacing_km, language,
    queue_mode, frequency, weekday, time_of_day, time_zone, next_run_at FROM grid_schedules WHERE series_id = ?`).get(seriesId) as Parameters<typeof parseScheduleRow>[0] | undefined;
  return row ? parseScheduleRow(row) : null;
}

export function saveGridSchedule(input: Omit<GridSchedule, 'next_run_at'>): GridSchedule {
  const now = Date.now();
  const frequency = input.frequency === 'weekly' ? 'weekly' : 'daily';
  const time_of_day = validTimeOfDay(input.time_of_day);
  const time_zone = validTimeZone(input.time_zone);
  const weekday = frequency === 'weekly' && input.weekday != null && input.weekday >= 0 && input.weekday <= 6 ? input.weekday : null;
  const next_run_at = nextGridScheduleRun({ frequency, weekday, time_of_day, time_zone }, now);
  getDb().prepare(`INSERT INTO grid_schedules
    (series_id, keyword, target, center, grid_size, spacing_km, language, queue_mode, frequency, weekday, time_of_day, time_zone, next_run_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(series_id) DO UPDATE SET
      queue_mode = excluded.queue_mode, frequency = excluded.frequency, weekday = excluded.weekday,
      time_of_day = excluded.time_of_day, time_zone = excluded.time_zone, next_run_at = excluded.next_run_at, updated_at = excluded.updated_at`)
    .run(input.series_id, input.keyword, input.target, input.center, input.grid_size, input.spacing_km, input.language,
      input.queue_mode, frequency, weekday, time_of_day, time_zone, next_run_at, now, now);
  return { ...input, frequency, weekday, time_of_day, time_zone, next_run_at };
}

export function deleteGridSchedule(seriesId: string): void {
  getDb().prepare('DELETE FROM grid_schedules WHERE series_id = ?').run(seriesId);
}

/** Removes a monitor entirely (every snapshot in the series plus its schedule). */
export function deleteGridSeries(seriesId: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM grid_searches WHERE series_id = ?').run(seriesId);
    db.prepare('DELETE FROM grid_schedules WHERE series_id = ?').run(seriesId);
  })();
}

/** Claims due schedules across every project so one cron run cannot enqueue duplicates. */
export function claimDueGridSchedules(now = Date.now()): DueGridSchedule[] {
  const due: DueGridSchedule[] = [];
  for (const project of getProjects()) {
    const db = getDbForProject(project.id);
    const rows = db.prepare(`SELECT series_id, keyword, target, center, grid_size, spacing_km, language,
      queue_mode, frequency, weekday, time_of_day, time_zone, next_run_at FROM grid_schedules WHERE next_run_at <= ?`).all(now) as Parameters<typeof parseScheduleRow>[0][];
    const claim = db.prepare('UPDATE grid_schedules SET next_run_at = ?, updated_at = ? WHERE series_id = ? AND next_run_at = ?');
    for (const row of rows) {
      const schedule = parseScheduleRow(row);
      const next = nextGridScheduleRun(schedule, now);
      if (claim.run(next, now, schedule.series_id, schedule.next_run_at).changes === 1) {
        due.push({ ...schedule, next_run_at: next, scheduled_at: schedule.next_run_at, projectId: project.id });
      }
    }
  }
  return due;
}

/**
 * Reopens a claimed Geo-grid run after a posting failure that queued nothing. Retries stop
 * once the slot is `maxDelayMs` old, so a permanent error doesn't retry until the next slot.
 */
export function retryClaimedGridSchedule(
  projectId: string, schedule: Pick<DueGridSchedule, 'series_id' | 'next_run_at' | 'scheduled_at'>,
  now = Date.now(), maxDelayMs = 6 * 3_600_000,
): boolean {
  const retryAt = now + 5 * 60_000;
  if (retryAt - schedule.scheduled_at > maxDelayMs || retryAt >= schedule.next_run_at) return false;
  return getDbForProject(projectId).prepare(`UPDATE grid_schedules SET next_run_at = ?, updated_at = ?
    WHERE series_id = ? AND next_run_at = ?`).run(retryAt, now, schedule.series_id, schedule.next_run_at).changes === 1;
}

// --- Instant Pages ---

export interface InstantPageEntry {
  id: string;
  ts: number;
  url: string;
  cost?: number;
}

export function getInstantPageHistory(): InstantPageEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, url, cost FROM instant_page_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; url: string; cost: number | null }>;
  return rows.map((r) => ({ id: r.id, ts: r.ts, url: r.url, cost: r.cost ?? undefined }));
}

export function saveInstantPageResult<T>(entry: InstantPageEntry, result: T): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO instant_page_searches (id, ts, url, cost, result) VALUES (?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.url, entry.cost ?? null, JSON.stringify(result));
}

export function getInstantPageResult<T>(id: string): T | null {
  const row = getDb().prepare('SELECT result FROM instant_page_searches WHERE id = ?').get(id) as { result: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.result) as T; } catch { return null; }
}

// --- Top Searches ---

export interface TopSearchesEntry {
  id: string;
  ts: number;
  location: string;
  language: string;
  limitCount: number;
  count: number;
  totalCount?: number;
  cost?: number;
}

export function getTopSearchesHistory(): TopSearchesEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, location, language, limit_count, result_count, total_count, cost FROM top_searches_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; location: string; language: string; limit_count: number; result_count: number; total_count: number | null; cost: number | null }>;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, location: r.location, language: r.language,
    limitCount: r.limit_count, count: r.result_count,
    totalCount: r.total_count ?? undefined, cost: r.cost ?? undefined,
  }));
}

export function saveTopSearches<T>(entry: TopSearchesEntry, items: T[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO top_searches_searches (id, ts, location, language, limit_count, result_count, total_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.location, entry.language, entry.limitCount, entry.count, entry.totalCount ?? null, entry.cost ?? null, JSON.stringify(items));
}

export function getTopSearchesResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM top_searches_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Google Reviews ---

export interface ReviewsTask {
  id: string;
  ts: number;
  business: string;
  location: string;
  language: string;
  depth: number;
  sortBy: string;
  status: 'pending' | 'ready' | 'error';
  cost?: number;
  resultCount?: number;
}

export function saveReviewsTask(id: string, business: string, location: string, language: string, depth: number, sortBy: string, cost?: number): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO reviews_tasks (id, ts, business, location, language, depth, sort_by, status, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, Date.now(), business, location, language, depth, sortBy, 'pending', cost ?? null);
}

export function getReviewsTasks(): ReviewsTask[] {
  const rows = getDb()
    .prepare('SELECT id, ts, business, location, language, depth, sort_by, status, cost, result_count FROM reviews_tasks ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; business: string; location: string; language: string; depth: number; sort_by: string; status: string; cost: number | null; result_count: number | null }>;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, business: r.business, location: r.location, language: r.language,
    depth: r.depth, sortBy: r.sort_by, status: r.status as ReviewsTask['status'],
    cost: r.cost ?? undefined, resultCount: r.result_count ?? undefined,
  }));
}

export function updateReviewsTask(id: string, status: ReviewsTask['status'], items: unknown[], cost?: number, resultCount?: number, meta?: unknown): void {
  // Use COALESCE so that passing null preserves the existing cost (set at task_post time)
  const costVal = (cost !== undefined && cost > 0) ? cost : null;
  getDb()
    .prepare('UPDATE reviews_tasks SET status = ?, result = ?, cost = COALESCE(?, cost), result_count = ?, meta = ? WHERE id = ?')
    .run(status, JSON.stringify(items), costVal, resultCount ?? items.length, meta != null ? JSON.stringify(meta) : null, id);
}

export function getReviewsTaskResult<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT result FROM reviews_tasks WHERE id = ?').get(id) as { result: string | null } | undefined;
  if (!row?.result) return null;
  try { return JSON.parse(row.result) as T[]; } catch { return null; }
}

export function getReviewsTaskMeta<T>(id: string): T | null {
  const row = getDb().prepare('SELECT meta FROM reviews_tasks WHERE id = ?').get(id) as { meta: string | null } | undefined;
  if (!row?.meta) return null;
  try { return JSON.parse(row.meta) as T; } catch { return null; }
}

// --- Domain Technologies ---

export interface DomainTechEntry {
  id: string;
  ts: number;
  target: string;
  cost?: number;
}

export function getDomainTechHistory(): DomainTechEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, target, cost FROM domain_tech_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; target: string; cost: number | null }>;
  return rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, cost: r.cost ?? undefined }));
}

export function saveDomainTechSearch<T>(entry: DomainTechEntry, result: T): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO domain_tech_searches (id, ts, target, cost, result) VALUES (?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.target, entry.cost ?? null, JSON.stringify(result));
}

export function getDomainTechResult<T>(id: string): T | null {
  const row = getDb().prepare('SELECT result FROM domain_tech_searches WHERE id = ?').get(id) as { result: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.result) as T; } catch { return null; }
}

// --- Domain Find (by keyword + technology combined) ---

export interface DomainFindEntry {
  id: string;
  ts: number;
  keyword?: string;
  technology?: string;
  count: number;
  totalCount?: number;
  cost?: number;
}

export function getDomainFindHistory(): DomainFindEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, keyword, technology, result_count, total_count, cost FROM domain_find_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; keyword: string | null; technology: string | null; result_count: number; total_count: number | null; cost: number | null }>;
  return rows.map((r) => ({ id: r.id, ts: r.ts, keyword: r.keyword ?? undefined, technology: r.technology ?? undefined, count: r.result_count, totalCount: r.total_count ?? undefined, cost: r.cost ?? undefined }));
}

export function saveDomainFindSearch<T>(entry: DomainFindEntry, items: T[]): void {
  const label = [entry.technology && `tech:${entry.technology}`, entry.keyword && `kw:${entry.keyword}`].filter(Boolean).join(' + ') || '';
  getDb()
    .prepare('INSERT OR REPLACE INTO domain_find_searches (id, ts, mode, query, keyword, technology, result_count, total_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, 'find', label, entry.keyword ?? null, entry.technology ?? null, entry.count, entry.totalCount ?? null, entry.cost ?? null, JSON.stringify(items));
}

export function getDomainFindResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM domain_find_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// --- Domain Whois ---

export interface DomainWhoisEntry {
  id: string;
  ts: number;
  domain: string;
  cost?: number;
}

export function getDomainWhoisHistory(): DomainWhoisEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, domain, cost FROM domain_whois_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; domain: string; cost: number | null }>;
  return rows.map((r) => ({ id: r.id, ts: r.ts, domain: r.domain, cost: r.cost ?? undefined }));
}

export function saveDomainWhoisSearch<T>(entry: DomainWhoisEntry, result: T): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO domain_whois_searches (id, ts, domain, cost, result) VALUES (?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.domain, entry.cost ?? null, JSON.stringify(result));
}

export function getDomainWhoisResult<T>(id: string): T | null {
  const row = getDb().prepare('SELECT result FROM domain_whois_searches WHERE id = ?').get(id) as { result: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.result) as T; } catch { return null; }
}

// --- Site Audit ---

export interface SiteAuditEntry {
  id: string;
  ts: number;
  target: string;
  startUrl?: string;
  maxCrawlPages: number;
  status: 'pending' | 'in_progress' | 'finished' | 'error';
  pagesCrawled?: number;
  cost?: number;
  errorMessage?: string;
}

export function getSiteAuditHistory(): SiteAuditEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, target, start_url, max_crawl_pages, status, pages_crawled, cost, error_message FROM site_audit_tasks ORDER BY ts DESC LIMIT 20')
    .all() as Array<{ id: string; ts: number; target: string; start_url: string | null; max_crawl_pages: number; status: string; pages_crawled: number | null; cost: number | null; error_message: string | null }>;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, target: r.target, startUrl: r.start_url ?? undefined,
    maxCrawlPages: r.max_crawl_pages, status: r.status as SiteAuditEntry['status'],
    pagesCrawled: r.pages_crawled ?? undefined, cost: r.cost ?? undefined,
    errorMessage: r.error_message ?? undefined,
  }));
}

export function getSiteAuditTask(id: string): SiteAuditEntry | null {
  const row = getDb()
    .prepare('SELECT id, ts, target, start_url, max_crawl_pages, status, pages_crawled, cost, error_message FROM site_audit_tasks WHERE id = ?')
    .get(id) as { id: string; ts: number; target: string; start_url: string | null; max_crawl_pages: number; status: string; pages_crawled: number | null; cost: number | null; error_message: string | null } | undefined;
  if (!row) return null;
  return {
    id: row.id, ts: row.ts, target: row.target, startUrl: row.start_url ?? undefined,
    maxCrawlPages: row.max_crawl_pages, status: row.status as SiteAuditEntry['status'],
    pagesCrawled: row.pages_crawled ?? undefined, cost: row.cost ?? undefined,
    errorMessage: row.error_message ?? undefined,
  };
}

export function upsertSiteAuditTask(entry: SiteAuditEntry): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO site_audit_tasks (id, ts, target, start_url, max_crawl_pages, status, pages_crawled, cost, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.target, entry.startUrl ?? null, entry.maxCrawlPages, entry.status, entry.pagesCrawled ?? null, entry.cost ?? null, entry.errorMessage ?? null);
}

export function saveSiteAuditResult<S, P>(id: string, summary: S, pages: P[], pagesCrawled?: number): void {
  getDb()
    .prepare("UPDATE site_audit_tasks SET summary = ?, pages = ?, status = 'finished', pages_crawled = COALESCE(?, pages_crawled) WHERE id = ?")
    .run(JSON.stringify(summary), JSON.stringify(pages), pagesCrawled ?? null, id);
}

export function getSiteAuditSummary<T>(id: string): T | null {
  const row = getDb().prepare('SELECT summary FROM site_audit_tasks WHERE id = ?').get(id) as { summary: string | null } | undefined;
  if (!row?.summary) return null;
  try { return JSON.parse(row.summary) as T; } catch { return null; }
}

export function getSiteAuditPages<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT pages FROM site_audit_tasks WHERE id = ?').get(id) as { pages: string | null } | undefined;
  if (!row?.pages) return null;
  try { return JSON.parse(row.pages) as T[]; } catch { return null; }
}

// ─── Keyword Ideas ────────────────────────────────────────────────────────────

export interface KeywordIdeasEntry { id: string; ts: number; keyword: string; location: string; language: string; count: number; cost?: number; }
type KIRow = { id: string; ts: number; keyword: string; location: string; language: string; result_count: number; cost: number | null };

export function getKeywordIdeasHistory(): KeywordIdeasEntry[] {
  const rows = getDb().prepare('SELECT id, ts, keyword, location, language, result_count, cost FROM keyword_ideas_searches ORDER BY ts DESC LIMIT 20').all() as KIRow[];
  return rows.map((r) => ({ id: r.id, ts: r.ts, keyword: r.keyword, location: r.location, language: r.language, count: r.result_count, cost: r.cost ?? undefined }));
}
export function saveKeywordIdeasSearch(entry: KeywordIdeasEntry, items: unknown[]): void {
  getDb().prepare('INSERT OR REPLACE INTO keyword_ideas_searches (id, ts, keyword, location, language, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(entry.id, entry.ts, entry.keyword, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items));
}
export function getKeywordIdeasResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM keyword_ideas_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Search Intent ────────────────────────────────────────────────────────────

export interface SearchIntentEntry { id: string; ts: number; keywords: string; location: string; language: string; count: number; cost?: number; }
type SIRow = { id: string; ts: number; keywords: string; location: string; language: string; result_count: number; cost: number | null };

export function getSearchIntentHistory(): SearchIntentEntry[] {
  const rows = getDb().prepare('SELECT id, ts, keywords, location, language, result_count, cost FROM search_intent_searches ORDER BY ts DESC LIMIT 20').all() as SIRow[];
  return rows.map((r) => ({ id: r.id, ts: r.ts, keywords: r.keywords, location: r.location, language: r.language, count: r.result_count, cost: r.cost ?? undefined }));
}
export function saveSearchIntentSearch(entry: SearchIntentEntry, items: unknown[]): void {
  getDb().prepare('INSERT OR REPLACE INTO search_intent_searches (id, ts, keywords, location, language, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(entry.id, entry.ts, entry.keywords, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items));
}
export function getSearchIntentResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM search_intent_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Page Intersection ────────────────────────────────────────────────────────

export interface PageIntersectionEntry { id: string; ts: number; pages: string; location: string; language: string; count: number; cost?: number; }
type PIRow = { id: string; ts: number; pages: string; location: string; language: string; result_count: number; cost: number | null };

export function getPageIntersectionHistory(): PageIntersectionEntry[] {
  const rows = getDb().prepare('SELECT id, ts, pages, location, language, result_count, cost FROM page_intersection_searches ORDER BY ts DESC LIMIT 20').all() as PIRow[];
  return rows.map((r) => ({ id: r.id, ts: r.ts, pages: r.pages, location: r.location, language: r.language, count: r.result_count, cost: r.cost ?? undefined }));
}
export function savePageIntersectionSearch(entry: PageIntersectionEntry, items: unknown[]): void {
  getDb().prepare('INSERT OR REPLACE INTO page_intersection_searches (id, ts, pages, location, language, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(entry.id, entry.ts, entry.pages, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items));
}
export function getPageIntersectionResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM page_intersection_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Domain Categories ────────────────────────────────────────────────────────

export interface DomainCategoriesEntry { id: string; ts: number; target: string; location: string; language: string; count: number; cost?: number; }
type DCRow = { id: string; ts: number; target: string; location: string; language: string; result_count: number; cost: number | null };

export function getDomainCategoriesHistory(): DomainCategoriesEntry[] {
  const rows = getDb().prepare('SELECT id, ts, target, location, language, result_count, cost FROM domain_categories_searches ORDER BY ts DESC LIMIT 20').all() as DCRow[];
  return rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, location: r.location, language: r.language, count: r.result_count, cost: r.cost ?? undefined }));
}
export function saveDomainCategoriesSearch(entry: DomainCategoriesEntry, items: unknown[]): void {
  getDb().prepare('INSERT OR REPLACE INTO domain_categories_searches (id, ts, target, location, language, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(entry.id, entry.ts, entry.target, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items));
}
export function getDomainCategoriesResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM domain_categories_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Subdomains ───────────────────────────────────────────────────────────────

export interface SubdomainsEntry { id: string; ts: number; target: string; location: string; language: string; count: number; cost?: number; }
type SDRow = { id: string; ts: number; target: string; location: string; language: string; result_count: number; cost: number | null };

export function getSubdomainsHistory(): SubdomainsEntry[] {
  const rows = getDb().prepare('SELECT id, ts, target, location, language, result_count, cost FROM subdomains_searches ORDER BY ts DESC LIMIT 20').all() as SDRow[];
  return rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, location: r.location, language: r.language, count: r.result_count, cost: r.cost ?? undefined }));
}
export function saveSubdomainsSearch(entry: SubdomainsEntry, items: unknown[]): void {
  getDb().prepare('INSERT OR REPLACE INTO subdomains_searches (id, ts, target, location, language, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(entry.id, entry.ts, entry.target, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items));
}
export function getSubdomainsResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM subdomains_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Traffic Estimation ───────────────────────────────────────────────────────

export interface TrafficEstimationEntry { id: string; ts: number; targets: string; location: string; language: string; count: number; cost?: number; }
type TERow = { id: string; ts: number; targets: string; location: string; language: string; result_count: number; cost: number | null };

export function getTrafficEstimationHistory(): TrafficEstimationEntry[] {
  const rows = getDb().prepare('SELECT id, ts, targets, location, language, result_count, cost FROM traffic_estimation_searches ORDER BY ts DESC LIMIT 20').all() as TERow[];
  return rows.map((r) => ({ id: r.id, ts: r.ts, targets: r.targets, location: r.location, language: r.language, count: r.result_count, cost: r.cost ?? undefined }));
}
export function saveTrafficEstimationSearch(entry: TrafficEstimationEntry, items: unknown[]): void {
  getDb().prepare('INSERT OR REPLACE INTO traffic_estimation_searches (id, ts, targets, location, language, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(entry.id, entry.ts, entry.targets, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items));
}
export function getTrafficEstimationResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM traffic_estimation_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Backlinks: Referring Networks ───────────────────────────────────────────

export interface BlRefNetEntry { id: string; ts: number; target: string; count: number; cost?: number; }
type BlRNRow = { id: string; ts: number; target: string; result_count: number; cost: number | null };
export function getBlRefNetHistory(): BlRefNetEntry[] {
  return (getDb().prepare('SELECT id, ts, target, result_count, cost FROM bl_ref_networks ORDER BY ts DESC LIMIT 20').all() as BlRNRow[]).map((r) => ({ id: r.id, ts: r.ts, target: r.target, count: r.result_count, cost: r.cost ?? undefined }));
}
export function saveBlRefNet(entry: BlRefNetEntry, items: unknown[]): void {
  getDb().prepare('INSERT OR REPLACE INTO bl_ref_networks (id, ts, target, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?)').run(entry.id, entry.ts, entry.target, entry.count, entry.cost ?? null, JSON.stringify(items));
}
export function getBlRefNetResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM bl_ref_networks WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Backlinks: Page Intersection ────────────────────────────────────────────

export interface BlPageIntEntry { id: string; ts: number; targets: string; count: number; cost?: number; }
type BlPIRow = { id: string; ts: number; targets: string; result_count: number; cost: number | null };
export function getBlPageIntHistory(): BlPageIntEntry[] {
  return (getDb().prepare('SELECT id, ts, targets, result_count, cost FROM bl_page_intersection ORDER BY ts DESC LIMIT 20').all() as BlPIRow[]).map((r) => ({ id: r.id, ts: r.ts, targets: r.targets, count: r.result_count, cost: r.cost ?? undefined }));
}
export function saveBlPageInt(entry: BlPageIntEntry, items: unknown[]): void {
  getDb().prepare('INSERT OR REPLACE INTO bl_page_intersection (id, ts, targets, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?)').run(entry.id, entry.ts, entry.targets, entry.count, entry.cost ?? null, JSON.stringify(items));
}
export function getBlPageIntResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM bl_page_intersection WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Backlinks: Domain Intersection ──────────────────────────────────────────

export interface BlDomIntEntry { id: string; ts: number; target1: string; target2: string; count: number; cost?: number; }
type BlDIRow = { id: string; ts: number; target1: string; target2: string; result_count: number; cost: number | null };
export function getBlDomIntHistory(): BlDomIntEntry[] {
  return (getDb().prepare('SELECT id, ts, target1, target2, result_count, cost FROM bl_domain_intersection ORDER BY ts DESC LIMIT 20').all() as BlDIRow[]).map((r) => ({ id: r.id, ts: r.ts, target1: r.target1, target2: r.target2, count: r.result_count, cost: r.cost ?? undefined }));
}
export function saveBlDomInt(entry: BlDomIntEntry, items: unknown[]): void {
  getDb().prepare('INSERT OR REPLACE INTO bl_domain_intersection (id, ts, target1, target2, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?)').run(entry.id, entry.ts, entry.target1, entry.target2, entry.count, entry.cost ?? null, JSON.stringify(items));
}
export function getBlDomIntResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM bl_domain_intersection WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Backlinks: History ───────────────────────────────────────────────────────

export interface BlHistEntry { id: string; ts: number; target: string; count: number; cost?: number; }
type BlHRow = { id: string; ts: number; target: string; result_count: number; cost: number | null };
export function getBlHistHistory(): BlHistEntry[] {
  return (getDb().prepare('SELECT id, ts, target, result_count, cost FROM bl_history ORDER BY ts DESC LIMIT 20').all() as BlHRow[]).map((r) => ({ id: r.id, ts: r.ts, target: r.target, count: r.result_count, cost: r.cost ?? undefined }));
}
export function saveBlHist(entry: BlHistEntry, items: unknown[]): void {
  getDb().prepare('INSERT OR REPLACE INTO bl_history (id, ts, target, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?)').run(entry.id, entry.ts, entry.target, entry.count, entry.cost ?? null, JSON.stringify(items));
}
export function getBlHistResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM bl_history WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Backlinks: Bulk Backlinks ────────────────────────────────────────────────

export interface BlBulkBlEntry { id: string; ts: number; targets: string; count: number; cost?: number; }
type BlBBRow = { id: string; ts: number; targets: string; result_count: number; cost: number | null };
export function getBlBulkBlHistory(): BlBulkBlEntry[] {
  return (getDb().prepare('SELECT id, ts, targets, result_count, cost FROM bl_bulk_backlinks ORDER BY ts DESC LIMIT 20').all() as BlBBRow[]).map((r) => ({ id: r.id, ts: r.ts, targets: r.targets, count: r.result_count, cost: r.cost ?? undefined }));
}
export function saveBlBulkBl(entry: BlBulkBlEntry, items: unknown[]): void {
  getDb().prepare('INSERT OR REPLACE INTO bl_bulk_backlinks (id, ts, targets, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?)').run(entry.id, entry.ts, entry.targets, entry.count, entry.cost ?? null, JSON.stringify(items));
}
export function getBlBulkBlResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM bl_bulk_backlinks WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Backlinks: Bulk Referring Domains ───────────────────────────────────────

export interface BlBulkRdEntry { id: string; ts: number; targets: string; count: number; cost?: number; }
type BlBRRow = { id: string; ts: number; targets: string; result_count: number; cost: number | null };
export function getBlBulkRdHistory(): BlBulkRdEntry[] {
  return (getDb().prepare('SELECT id, ts, targets, result_count, cost FROM bl_bulk_ref_domains ORDER BY ts DESC LIMIT 20').all() as BlBRRow[]).map((r) => ({ id: r.id, ts: r.ts, targets: r.targets, count: r.result_count, cost: r.cost ?? undefined }));
}
export function saveBlBulkRd(entry: BlBulkRdEntry, items: unknown[]): void {
  getDb().prepare('INSERT OR REPLACE INTO bl_bulk_ref_domains (id, ts, targets, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?)').run(entry.id, entry.ts, entry.targets, entry.count, entry.cost ?? null, JSON.stringify(items));
}
export function getBlBulkRdResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM bl_bulk_ref_domains WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Backlinks: Broken Backlinks ─────────────────────────────────────────────

/** `count` = links fetched, `total` = all broken backlinks DataForSEO knows of for the target. */
export interface BlBrokenEntry { id: string; ts: number; target: string; dofollowOnly: boolean; count: number; total?: number; cost?: number; }
type BlBrokenRow = { id: string; ts: number; target: string; dofollow_only: number; result_count: number; total: number | null; cost: number | null };
export function getBlBrokenHistory(): BlBrokenEntry[] {
  return (getDb().prepare('SELECT id, ts, target, dofollow_only, result_count, total, cost FROM bl_broken ORDER BY ts DESC LIMIT 20').all() as BlBrokenRow[])
    .map((r) => ({ id: r.id, ts: r.ts, target: r.target, dofollowOnly: r.dofollow_only === 1, count: r.result_count, total: r.total ?? undefined, cost: r.cost ?? undefined }));
}
export function saveBlBroken(entry: BlBrokenEntry, items: unknown[]): void {
  getDb().prepare('INSERT OR REPLACE INTO bl_broken (id, ts, target, dofollow_only, result_count, total, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.target, entry.dofollowOnly ? 1 : 0, entry.count, entry.total ?? null, entry.cost ?? null, JSON.stringify(items));
}
export function getBlBrokenResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM bl_broken WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── AI Keyword Data ──────────────────────────────────────────────────────────

export interface AiKwDataEntry { id: string; ts: number; keywords: string; location: string; language: string; count: number; cost?: number; }
type AKDRow = { id: string; ts: number; keywords: string; location: string; language: string; result_count: number; cost: number | null };

export function getAiKwDataHistory(): AiKwDataEntry[] {
  const rows = getDb().prepare('SELECT id, ts, keywords, location, language, result_count, cost FROM ai_kwdata_searches ORDER BY ts DESC LIMIT 20').all() as AKDRow[];
  return rows.map((r) => ({ id: r.id, ts: r.ts, keywords: r.keywords, location: r.location, language: r.language, count: r.result_count, cost: r.cost ?? undefined }));
}
export function saveAiKwDataSearch(entry: AiKwDataEntry, items: unknown[]): void {
  getDb().prepare('INSERT OR REPLACE INTO ai_kwdata_searches (id, ts, keywords, location, language, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(entry.id, entry.ts, entry.keywords, entry.location, entry.language, entry.count, entry.cost ?? null, JSON.stringify(items));
}
export function getAiKwDataResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM ai_kwdata_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── LLM Responses (AI Prompt Test) ──────────────────────────────────────────

export interface LlmResponseEntry { id: string; ts: number; platform: string; model: string; prompt: string; webSearch: boolean; cost?: number; }
type LRRow = { id: string; ts: number; platform: string; model: string; prompt: string; web_search: number; cost: number | null };

export function getLlmResponseHistory(): LlmResponseEntry[] {
  const rows = getDb().prepare('SELECT id, ts, platform, model, prompt, web_search, cost FROM llm_response_searches ORDER BY ts DESC LIMIT 20').all() as LRRow[];
  return rows.map((r) => ({ id: r.id, ts: r.ts, platform: r.platform, model: r.model, prompt: r.prompt, webSearch: !!r.web_search, cost: r.cost ?? undefined }));
}
export function saveLlmResponseSearch<T>(entry: LlmResponseEntry, result: T): void {
  getDb().prepare('INSERT OR REPLACE INTO llm_response_searches (id, ts, platform, model, prompt, web_search, cost, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(entry.id, entry.ts, entry.platform, entry.model, entry.prompt, entry.webSearch ? 1 : 0, entry.cost ?? null, JSON.stringify(result));
}
export function getLlmResponseResult<T>(id: string): T | null {
  const row = getDb().prepare('SELECT result FROM llm_response_searches WHERE id = ?').get(id) as { result: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.result) as T; } catch { return null; }
}

// ─── AI Visibility (LLM Mentions: target metrics + top mentioned domains/brands) ────

export type AiVisibilityMode = 'target' | 'leaderboard' | 'historical';
export interface AiVisibilityEntry { id: string; ts: number; mode: AiVisibilityMode; target: string; platform: string; cost?: number; }
type AVRow = { id: string; ts: number; mode: string; target: string; platform: string; cost: number | null };

export function getAiVisibilityHistory(): AiVisibilityEntry[] {
  const rows = getDb().prepare('SELECT id, ts, mode, target, platform, cost FROM ai_visibility_searches ORDER BY ts DESC LIMIT 20').all() as AVRow[];
  return rows.map((r) => ({ id: r.id, ts: r.ts, mode: r.mode as AiVisibilityMode, target: r.target, platform: r.platform, cost: r.cost ?? undefined }));
}
export function saveAiVisibilitySearch<T>(entry: AiVisibilityEntry, result: T): void {
  getDb().prepare('INSERT OR REPLACE INTO ai_visibility_searches (id, ts, mode, target, platform, cost, result) VALUES (?, ?, ?, ?, ?, ?, ?)').run(entry.id, entry.ts, entry.mode, entry.target, entry.platform, entry.cost ?? null, JSON.stringify(result));
}
export function getAiVisibilityResult<T>(id: string): T | null {
  const row = getDb().prepare('SELECT result FROM ai_visibility_searches WHERE id = ?').get(id) as { result: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.result) as T; } catch { return null; }
}

// ─── Query Fan-Out (LLM Mentions scoped to fan_out_queries + AI Keyword Data volumes) ────

export interface FanOutEntry { id: string; ts: number; seeds: string; platform: string; location: string; language: string; seedCount: number; queryCount: number; cost?: number; }
type FORow = { id: string; ts: number; seeds: string; platform: string; location: string; language: string; seed_count: number; query_count: number; cost: number | null };

export function getFanOutHistory(): FanOutEntry[] {
  const rows = getDb().prepare('SELECT id, ts, seeds, platform, location, language, seed_count, query_count, cost FROM fan_out_searches ORDER BY ts DESC LIMIT 20').all() as FORow[];
  return rows.map((r) => ({ id: r.id, ts: r.ts, seeds: r.seeds, platform: r.platform, location: r.location, language: r.language, seedCount: r.seed_count, queryCount: r.query_count, cost: r.cost ?? undefined }));
}
export function saveFanOutSearch(entry: FanOutEntry, items: unknown[], seedSummary: unknown[]): void {
  getDb().prepare('INSERT OR REPLACE INTO fan_out_searches (id, ts, seeds, platform, location, language, seed_count, query_count, cost, items, seed_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.seeds, entry.platform, entry.location, entry.language, entry.seedCount, entry.queryCount, entry.cost ?? null, JSON.stringify(items), JSON.stringify(seedSummary));
}
export function getFanOutResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM fan_out_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}
export function getFanOutSeedSummary<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT seed_summary FROM fan_out_searches WHERE id = ?').get(id) as { seed_summary: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.seed_summary) as T[]; } catch { return null; }
}

// ─── Prompt Tracker (saved AI prompts re-run to check for a brand/domain mention) ────

export interface TrackedPrompt {
  id: number;
  prompt: string;
  platform: string;
  model: string;
  webSearch: boolean;
  countryCode: string;
  brand: string;
  domain: string;
  createdAt: number;
}

export interface PromptSource { title?: string; url?: string }

export interface PromptCheck {
  id: number;
  promptId: number;
  checkedAt: number;
  date: string;
  platform: string;
  model: string;
  mentioned: boolean;
  brandMentions: number;
  domainCited: boolean;
  answer: string | null;
  sources: PromptSource[];
  cost: number | null;
  error: string | null;
}

export interface PromptTrackerSchedule { timeOfDay: string; timeZone: string; nextRunAt: number }
export interface DuePromptTrackerSchedule extends PromptTrackerSchedule { projectId: string }

type TrackedPromptRow = {
  id: number; prompt: string; platform: string; model: string; web_search: number; country_code: string; brand: string; domain: string; created_at: number;
};
type PromptCheckRow = {
  id: number; prompt_id: number; checked_at: number; date: string; platform: string; model: string; mentioned: number;
  brand_mentions: number; domain_cited: number; answer: string | null; sources: string | null; cost: number | null; error: string | null;
};

// Optional projectId lets the cron worker address a project other than the active one.
function promptDb(projectId?: string): Database.Database {
  return projectId ? getDbForProject(projectId) : getDb();
}

function trackedPromptFromRow(r: TrackedPromptRow): TrackedPrompt {
  return {
    id: r.id, prompt: r.prompt, platform: r.platform, model: r.model, webSearch: r.web_search === 1,
    countryCode: r.country_code, brand: r.brand, domain: r.domain, createdAt: r.created_at,
  };
}

function parsePromptSources(raw: string | null): PromptSource[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as PromptSource[]; } catch { return []; }
}

function promptCheckFromRow(r: PromptCheckRow): PromptCheck {
  return {
    id: r.id, promptId: r.prompt_id, checkedAt: r.checked_at, date: r.date, platform: r.platform, model: r.model,
    mentioned: r.mentioned === 1, brandMentions: r.brand_mentions, domainCited: r.domain_cited === 1,
    answer: r.answer, sources: parsePromptSources(r.sources), cost: r.cost, error: r.error,
  };
}

export function getTrackedPrompts(projectId?: string): TrackedPrompt[] {
  const rows = promptDb(projectId).prepare('SELECT * FROM llm_prompts ORDER BY created_at DESC').all() as TrackedPromptRow[];
  return rows.map(trackedPromptFromRow);
}

export function getTrackedPrompt(id: number, projectId?: string): TrackedPrompt | null {
  const row = promptDb(projectId).prepare('SELECT * FROM llm_prompts WHERE id = ?').get(id) as TrackedPromptRow | undefined;
  return row ? trackedPromptFromRow(row) : null;
}

export function addTrackedPrompt(
  input: Omit<TrackedPrompt, 'id' | 'createdAt'>,
  projectId?: string,
): number {
  const result = promptDb(projectId).prepare(
    'INSERT INTO llm_prompts (prompt, platform, model, web_search, country_code, brand, domain, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(input.prompt, input.platform, input.model, input.webSearch ? 1 : 0, input.countryCode, input.brand, input.domain, Date.now());
  return Number(result.lastInsertRowid);
}

export function removeTrackedPrompt(id: number, projectId?: string): void {
  const db = promptDb(projectId);
  db.transaction(() => {
    db.prepare('DELETE FROM llm_prompt_checks WHERE prompt_id = ?').run(id);
    db.prepare('DELETE FROM llm_prompts WHERE id = ?').run(id);
  })();
}

export function getPromptChecks(promptId: number, limit = 50, projectId?: string): PromptCheck[] {
  const rows = promptDb(projectId).prepare(
    'SELECT * FROM llm_prompt_checks WHERE prompt_id = ? ORDER BY checked_at DESC LIMIT ?',
  ).all(promptId, limit) as PromptCheckRow[];
  return rows.map(promptCheckFromRow);
}

/** Latest check per prompt, keyed by prompt id. */
export function getLatestPromptChecks(projectId?: string): Map<number, PromptCheck> {
  const rows = promptDb(projectId).prepare(
    'SELECT * FROM llm_prompt_checks WHERE id IN (SELECT MAX(id) FROM llm_prompt_checks GROUP BY prompt_id)',
  ).all() as PromptCheckRow[];
  return new Map(rows.map((r) => [r.prompt_id, promptCheckFromRow(r)]));
}

/** Check counts per prompt over the whole history, used for the mention rate column. */
export function getPromptCheckTotals(projectId?: string): Map<number, { total: number; mentioned: number }> {
  const rows = promptDb(projectId).prepare(
    'SELECT prompt_id, COUNT(*) AS total, SUM(mentioned) AS mentioned FROM llm_prompt_checks WHERE error IS NULL GROUP BY prompt_id',
  ).all() as Array<{ prompt_id: number; total: number; mentioned: number }>;
  return new Map(rows.map((r) => [r.prompt_id, { total: r.total, mentioned: r.mentioned ?? 0 }]));
}

export function savePromptCheck(check: Omit<PromptCheck, 'id'>, projectId?: string): number {
  const result = promptDb(projectId).prepare(`INSERT INTO llm_prompt_checks
    (prompt_id, checked_at, date, platform, model, mentioned, brand_mentions, domain_cited, answer, sources, cost, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    check.promptId, check.checkedAt, check.date, check.platform, check.model, check.mentioned ? 1 : 0,
    check.brandMentions, check.domainCited ? 1 : 0, check.answer, check.sources.length > 0 ? JSON.stringify(check.sources) : null,
    check.cost, check.error,
  );
  return Number(result.lastInsertRowid);
}

export function getPromptTrackerSchedule(projectId?: string): PromptTrackerSchedule | null {
  const row = promptDb(projectId).prepare('SELECT time_of_day, time_zone, next_run_at FROM llm_prompt_schedules WHERE id = 1')
    .get() as { time_of_day: string; time_zone: string; next_run_at: number } | undefined;
  return row ? { timeOfDay: row.time_of_day, timeZone: row.time_zone, nextRunAt: row.next_run_at } : null;
}

export function savePromptTrackerSchedule(input: { timeOfDay: string; timeZone: string }, projectId?: string): PromptTrackerSchedule {
  const now = Date.now();
  const timeOfDay = validTimeOfDay(input.timeOfDay);
  const timeZone = validTimeZone(input.timeZone);
  const nextRunAt = nextDailyRun(timeOfDay, timeZone, now);
  promptDb(projectId).prepare(`INSERT INTO llm_prompt_schedules (id, time_of_day, time_zone, next_run_at, created_at, updated_at)
    VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET time_of_day = excluded.time_of_day, time_zone = excluded.time_zone,
      next_run_at = excluded.next_run_at, updated_at = excluded.updated_at`)
    .run(timeOfDay, timeZone, nextRunAt, now, now);
  return { timeOfDay, timeZone, nextRunAt };
}

export function deletePromptTrackerSchedule(projectId?: string): void {
  promptDb(projectId).prepare('DELETE FROM llm_prompt_schedules WHERE id = 1').run();
}

/** Claims due daily prompt runs across projects so overlapping cron passes cannot run the same batch twice. */
export function claimDuePromptTrackerSchedules(now = Date.now()): DuePromptTrackerSchedule[] {
  const due: DuePromptTrackerSchedule[] = [];
  for (const project of getProjects()) {
    const db = getDbForProject(project.id);
    const row = db.prepare('SELECT time_of_day, time_zone, next_run_at FROM llm_prompt_schedules WHERE id = 1 AND next_run_at <= ?')
      .get(now) as { time_of_day: string; time_zone: string; next_run_at: number } | undefined;
    if (!row) continue;
    const schedule = { timeOfDay: row.time_of_day, timeZone: row.time_zone, nextRunAt: row.next_run_at };
    const nextRunAt = nextDailyRun(schedule.timeOfDay, schedule.timeZone, now);
    const claimed = db.prepare('UPDATE llm_prompt_schedules SET next_run_at = ?, updated_at = ? WHERE id = 1 AND next_run_at = ?')
      .run(nextRunAt, now, schedule.nextRunAt);
    if (claimed.changes === 1) due.push({ ...schedule, nextRunAt, projectId: project.id });
  }
  return due;
}

/** Reopens a claimed prompt run after a failure before any check was billed. */
export function retryClaimedPromptTrackerSchedule(projectId: string, claimedNextRunAt: number, now = Date.now()): void {
  getDbForProject(projectId).prepare('UPDATE llm_prompt_schedules SET next_run_at = ?, updated_at = ? WHERE id = 1 AND next_run_at = ?')
    .run(now + 5 * 60_000, now, claimedNextRunAt);
}

// ─── AI Optimization (LLM Mentions search) ────

export interface AiOptimizationEntry {
  id: string; ts: number; target: string; targetType: string; platform: string;
  location: string; language: string; limit: number; cost?: number;
}
type AORow = {
  id: string; ts: number; target: string; target_type: string; platform: string;
  location: string; language: string; limit_count: number; cost: number | null;
};

export function getAiOptimizationHistory(): AiOptimizationEntry[] {
  const rows = getDb().prepare(
    'SELECT id, ts, target, target_type, platform, location, language, limit_count, cost FROM ai_optimization_searches ORDER BY ts DESC LIMIT 20'
  ).all() as AORow[];
  return rows.map((r) => ({
    id: r.id, ts: r.ts, target: r.target, targetType: r.target_type, platform: r.platform,
    location: r.location, language: r.language, limit: r.limit_count, cost: r.cost ?? undefined,
  }));
}
export function saveAiOptimizationSearch<T>(entry: AiOptimizationEntry, items: T[]): void {
  getDb().prepare(
    'INSERT OR REPLACE INTO ai_optimization_searches (id, ts, target, target_type, platform, location, language, limit_count, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(entry.id, entry.ts, entry.target, entry.targetType, entry.platform, entry.location, entry.language, entry.limit, entry.cost ?? null, JSON.stringify(items));
}
export function getAiOptimizationResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM ai_optimization_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T[]; } catch { return null; }
}

// ─── Web Mentions (Content Analysis: search + summary) ────

export interface WebMentionsEntry {
  id: string;
  ts: number;
  keyword: string;
  pageTypes: string;
  limit: number;
  totalCount?: number;
  cost?: number;
}
type WMRow = { id: string; ts: number; keyword: string; page_types: string; limit_count: number; total_count: number | null; cost: number | null };

export function getWebMentionsHistory(): WebMentionsEntry[] {
  const rows = getDb().prepare('SELECT id, ts, keyword, page_types, limit_count, total_count, cost FROM web_mentions_searches ORDER BY ts DESC LIMIT 20').all() as WMRow[];
  return rows.map((r) => ({
    id: r.id, ts: r.ts, keyword: r.keyword, pageTypes: r.page_types, limit: r.limit_count,
    totalCount: r.total_count ?? undefined, cost: r.cost ?? undefined,
  }));
}
export function saveWebMentionsSearch<I, S>(entry: WebMentionsEntry, items: I, summary: S): void {
  getDb().prepare('INSERT OR REPLACE INTO web_mentions_searches (id, ts, keyword, page_types, limit_count, total_count, cost, items, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.keyword, entry.pageTypes, entry.limit, entry.totalCount ?? null, entry.cost ?? null, JSON.stringify(items), JSON.stringify(summary));
}
export function getWebMentionsItems<T>(id: string): T | null {
  const row = getDb().prepare('SELECT items FROM web_mentions_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.items) as T; } catch { return null; }
}
export function getWebMentionsSummary<T>(id: string): T | null {
  const row = getDb().prepare('SELECT summary FROM web_mentions_searches WHERE id = ?').get(id) as { summary: string } | undefined;
  if (!row) return null; try { return JSON.parse(row.summary) as T; } catch { return null; }
}

// --- Spending (aggregates the `cost` recorded by every tool) ---

// Every table that records what a DataForSEO call cost, mapped to the tool the user sees.
// Several tables can belong to one tool; they're merged by `tool`. Tables that no longer
// have a page (e.g. Reddit Mentions) are kept so past spend stays visible on older DBs.
export const SPEND_SOURCES: Array<{ table: string; tool: string; href: string | null; tsColumn?: string }> = [
  { table: 'rank_checks', tool: 'Rank Tracker', href: '/dashboard/rank-tracker', tsColumn: 'checked_at' },
  { table: 'ranked_kw_searches', tool: 'Ranked Keywords', href: '/dashboard/ranked-keywords' },
  { table: 'kw_overview_searches', tool: 'Keyword Overview', href: '/dashboard/keyword-overview' },
  { table: 'competitors_searches', tool: 'Competitors', href: '/dashboard/competitors' },
  { table: 'domain_intersection_searches', tool: 'Domain Intersection', href: '/dashboard/domain-intersection' },
  { table: 'hist_rank_searches', tool: 'Historical Rank', href: '/dashboard/historical-rank' },
  { table: 'related_kw_searches', tool: 'Related Keywords', href: '/dashboard/related-keywords' },
  { table: 'top_searches_searches', tool: 'Top Searches', href: '/dashboard/top-searches' },
  { table: 'domain_tech_searches', tool: 'Technologies', href: '/dashboard/domain-analytics/technologies' },
  { table: 'domain_find_searches', tool: 'Technologies', href: '/dashboard/domain-analytics/technologies' },
  { table: 'domain_whois_searches', tool: 'Whois', href: '/dashboard/domain-analytics/whois' },
  { table: 'domain_categories_searches', tool: 'Categories', href: '/dashboard/domain-analytics/categories' },
  { table: 'keyword_ideas_searches', tool: 'Keyword Ideas', href: '/dashboard/keyword-ideas' },
  { table: 'search_intent_searches', tool: 'Search Intent', href: '/dashboard/search-intent' },
  { table: 'page_intersection_searches', tool: 'Page Intersection (Labs)', href: '/dashboard/page-intersection' },
  { table: 'subdomains_searches', tool: 'Subdomains', href: '/dashboard/subdomains' },
  { table: 'traffic_estimation_searches', tool: 'Traffic Estimation', href: '/dashboard/traffic-estimation' },
  { table: 'backlinks_searches', tool: 'Backlinks', href: '/dashboard/backlinks' },
  { table: 'ref_domains_searches', tool: 'Referring Domains', href: '/dashboard/backlinks/referring-domains' },
  { table: 'anchors_searches', tool: 'Anchors', href: '/dashboard/backlinks/anchors' },
  { table: 'bl_ref_networks', tool: 'Referring Networks', href: '/dashboard/backlinks/referring-networks' },
  { table: 'bl_page_intersection', tool: 'Backlinks Page Intersection', href: '/dashboard/backlinks/page-intersection' },
  { table: 'bl_domain_intersection', tool: 'Backlinks Domain Intersection', href: '/dashboard/backlinks/domain-intersection' },
  { table: 'bl_history', tool: 'Backlinks History', href: '/dashboard/backlinks/history' },
  { table: 'bl_bulk_backlinks', tool: 'Bulk Backlinks', href: '/dashboard/backlinks/bulk-backlinks' },
  { table: 'bl_bulk_ref_domains', tool: 'Bulk Ref. Domains', href: '/dashboard/backlinks/bulk-referring-domains' },
  { table: 'bl_broken', tool: 'Broken Backlinks', href: '/dashboard/backlinks/broken' },
  { table: 'rv_tasks', tool: 'Review Velocity', href: '/dashboard/review-velocity', tsColumn: 'created_at' },
  { table: 'rv_discoveries', tool: 'Review Velocity', href: '/dashboard/review-velocity' },
  { table: 'serp_searches', tool: 'SERP Checker', href: '/dashboard/serp' },
  { table: 'lf_searches', tool: 'Local Finder', href: '/dashboard/local-finder' },
  { table: 'grid_searches', tool: 'Geo-Grid Ranking', href: '/dashboard/geo-grid' },
  { table: 'ai_optimization_searches', tool: 'AI Optimization', href: '/dashboard/ai-optimization' },
  { table: 'ai_visibility_searches', tool: 'AI Visibility', href: '/dashboard/ai-visibility' },
  { table: 'llm_response_searches', tool: 'AI Prompt Test', href: '/dashboard/llm-responses' },
  { table: 'ai_kwdata_searches', tool: 'AI Keyword Data', href: '/dashboard/ai-keyword-data' },
  { table: 'fan_out_searches', tool: 'Query Fan-Out', href: '/dashboard/query-fan-out' },
  { table: 'llm_prompt_checks', tool: 'Prompt Tracker', href: '/dashboard/prompt-tracker', tsColumn: 'checked_at' },
  { table: 'reviews_tasks', tool: 'Google Reviews', href: '/dashboard/google-reviews' },
  { table: 'web_mentions_searches', tool: 'Web Mentions', href: '/dashboard/web-mentions' },
  { table: 'kd_searches', tool: 'Keyword Data', href: '/dashboard/keyword-data' },
  { table: 'kw_difficulty_searches', tool: 'Keyword Difficulty', href: '/dashboard/keyword-difficulty' },
  { table: 'instant_page_searches', tool: 'On-Page Instant Pages', href: '/dashboard/on-page/instant-pages' },
  { table: 'onpage_tasks', tool: 'Microdata', href: '/dashboard/on-page/microdata' },
  { table: 'site_audit_tasks', tool: 'Site Audit', href: '/dashboard/on-page/site-audit' },
  { table: 'reddit_searches', tool: 'Reddit Mentions (removed)', href: null },
];

export interface ToolSpend {
  tool: string;
  href: string | null;
  calls: number;
  /** Sum of the costs DataForSEO reported. Calls with an unknown cost add nothing here. */
  knownCost: number;
  unknownCalls: number;
  /** Average known cost per call for this tool across all time, used to estimate unknown calls. Null if never known. */
  avgKnownCost: number | null;
}

export interface DailySpend {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  calls: number;
  knownCost: number;
  unknownCalls: number;
}

// Only tables that exist and carry a cost column (older DBs may lack some).
function spendSources(db: Database.Database) {
  return SPEND_SOURCES.filter((s) => {
    const cols = db.prepare(`SELECT name FROM pragma_table_info(?)`).all(s.table) as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    return names.has('cost') && names.has(s.tsColumn ?? 'ts');
  });
}

export function getSpendByTool(fromMs: number, toMs: number): ToolSpend[] {
  const db = getDb();
  const byTool = new Map<string, ToolSpend & { allKnownCost: number; allKnownCalls: number }>();
  for (const s of spendSources(db)) {
    const ts = s.tsColumn ?? 'ts';
    const r = db.prepare(`
      SELECT
        SUM(CASE WHEN ${ts} >= @from AND ${ts} < @to THEN 1 ELSE 0 END) AS calls,
        SUM(CASE WHEN ${ts} >= @from AND ${ts} < @to THEN COALESCE(cost, 0) ELSE 0 END) AS known_cost,
        SUM(CASE WHEN ${ts} >= @from AND ${ts} < @to AND cost IS NULL THEN 1 ELSE 0 END) AS unknown_calls,
        COALESCE(SUM(cost), 0) AS all_known_cost,
        COUNT(cost) AS all_known_calls
      FROM ${s.table}
    `).get({ from: fromMs, to: toMs }) as { calls: number | null; known_cost: number | null; unknown_calls: number | null; all_known_cost: number; all_known_calls: number };
    const acc = byTool.get(s.tool) ?? { tool: s.tool, href: s.href, calls: 0, knownCost: 0, unknownCalls: 0, avgKnownCost: null, allKnownCost: 0, allKnownCalls: 0 };
    acc.calls += r.calls ?? 0;
    acc.knownCost += r.known_cost ?? 0;
    acc.unknownCalls += r.unknown_calls ?? 0;
    acc.allKnownCost += r.all_known_cost;
    acc.allKnownCalls += r.all_known_calls;
    byTool.set(s.tool, acc);
  }
  return [...byTool.values()]
    .filter((t) => t.calls > 0)
    .map(({ allKnownCost, allKnownCalls, ...t }) => ({ ...t, avgKnownCost: allKnownCalls > 0 ? allKnownCost / allKnownCalls : null }))
    .sort((a, b) => b.knownCost - a.knownCost || b.calls - a.calls);
}

export function getSpendByDay(fromMs: number, toMs: number): DailySpend[] {
  const db = getDb();
  const sources = spendSources(db);
  if (sources.length === 0) return [];
  const union = sources
    .map((s) => `SELECT ${s.tsColumn ?? 'ts'} AS ts, cost FROM ${s.table} WHERE ${s.tsColumn ?? 'ts'} >= @from AND ${s.tsColumn ?? 'ts'} < @to`)
    .join(' UNION ALL ');
  const rows = db.prepare(`
    SELECT date(ts / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS calls,
      COALESCE(SUM(cost), 0) AS known_cost, SUM(cost IS NULL) AS unknown_calls
    FROM (${union}) GROUP BY day ORDER BY day
  `).all({ from: fromMs, to: toMs }) as Array<{ day: string; calls: number; known_cost: number; unknown_calls: number }>;
  return rows.map((r) => ({ day: r.day, calls: r.calls, knownCost: r.known_cost, unknownCalls: r.unknown_calls }));
}

/** Timestamp of the oldest recorded call across all tools, or null if nothing was ever recorded. */
export function getFirstSpendTs(): number | null {
  const db = getDb();
  const sources = spendSources(db);
  if (sources.length === 0) return null;
  const union = sources.map((s) => `SELECT MIN(${s.tsColumn ?? 'ts'}) AS ts FROM ${s.table}`).join(' UNION ALL ');
  const row = db.prepare(`SELECT MIN(ts) AS ts FROM (${union})`).get() as { ts: number | null };
  return row.ts;
}
