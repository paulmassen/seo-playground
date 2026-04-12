import Database from 'better-sqlite3';
import path from 'path';

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(path.join(process.cwd(), 'seo-playground.db'));
    _db.pragma('journal_mode = WAL');
    initSchema(_db);
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
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_rank_checks_kw ON rank_checks(keyword_id, checked_at DESC)`);

  // Migrations — add columns that may not exist in older DBs
  try { db.exec('ALTER TABLE serp_searches ADD COLUMN target_hits TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE backlinks_searches ADD COLUMN links TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE backlinks_searches ADD COLUMN links_total INTEGER'); } catch { /* already exists */ }
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
}

export interface GridLocalItem {
  rank_group: number;
  title: string;
  domain?: string;
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

export function getGridHistory(): GridSearchEntry[] {
  const rows = getDb()
    .prepare('SELECT id, ts, keyword, target, center, grid_size, spacing_km, language, cost FROM grid_searches ORDER BY ts DESC LIMIT 20')
    .all() as Array<{ id: string; ts: number; keyword: string; target: string; center: string; grid_size: number; spacing_km: number; language: string; cost: number | null }>;
  return rows.map((r) => ({
    id: r.id, ts: r.ts, keyword: r.keyword, target: r.target, center: r.center,
    grid_size: r.grid_size, spacing_km: r.spacing_km, language: r.language, cost: r.cost ?? undefined,
  }));
}

export function saveGridSearch(entry: GridSearchEntry, results: GridPoint[]): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO grid_searches (id, ts, keyword, target, center, grid_size, spacing_km, language, cost, results) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(entry.id, entry.ts, entry.keyword, entry.target, entry.center, entry.grid_size, entry.spacing_km, entry.language, entry.cost ?? null, JSON.stringify(results));
}

export function getGridResults(id: string): GridPoint[] | null {
  const row = getDb().prepare('SELECT results FROM grid_searches WHERE id = ?').get(id) as { results: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.results) as GridPoint[]; } catch { return null; }
}
