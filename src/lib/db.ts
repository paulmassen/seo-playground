import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(process.env.DB_PATH ?? path.join(process.cwd(), 'seo-playground.db'));
    _db.pragma('journal_mode = WAL');
    initSchema(_db);
    seedLocations(_db);
    seedCategories(_db);
  }
  return _db;
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
      target_hits TEXT
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
      keyword TEXT NOT NULL,
      target TEXT NOT NULL,
      center TEXT NOT NULL,
      grid_size INTEGER NOT NULL,
      spacing_km REAL NOT NULL,
      language TEXT NOT NULL,
      cost REAL,
      results TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS instant_page_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      url TEXT NOT NULL,
      cost REAL,
      result TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reddit_searches (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      targets TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      cost REAL,
      items TEXT NOT NULL
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

  // Migrations — add columns that may not exist in older DBs
  try { db.exec('ALTER TABLE serp_searches ADD COLUMN target_hits TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE backlinks_searches ADD COLUMN links TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE backlinks_searches ADD COLUMN links_total INTEGER'); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE grid_searches ADD COLUMN status TEXT NOT NULL DEFAULT 'done'`); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE grid_searches ADD COLUMN task_ids TEXT'); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE grid_searches ADD COLUMN queue_mode TEXT NOT NULL DEFAULT 'live'`); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE reviews_tasks ADD COLUMN meta TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE domain_find_searches ADD COLUMN keyword TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE domain_find_searches ADD COLUMN technology TEXT'); } catch { /* already exists */ }
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
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function deleteSetting(key: string): void {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run(key);
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
  return rows.map((r) => r.domain);
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
  targetHits?: TargetHit[];
}

export function getSerpHistory(): SerpHistoryEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, keyword, location, language, device, depth, result_count, target_hits FROM serp_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; keyword: string; location: string; language: string; device: string; depth: number; result_count: number; target_hits: string | null }>;
  return rows.map((r) => ({
    ...r,
    count: r.result_count,
    targetHits: r.target_hits ? JSON.parse(r.target_hits) : undefined,
  }));
}

export function saveSerpSearch<T>(entry: SerpHistoryEntry, items: T[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO serp_searches (id, ts, keyword, location, language, device, depth, result_count, items, target_hits) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.keyword, entry.location, entry.language, entry.device, entry.depth, entry.count, JSON.stringify(items), entry.targetHits ? JSON.stringify(entry.targetHits) : null);
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
}

export function getTrackedKeywords(): TrackedKeyword[] {
  const rows = getDb().prepare('SELECT id, keyword, domain, location, language, created_at FROM tracked_keywords ORDER BY created_at DESC').all() as Array<{
    id: number; keyword: string; domain: string; location: string; language: string; created_at: number;
  }>;
  return rows.map((r) => ({ id: r.id, keyword: r.keyword, domain: r.domain, location: r.location, language: r.language, createdAt: r.created_at }));
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
  getDb().prepare('DELETE FROM tracked_keywords WHERE id = ?').run(id);
}

