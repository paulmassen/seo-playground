import {
  getCredentials,
  getTargetDomains,
  getMapsHistory,
  saveMapsSearch,
  getMapsResults,
  type MapsSearchEntry,
} from '@/lib/db';
import SearchForm from '@/components/SearchForm';

// ---- Types ----

interface Rating {
  value?: number;
  votes_count?: number;
  rating_max?: number;
}

interface AddressInfo {
  borough?: string;
  address?: string;
  city?: string;
  zip?: string;
  region?: string;
  country_code?: string;
}

export interface MapsItem {
  type?: string;
  rank_group?: number;
  rank_absolute?: number;
  title?: string;
  description?: string;
  domain?: string;
  url?: string;
  phone?: string;
  main_category?: string;
  additional_categories?: string[];
  is_claimed?: boolean;
  rating?: Rating;
  rating_distribution?: Record<string, number>;
  price_level?: string;
  address?: string;
  address_info?: AddressInfo;
  latitude?: number;
  longitude?: number;
  cid?: string;
  place_id?: string;
}

interface SearchParams {
  keyword?: string;
  location?: string;
  location_coordinate?: string;
  language?: string;
  device?: string;
  depth?: string;
  history_id?: string;
}

// ---- API ----

async function fetchMaps(
  params: SearchParams,
  login: string,
  pass: string,
): Promise<{ items: MapsItem[]; checkUrl?: string; error?: string }> {
  const body: Record<string, unknown> = {
    keyword: params.keyword,
    language_name: params.language,
    depth: Math.min(parseInt(params.depth ?? '20', 10) || 20, 100),
    device: params.device ?? 'desktop',
  };
  if (params.location_coordinate) {
    body.location_coordinate = params.location_coordinate;
  } else if (params.location) {
    body.location_name = params.location;
  }

  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/serp/google/maps/live/advanced', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([body]),
  });
  if (!res.ok) return { items: [], error: `Error API ${res.status}: ${res.statusText}` };

  const data = await res.json() as {
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      result?: Array<{ check_url?: string; items?: MapsItem[] }>;
    }>;
  };

  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Réponse API vide.' };
  if (task.status_code && task.status_code !== 20000) {
    return { items: [], error: `DataForSEO: ${task.status_message}` };
  }
  const result = task.result?.[0];
  return {
    items: (result?.items ?? []).filter((i) => i.type === 'maps_search'),
    checkUrl: result?.check_url,
  };
}

// ---- UI helpers ----

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
      {rating.votes_count !== undefined && (
        <span className="text-[11px] text-slate-400">({rating.votes_count.toLocaleString("en-GB")})</span>
      )}
    </div>
  );
}

function PriceLevel({ level }: { level?: string }) {
  if (!level) return null;
  const map: Record<string, string> = {
    inexpensive: '€',
    moderate: '€€',
    expensive: '€€€',
    very_expensive: '€€€€',
  };
  return <span className="text-xs font-mono text-slate-500">{map[level] ?? level}</span>;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: 'numeric', month: 'short' });
}

