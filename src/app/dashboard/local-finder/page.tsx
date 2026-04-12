import {
  getCredentials, getSetting, getLfHistory, saveLfSearch, getLfResults, type LfHistoryEntry,
  getGridHistory, saveGridSearch, getGridResults, type GridSearchEntry, type GridPoint, type GridLocalItem,
} from '@/lib/db';
import LocalFinderForm from './LocalFinderForm';
import GridResults from './GridResults';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Rating {
  value?: number;
  votes_count?: number;
  rating_max?: number;
}

interface LocalPackItem {
  type: string;
  rank_group: number;
  rank_absolute: number;
  title?: string;
  description?: string;
  domain?: string;
  url?: string;
  phone?: string;
  booking_url?: string;
  is_paid?: boolean;
  rating?: Rating;
  cid?: string;
}

interface SearchParams {
  keyword?: string;
  location?: string;
  location_coordinate?: string;
  language?: string;
  device?: string;
  os?: string;
  depth?: string;
  min_rating?: string;
  time_filter?: string;
  history_id?: string;
  // grid mode
  mode?: string;
  grid_size?: string;
  spacing_km?: string;
  grid_target?: string;
  grid_history_id?: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchLocalFinder(
  params: SearchParams, login: string, pass: string,
): Promise<{ items: LocalPackItem[]; cost?: number; checkUrl?: string; error?: string }> {
  const body: Record<string, unknown> = { keyword: params.keyword, language_name: params.language };
  if (params.location_coordinate) body.location_coordinate = params.location_coordinate;
  else if (params.location) body.location_name = params.location;
  if (params.device) body.device = params.device;
  if (params.os) body.os = params.os;
  if (params.depth) body.depth = parseInt(params.depth, 10);
  if (params.min_rating) body.min_rating = parseFloat(params.min_rating);
  if (params.time_filter) body.time_filter = params.time_filter;

  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/serp/google/local_finder/live/advanced', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([body]),
  });
  if (!res.ok) return { items: [], error: `API error ${res.status}: ${res.statusText}` };
  const data = await res.json() as {
    tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ check_url?: string; items?: LocalPackItem[] }> }>;
  };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  const result = task.result?.[0];
  const items = (result?.items ?? []).filter((i) => i.type === 'local_pack');
  return { items, cost: task.cost, checkUrl: result?.check_url };
}

function generateGridCoords(centerLat: number, centerLng: number, gridSize: number, spacingKm: number) {
  const latDeg = spacingKm / 111.32;
  const lngDeg = spacingKm / (111.32 * Math.cos(centerLat * Math.PI / 180));
  const half = Math.floor(gridSize / 2);
  const coords: { row: number; col: number; lat: number; lng: number }[] = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      coords.push({
        row,
        col,
        lat: centerLat + (half - row) * latDeg,
        lng: centerLng + (col - half) * lngDeg,
      });
    }
  }
  return coords;
}

async function fetchOneGridPoint(
  keyword: string,
  lat: number,
  lng: number,
  language: string,
  auth: string,
): Promise<{ items: LocalPackItem[]; cost: number }> {
  const res = await fetch('https://api.dataforseo.com/v3/serp/google/local_finder/live/advanced', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      keyword,
      location_coordinate: `${lat.toFixed(6)},${lng.toFixed(6)}`,
      language_name: language,
      depth: 20,
    }]),
  });
  if (!res.ok) return { items: [], cost: 0 };
  const data = await res.json() as {
    tasks?: Array<{ status_code?: number; cost?: number; result?: Array<{ items?: LocalPackItem[] }> }>;
  };
  const task = data?.tasks?.[0];
  if (!task || task.status_code !== 20000) return { items: [], cost: 0 };
  const items = (task.result?.[0]?.items ?? []).filter((i) => i.type === 'local_pack');
  return { items, cost: task.cost ?? 0 };
}