export function saveRankCheck(keywordId: number, position: number | null, url: string | null, title: string | null, cost: number | null): void {
  const now = Date.now();
  const date = new Date(now).toISOString().split('T')[0];
  // Only one check per day per keyword — upsert by date
  const existing = getDb().prepare('SELECT id FROM rank_checks WHERE keyword_id = ? AND date = ?').get(keywordId, date) as { id: number } | undefined;
  if (existing) {
    getDb().prepare('UPDATE rank_checks SET checked_at = ?, position = ?, url = ?, title = ?, cost = ? WHERE id = ?')
      .run(now, position, url, title, cost, existing.id);
  } else {
    getDb().prepare('INSERT INTO rank_checks (keyword_id, checked_at, date, position, url, title, cost) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(keywordId, now, date, position, url, title, cost);
  }
}

export function getRankHistory(keywordId: number, days = 30): RankCheck[] {
  const rows = getDb().prepare(
    'SELECT id, keyword_id, checked_at, date, position, url, title, cost FROM rank_checks WHERE keyword_id = ? ORDER BY date DESC LIMIT ?'
  ).all(keywordId, days) as Array<{ id: number; keyword_id: number; checked_at: number; date: string; position: number | null; url: string | null; title: string | null; cost: number | null }>;
  return rows.map((r) => ({ id: r.id, keywordId: r.keyword_id, checkedAt: r.checked_at, date: r.date, position: r.position, url: r.url, title: r.title, cost: r.cost }));
}

export function getLatestRankCheck(keywordId: number): RankCheck | null {
  const row = getDb().prepare(
    'SELECT id, keyword_id, checked_at, date, position, url, title, cost FROM rank_checks WHERE keyword_id = ? ORDER BY date DESC LIMIT 1'
  ).get(keywordId) as { id: number; keyword_id: number; checked_at: number; date: string; position: number | null; url: string | null; title: string | null; cost: number | null } | undefined;
  if (!row) return null;
  return { id: row.id, keywordId: row.keyword_id, checkedAt: row.checked_at, date: row.date, position: row.position, url: row.url, title: row.title, cost: row.cost };
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
  cost?: number;
}

export function getHistRankHistory(): HistRankSearchEntry[] {
  const rows = getDb().prepare('SELECT id, ts, target, location, language, cost FROM hist_rank_searches ORDER BY ts DESC LIMIT 30').all() as Array<{
    id: string; ts: number; target: string; location: string; language: string; cost: number | null;
  }>;
  return rows.map((r) => ({ id: r.id, ts: r.ts, target: r.target, location: r.location, language: r.language, cost: r.cost ?? undefined }));
}

export function saveHistRankSearch<T>(entry: HistRankSearchEntry, items: T[]): void {
  getDb().prepare('INSERT OR REPLACE INTO hist_rank_searches (id, ts, target, location, language, cost, items) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.target, entry.location, entry.language, entry.cost ?? null, JSON.stringify(items));
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

/** Mirrors the ATO/avg-rank formula in grid-insights.ts's computeGridSummary — duplicated (not imported) so lib/ doesn't depend on app/ code. */
function summarizeGridResults(resultsJson: string | null): GridHistorySummary | undefined {
  if (!resultsJson) return undefined;
  let points: GridPoint[];
  try {
    points = JSON.parse(resultsJson) as GridPoint[];
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
    .prepare('SELECT id, ts, keyword, target, center, grid_size, spacing_km, language, cost, status, queue_mode, results FROM grid_searches ORDER BY ts DESC LIMIT 20')
    .all() as Array<{ id: string; ts: number; keyword: string; target: string; center: string; grid_size: number; spacing_km: number; language: string; cost: number | null; status: string; queue_mode: string; results: string | null }>;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, keyword: r.keyword, target: r.target, center: r.center,
    grid_size: r.grid_size, spacing_km: r.spacing_km, language: r.language, cost: r.cost ?? undefined,
    status: (r.status ?? 'done') as GridStatus,
    queue_mode: (r.queue_mode ?? 'live') as GridQueueMode,
    summary: r.status === 'pending' ? undefined : summarizeGridResults(r.results),
  }));
}

export function getGridEntry(id: string): (GridSearchEntry & { task_ids?: GridTaskPoint[] }) | null {
  const row = getDb()
    .prepare('SELECT id, ts, keyword, target, center, grid_size, spacing_km, language, cost, status, queue_mode, task_ids FROM grid_searches WHERE id = ?')
    .get(id) as { id: string; ts: number; keyword: string; target: string; center: string; grid_size: number; spacing_km: number; language: string; cost: number | null; status: string; queue_mode: string; task_ids: string | null } | undefined;
  if (!row) return null;
  return {
    id: row.id, ts: row.ts, keyword: row.keyword, target: row.target, center: row.center,
    grid_size: row.grid_size, spacing_km: row.spacing_km, language: row.language, cost: row.cost ?? undefined,
    status: (row.status ?? 'done') as GridStatus,
    queue_mode: (row.queue_mode ?? 'live') as GridQueueMode,
    task_ids: row.task_ids ? JSON.parse(row.task_ids) as GridTaskPoint[] : undefined,
  };
}

export function saveGridSearch(entry: GridSearchEntry, results: GridPoint[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO grid_searches (id, ts, keyword, target, center, grid_size, spacing_km, language, cost, results, status, queue_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.keyword, entry.target, entry.center, entry.grid_size, entry.spacing_km, entry.language, entry.cost ?? null, JSON.stringify(results), entry.status, entry.queue_mode);
}

export function saveGridSearchPending(entry: GridSearchEntry, taskPoints: GridTaskPoint[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO grid_searches (id, ts, keyword, target, center, grid_size, spacing_km, language, cost, results, status, queue_mode, task_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.keyword, entry.target, entry.center, entry.grid_size, entry.spacing_km, entry.language, entry.cost ?? null, '[]', 'pending', entry.queue_mode, JSON.stringify(taskPoints));
}

export function getGridProgress(id: string): { results: GridPoint[]; pendingTasks: GridTaskPoint[] } | null {
  const row = getDb()
    .prepare('SELECT results, task_ids FROM grid_searches WHERE id = ?')
    .get(id) as { results: string; task_ids: string | null } | undefined;
  if (!row) return null;
  return {
    results: row.results ? JSON.parse(row.results) as GridPoint[] : [],
    pendingTasks: row.task_ids ? JSON.parse(row.task_ids) as GridTaskPoint[] : [],
  };
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
  const done = stillPendingTasks.length === 0;
  getDb()
    .prepare('UPDATE grid_searches SET results = ?, status = ?, task_ids = ? WHERE id = ?')
    .run(JSON.stringify(accumulatedResults), done ? 'done' : 'pending', done ? null : JSON.stringify(stillPendingTasks), id);
}

export function getGridResults(id: string): GridPoint[] | null {
  const row = getDb().prepare('SELECT results FROM grid_searches WHERE id = ?').get(id) as { results: string } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.results) as GridPoint[];
    return parsed.length > 0 ? parsed : null;
  } catch { return null; }
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

// --- Reddit ---

export interface RedditSearchEntry {
  id: string;
  ts: number;
  targets: string;
  count: number;
  cost?: number;
}

export function getRedditHistory(): RedditSearchEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, targets, result_count, cost FROM reddit_searches ORDER BY ts DESC LIMIT 30')
    .all() as Array<{ id: string; ts: number; targets: string; result_count: number; cost: number | null }>;
  return rows.map((r) => ({ id: r.id, ts: r.ts, targets: r.targets, count: r.result_count, cost: r.cost ?? undefined }));
}

export function saveRedditSearch<T>(entry: RedditSearchEntry, items: T[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO reddit_searches (id, ts, targets, result_count, cost, items) VALUES (?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.targets, entry.count, entry.cost ?? null, JSON.stringify(items));
}

export function getRedditResults<T>(id: string): T[] | null {
  const row = getDb().prepare('SELECT items FROM reddit_searches WHERE id = ?').get(id) as { items: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.items) as T[]; } catch { return null; }
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