function extractDomain(url?: string): string {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// ---- Page ----

export default async function MapsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const targetDomains = getTargetDomains();
  const history = getMapsHistory();
  const params = await searchParams;
  const historyId = params.history_id;

  const keyword = params.keyword?.trim() ?? '';
  const location = params.location ?? 'France';
  const language = params.language ?? 'French';
  const device = params.device ?? 'desktop';
  const depth = Math.min(parseInt(params.depth ?? '20', 10) || 20, 100);

  let items: MapsItem[] = [];
  let checkUrl: string | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: MapsSearchEntry | null = null;

  if (historyId) {
    const saved = getMapsResults<MapsItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      activeEntry = history.find((e) => e.id === historyId) ?? null;
    } else {
      error = "Cette recherche n'est plus disponible.";
    }
  }

  if (!historyId && keyword) {
    if (!creds) {
      error = 'Identifiants DataForSEO manquants. Configurez-les dans les paramètres.';
    } else {
      const res = await fetchMaps(params, creds.login, creds.pass);
      items = res.items;
      checkUrl = res.checkUrl;
      error = res.error ?? null;

      if (!error && items.length > 0) {
        const entry: MapsSearchEntry = {
          id: crypto.randomUUID().slice(0, 8),
          ts: Date.now(),
          keyword,
          location: params.location_coordinate ?? location,
          language,
          count: items.length,
        };
        saveMapsSearch(entry, items);
      }
    }
  }

  const hasQuery = historyId || keyword;

  // Target domain hits
  const targetHits = targetDomains
    .map((td) => {
      const match = items.find((r) => {
        const d = r.domain ?? extractDomain(r.url);
        return d.includes(td) || td.includes(d);
      });
      return match ? { domain: td, position: match.rank_group } : null;
    })
    .filter((h): h is { domain: string; position: number } => h !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Google Maps SERP</h1>
        <p className="text-sm text-slate-400 mt-1">Results Google Maps en temps réel via DataForSEO.</p>
      </div>

      {/* Form */}
      <SearchForm className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4" btnLabel="Analyze" btnClassName="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Keyword</label>
            <input
              type="text" name="keyword"
              defaultValue={activeEntry?.keyword ?? keyword}
              placeholder="ex: plombier paris"
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
            <input
              type="text" name="location"
              defaultValue={activeEntry?.location ?? location}
              placeholder="ex: Paris,Ile-de-France,France"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Coordonnées GPS <span className="text-slate-300 normal-case font-normal">(prioritaire)</span></label>
            <input
              type="text" name="location_coordinate"
              defaultValue={params.location_coordinate ?? ''}
              placeholder="ex: 48.8566,2.3522,14z"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
            <input
              type="text" name="language"
              defaultValue={activeEntry?.language ?? language}
              placeholder="ex: French"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Device</label>
            <select name="device" defaultValue={device}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Number of results</label>
            <select name="depth" defaultValue={String(depth)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

      {/* Target hits */}
      {hasQuery && !error && targetHits.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex flex-wrap gap-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 self-center">Target domains</span>
          {targetHits.map((h) => (
            <div key={h.domain} className="flex items-center gap-1.5 bg-white border border-emerald-200 rounded-lg px-3 py-1.5">
              <span className="text-xs font-bold text-emerald-700">{h.domain}</span>
              <span className="text-[10px] font-black text-white bg-emerald-500 rounded px-1.5 py-0.5">#{h.position}</span>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {hasQuery && !error && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Maps Results</h2>
              {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>}
            </div>
            <div className="flex items-center gap-3">
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
              {items.map((item, i) => {
                const domain = item.domain ?? extractDomain(item.url);
                const isTarget = targetDomains.some((td) => domain.includes(td) || td.includes(domain));
                return (
                  <div key={i} className={`px-6 py-5 hover:bg-slate-50 transition-colors ${isTarget ? 'bg-emerald-50 border-l-4 border-emerald-400' : ''}`}>
                    <div className="flex items-start gap-4">
                      <span className={`mt-0.5 w-8 h-8 shrink-0 rounded-lg text-xs font-black flex items-center justify-center ${isTarget ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {item.rank_group}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-bold text-slate-900">{item.title ?? '—'}</h3>
                              {item.is_claimed && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">Revendiqué</span>
                              )}
                              {isTarget && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">cible</span>
                              )}
                            </div>
                            {item.main_category && (
                              <p className="text-[11px] text-slate-400 mt-0.5">{item.main_category}</p>
                            )}
                            {item.rating && <StarRating rating={item.rating} />}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <PriceLevel level={item.price_level} />
                            {item.phone && (
                              <a href={`tel:${item.phone}`} className="text-xs font-mono text-blue-600 hover:text-blue-800 transition-colors">
                                {item.phone}
                              </a>
                            )}
                          </div>
                        </div>

                        {item.address && (
                          <p className="text-xs text-slate-500 mt-1.5">{item.address}</p>
                        )}

                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {item.url && (
                            <a href={item.url} target="_blank" rel="noopener noreferrer"
                              className="text-[11px] font-mono text-slate-400 hover:text-blue-600 truncate max-w-xs transition-colors">
                              {domain}
                            </a>
                          )}
                          {item.cid && (
                            <a href={`https://www.google.com/maps?cid=${item.cid}`} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 transition-colors">
                              Maps ↗
                            </a>
                          )}
                          {item.latitude && item.longitude && (
                            <a href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] font-mono text-slate-300 hover:text-slate-500 transition-colors">
                              {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/maps?history_id=${entry.id}`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{entry.keyword}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{entry.location} · {entry.count} result{entry.count !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