async function fetchGridSearch(
  keyword: string,
  center: string,
  gridSize: number,
  spacingKm: number,
  language: string,
  target: string,
  login: string,
  pass: string,
): Promise<{ results: GridPoint[]; cost: number; error?: string }> {
  const parts = center.split(',').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
    return { results: [], cost: 0, error: 'Invalid coordinates.' };
  }
  const [centerLat, centerLng] = parts;
  const coords = generateGridCoords(centerLat, centerLng, gridSize, spacingKm);
  const auth = btoa(`${login}:${pass}`);
  const targetLower = target.toLowerCase();

  const pointResults = await Promise.all(
    coords.map(async ({ row, col, lat, lng }) => {
      const { items: rawItems, cost } = await fetchOneGridPoint(keyword, lat, lng, language, auth);

      const isTarget = (item: LocalPackItem) =>
        (item.title ?? '').toLowerCase().includes(targetLower) ||
        (item.domain ?? '').toLowerCase().includes(targetLower) ||
        (item.url ?? '').toLowerCase().includes(targetLower);

      const match = rawItems.find(isTarget);
      const items: GridLocalItem[] = rawItems.slice(0, 20).map((item) => ({
        rank_group: item.rank_group,
        title: item.title ?? '—',
        domain: item.domain,
        rating_value: item.rating?.value,
        rating_votes: item.rating?.votes_count,
        is_target: isTarget(item),
      }));

      return { point: { row, col, lat, lng, rank: match ? match.rank_group : null, items }, cost };
    })
  );

  const results = pointResults.map((r) => r.point);
  const totalCost = pointResults.reduce((s, r) => s + r.cost, 0);
  return { results, cost: totalCost };
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function StarRating({ rating }: { rating?: Rating }) {
  if (!rating?.value) return null;
  const pct = (rating.value / (rating.rating_max ?? 5)) * 100;
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative inline-flex text-slate-200 text-sm leading-none" style={{ letterSpacing: '-1px' }}>
        {'★★★★★'}
        <div className="absolute inset-0 overflow-hidden text-amber-400" style={{ width: `${pct}%` }}>{'★★★★★'}</div>
      </div>
      <span className="text-xs font-bold text-slate-700">{rating.value.toFixed(1)}</span>
      {rating.votes_count !== undefined && <span className="text-[11px] text-slate-400">({rating.votes_count.toLocaleString("en-GB")})</span>}
    </div>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LocalFinderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;
  const gridHistoryId = params.grid_history_id;
  const isGridMode = params.mode === 'grid';

  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'English';

  // ── Regular local finder state ──
  let items: LocalPackItem[] = [];
  let cost: number | undefined;
  let checkUrl: string | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: LfHistoryEntry | null = null;

  // ── Grid search state ──
  let gridResults: GridPoint[] | null = null;
  let gridEntry: GridSearchEntry | null = null;
  let gridError: string | null = null;
  let gridCost: number | undefined;

  // ── Load regular history ──
  if (historyId) {
    const saved = getLfResults<LocalPackItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      const index = getLfHistory();
      activeEntry = index.find((e) => e.id === historyId) ?? null;
    } else {
      error = 'Search not found.';
    }
  }

  // ── Load grid history ──
  if (gridHistoryId) {
    const saved = getGridResults(gridHistoryId);
    if (saved) {
      gridResults = saved;
      const history = getGridHistory();
      gridEntry = history.find((e) => e.id === gridHistoryId) ?? null;
    } else {
      gridError = 'Search not found.';
    }
  }

  // ── Fresh regular search ──
  const hasQuery = historyId || params.keyword?.trim();
  if (!historyId && !isGridMode && params.keyword?.trim()) {
    if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const result = await fetchLocalFinder(params, creds.login, creds.pass);
      items = result.items;
      cost = result.cost;
      checkUrl = result.checkUrl;
      error = result.error ?? null;

      if (!error && items.length > 0) {
        const entry: LfHistoryEntry = {
          id: crypto.randomUUID().slice(0, 8),
          ts: Date.now(),
          keyword: params.keyword ?? '',
          location: params.location ?? '',
          count: items.length, cost: result.cost,
          params: Object.fromEntries(
            Object.entries(params).filter(([k, v]) => k !== 'history_id' && v !== undefined)
          ) as Record<string, string>,
        };
        saveLfSearch(entry, items);
      }
    }
  }

  // ── Fresh grid search ──
  if (!gridHistoryId && isGridMode && params.keyword?.trim() && params.location_coordinate && params.grid_target) {
    if (!creds) {
      gridError = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const gridSize = Math.min(Math.max(parseInt(params.grid_size ?? '5', 10), 3), 9);
      const spacingKm = parseFloat(params.spacing_km ?? '1');
      const result = await fetchGridSearch(
        params.keyword, params.location_coordinate,
        gridSize, spacingKm, params.language ?? defaultLanguage,
        params.grid_target, creds.login, creds.pass,
      );
      if (result.error) {
        gridError = result.error;
      } else {
        gridResults = result.results;
        gridCost = result.cost;
        const id = crypto.randomUUID().slice(0, 8);
        gridEntry = {
          id, ts: Date.now(),
          keyword: params.keyword,
          target: params.grid_target,
          center: params.location_coordinate,
          grid_size: gridSize,
          spacing_km: spacingKm,
          language: params.language ?? defaultLanguage,
          cost: result.cost,
        };
        saveGridSearch(gridEntry, result.results);
      }
    }
  }

  const historyIndex = getLfHistory();
  const gridHistory = getGridHistory();

  const sourceParams = activeEntry?.params ?? params;
  const formDefaults = {
    keyword: (sourceParams.keyword ?? '').toString(),
    location: (sourceParams.location ?? defaultLocation).toString(),
    locationCoordinate: (sourceParams.location_coordinate ?? '').toString(),
    language: (sourceParams.language ?? defaultLanguage).toString(),
    device: (sourceParams.device ?? 'desktop').toString(),
    os: (sourceParams.os ?? 'windows').toString(),
    depth: (sourceParams.depth ?? '20').toString(),
    minRating: (sourceParams.min_rating ?? '').toString(),
    timeFilter: (sourceParams.time_filter ?? '').toString(),
    gridMode: isGridMode,
    gridSize: (params.grid_size ?? '5').toString(),
    spacingKm: (params.spacing_km ?? '1').toString(),
    gridTarget: (params.grid_target ?? '').toString(),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Local Finder</h1>
        <p className="text-sm text-slate-400 mt-1">Google Local Finder results and Grid Search in real time.</p>
      </div>

      <LocalFinderForm defaults={formDefaults} />

      {/* ── Grid results ── */}
      {gridError && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{gridError}</div>}
      {gridResults && gridEntry && (
        <GridResults
          results={gridResults}
          gridSize={gridEntry.grid_size}
          keyword={gridEntry.keyword}
          target={gridEntry.target}
          cost={gridCost ?? gridEntry.cost}
        />
      )}

      {/* ── Regular results ── */}
      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

      {hasQuery && !error && !isGridMode && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Results</h2>
              {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              {checkUrl && (
                <a href={checkUrl} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700 transition-colors">
                  Verify ↗
                </a>
              )}
              <span className="text-xs font-black text-slate-400">{items.length} result{items.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No results found.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((item, i) => (
                <div key={i} className="px-6 py-5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                      <span className="text-xs font-black text-slate-500">{item.rank_group}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-slate-900">{item.title ?? '—'}</h3>
                            {item.is_paid && <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">Sponsored</span>}
                          </div>
                          {item.rating && <StarRating rating={item.rating} />}
                        </div>
                        {item.phone && <a href={`tel:${item.phone}`} className="shrink-0 text-xs font-mono text-blue-600 hover:text-blue-800 transition-colors">{item.phone}</a>}
                      </div>
                      {item.description && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">{item.description}</p>}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noopener noreferrer"
                            className="text-[11px] font-mono text-slate-400 hover:text-blue-600 truncate max-w-xs transition-colors">
                            {item.domain ?? item.url}
                          </a>
                        )}
                        {item.booking_url && <a href={item.booking_url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-800 transition-colors">Book ↗</a>}
                        {item.cid && <a href={`https://www.google.com/maps?cid=${item.cid}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 transition-colors">Maps ↗</a>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── History ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Regular history */}
        {historyIndex.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Local Finder History</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {historyIndex.map((entry) => {
                const isActive = entry.id === historyId;
                return (
                  <a key={entry.id} href={`/dashboard/local-finder?history_id=${entry.id}`}
                    className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{entry.keyword}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {entry.location} · {entry.count} result{entry.count !== 1 ? 's' : ''}
                        {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Grid search history */}
        {gridHistory.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Grid Search History</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {gridHistory.map((entry) => {
                const isActive = entry.id === gridHistoryId;
                return (
                  <a key={entry.id} href={`/dashboard/local-finder?grid_history_id=${entry.id}`}
                    className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>
                        {entry.keyword}
                        <span className="ml-2 text-[10px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{entry.grid_size}×{entry.grid_size}</span>
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        Target: {entry.target} · {entry.spacing_km} km
                        {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
