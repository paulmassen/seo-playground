import {
  getCredentials,
  getRankedKwHistory,
  saveRankedKwSearch,
  getRankedKwResults,
  type RankedKwSearchEntry,
} from '@/lib/db';
import ExportCSVButton from '@/components/ExportCSVButton';
import { LOCATIONS, LANGUAGES } from '@/lib/geo-options';
import SearchForm from '@/components/SearchForm';

// ---- Types ----

interface KeywordInfo {
  search_volume?: number;
  cpc?: number;
  competition?: number;
  competition_level?: string;
}

interface KeywordProperties {
  keyword_difficulty?: number;
}

interface SearchIntentInfo {
  main_intent?: string;
}

interface KeywordData {
  keyword?: string;
  keyword_info?: KeywordInfo;
  keyword_properties?: KeywordProperties;
  search_intent_info?: SearchIntentInfo;
}

interface SerpItem {
  type?: string;
  rank_group?: number;
  rank_absolute?: number;
  url?: string;
  title?: string;
  domain?: string;
  is_featured_snippet?: boolean;
}

interface RankedSerpElement {
  serp_item?: SerpItem;
}

export interface RankedKwItem {
  keyword_data?: KeywordData;
  ranked_serp_element?: RankedSerpElement;
}

interface SearchParams {
  target?: string;
  location?: string;
  language?: string;
  limit?: string;
  order_by?: string;
  max_position?: string;
  history_id?: string;
}

// ---- API ----

async function fetchRankedKeywords(
  target: string,
  location: string,
  language: string,
  limit: number,
  orderBy: string,
  maxPosition: number | null,
  login: string,
  pass: string,
): Promise<{ items: RankedKwItem[]; totalCount: number; cost?: number; error?: string }> {
  const body: Record<string, unknown> = {
    target: target.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
    location_name: location,
    language_name: language,
    limit,
    order_by: [orderBy],
  };

  if (maxPosition) {
    body.filters = ['ranked_serp_element.serp_item.rank_group', '<=', maxPosition];
  }

  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([body]),
  });

  if (!res.ok) return { items: [], totalCount: 0, error: `Error API ${res.status}: ${res.statusText}` };

  const data = await res.json() as {
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      cost?: number;
      result?: Array<{ total_count?: number; items?: RankedKwItem[] }>;
    }>;
  };

  const task = data?.tasks?.[0];
  if (!task) return { items: [], totalCount: 0, error: 'Réponse API vide.' };
  if (task.status_code && task.status_code !== 20000) {
    return { items: [], totalCount: 0, error: `DataForSEO: ${task.status_message}` };
  }

  const result = task.result?.[0];
  return {
    items: result?.items ?? [],
    totalCount: result?.total_count ?? 0,
    cost: task.cost,
  };
}

// ---- UI helpers ----

function DifficultyBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-slate-300">—</span>;
  const color =
    value >= 70 ? 'text-red-600 bg-red-50' :
    value >= 40 ? 'text-amber-600 bg-amber-50' :
    'text-emerald-600 bg-emerald-50';
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-black tabular-nums ${color}`}>{value}</span>;
}

function IntentBadge({ value }: { value?: string }) {
  if (!value) return <span className="text-slate-300">—</span>;
  const map: Record<string, string> = {
    informational: 'text-blue-600 bg-blue-50',
    navigational: 'text-violet-600 bg-violet-50',
    transactional: 'text-emerald-600 bg-emerald-50',
    commercial: 'text-amber-600 bg-amber-50',
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${map[value] ?? 'text-slate-500 bg-slate-100'}`}>
      {value.slice(0, 4)}
    </span>
  );
}

function PositionBadge({ pos }: { pos?: number }) {
  if (!pos) return <span className="text-slate-300">—</span>;
  const color =
    pos <= 3 ? 'bg-emerald-500 text-white' :
    pos <= 10 ? 'bg-blue-500 text-white' :
    pos <= 20 ? 'bg-slate-700 text-white' :
    'bg-slate-100 text-slate-500';
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-black ${color}`}>
      {pos}
    </span>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Page ----

export default async function RankedKeywordsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const target = params.target?.trim() ?? '';
  const location = params.location ?? 'France';
  const language = params.language ?? 'French';
  const limit = Math.min(parseInt(params.limit ?? '100', 10) || 100, 1000);
  const orderBy = params.order_by ?? 'ranked_serp_element.serp_item.rank_group,asc';
  const maxPosition = params.max_position ? parseInt(params.max_position, 10) : null;

  let items: RankedKwItem[] = [];
  let totalCount = 0;
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: RankedKwSearchEntry | null = null;

  if (historyId) {
    const saved = getRankedKwResults<RankedKwItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      const history = getRankedKwHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
      totalCount = activeEntry?.totalCount ?? items.length;
    } else {
      error = 'Cette recherche n\'est plus disponible.';
    }
  }

  if (!historyId && target) {
    if (!creds) {
      error = 'Identifiants DataForSEO manquants. Configurez-les dans les paramètres.';
    } else {
      const result = await fetchRankedKeywords(target, location, language, limit, orderBy, maxPosition, creds.login, creds.pass);
      items = result.items;
      totalCount = result.totalCount;
      cost = result.cost;
      error = result.error ?? null;

      if (!error && items.length > 0) {
        const entry: RankedKwSearchEntry = {
          id: crypto.randomUUID().slice(0, 8),
          ts: Date.now(),
          target: target.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
          location,
          language,
          count: items.length,
          totalCount,
          cost,
        };
        saveRankedKwSearch(entry, items);
      }
    }
  }

  const history = getRankedKwHistory();
  const hasQuery = historyId || target;

  // Stats
  const top3 = items.filter((i) => (i.ranked_serp_element?.serp_item?.rank_group ?? 999) <= 3).length;
  const top10 = items.filter((i) => (i.ranked_serp_element?.serp_item?.rank_group ?? 999) <= 10).length;
  const top20 = items.filter((i) => (i.ranked_serp_element?.serp_item?.rank_group ?? 999) <= 20).length;
  const avgPosition = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.ranked_serp_element?.serp_item?.rank_group ?? 0), 0) / items.length)
    : null;

  const displayTarget = activeEntry?.target ?? (target.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Ranked Keywords</h1>
        <p className="text-sm text-slate-400 mt-1">Keywords a domain ranks for in Google.</p>
      </div>

      {/* Form */}
      <SearchForm className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4" btnLabel="Analyze" btnClassName="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Target domain</label>
            <input
              type="text" name="target"
              defaultValue={activeEntry?.target ?? target}
              placeholder="ex: example.com"
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
            <select name="location" defaultValue={activeEntry?.location ?? location}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {LOCATIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
            <select name="language" defaultValue={activeEntry?.language ?? language}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Sort by</label>
            <select name="order_by" defaultValue={orderBy}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="ranked_serp_element.serp_item.rank_group,asc">Position (best first)</option>
              <option value="keyword_data.keyword_info.search_volume,desc">Search volume</option>
              <option value="keyword_data.keyword_properties.keyword_difficulty,desc">Difficulty (highest first)</option>
              <option value="keyword_data.keyword_properties.keyword_difficulty,asc">Difficulty (lowest first)</option>
              <option value="keyword_data.keyword_info.cpc,desc">CPC</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Max position filter</label>
            <select name="max_position" defaultValue={params.max_position ?? ''}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">All positions</option>
              <option value="3">Top 3</option>
              <option value="10">Top 10</option>
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
              <option value="100">Top 100</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Number of results</label>
            <select name="limit" defaultValue={String(limit)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
            </select>
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

      {/* Stats bar */}
      {hasQuery && !error && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total indexed', value: totalCount.toLocaleString("en-GB"), sub: `${items.length} shown` },
            { label: 'Avg position', value: avgPosition ?? '—', sub: 'of results' },
            { label: 'Top 10', value: top10, sub: `incl. top 3: ${top3}` },
            { label: 'Top 20', value: top20, sub: `positions 11–20 : ${top20 - top10}` },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
              <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{stat.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Results table */}
      {hasQuery && !error && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
                {displayTarget ? <><span className="text-slate-900">{displayTarget}</span> — ranked keywords</> : 'Ranked keywords'}
              </h2>
              {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              <span className="text-xs font-black text-slate-400">{items.length} mot{items.length !== 1 ? 's' : ''}-clé{items.length !== 1 ? 's' : ''}</span>
              {items.length > 0 && (
                <ExportCSVButton
                  data={items.map((i) => ({
                    keyword: i.keyword_data?.keyword ?? '',
                    position: i.ranked_serp_element?.serp_item?.rank_absolute ?? '',
                    volume: i.keyword_data?.keyword_info?.search_volume ?? '',
                    kd: i.keyword_data?.keyword_properties?.keyword_difficulty ?? '',
                    cpc: i.keyword_data?.keyword_info?.cpc ?? '',
                    url: i.ranked_serp_element?.serp_item?.url ?? '',
                  }))}
                  filename={`ranked-keywords-${displayTarget}.csv`}
                  columns={[
                    { key: 'keyword', label: 'Keyword' },
                    { key: 'position', label: 'Position' },
                    { key: 'volume', label: 'Volume' },
                    { key: 'kd', label: 'KD' },
                    { key: 'cpc', label: 'CPC' },
                    { key: 'url', label: 'URL' },
                  ]}
                />
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No keywords found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 w-12">Pos.</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Keyword</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hidden lg:table-cell">URL</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Vol.</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">KD</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 hidden sm:table-cell">Intent</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell">CPC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item, i) => {
                    const kw = item.keyword_data;
                    const serp = item.ranked_serp_element?.serp_item;
                    const pos = serp?.rank_group;
                    const url = serp?.url ?? '';
                    let urlDisplay = '';
                    try {
                      const u = new URL(url);
                      urlDisplay = u.pathname === '/' ? u.hostname : u.pathname;
                    } catch { urlDisplay = url; }

                    return (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-center">
                          <PositionBadge pos={pos} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">{kw?.keyword ?? '—'}</span>
                            {serp?.is_featured_snippet && (
                              <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded shrink-0">featured</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer"
                              className="text-[11px] font-mono text-slate-400 hover:text-blue-600 truncate max-w-[200px] block transition-colors">
                              {urlDisplay}
                            </a>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                          {kw?.keyword_info?.search_volume?.toLocaleString("en-GB") ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <DifficultyBadge value={kw?.keyword_properties?.keyword_difficulty} />
                        </td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          <IntentBadge value={kw?.search_intent_info?.main_intent} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden md:table-cell">
                          {kw?.keyword_info?.cpc != null ? `$${kw.keyword_info.cpc.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                <a key={entry.id} href={`/dashboard/ranked-keywords?history_id=${entry.id}`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate font-mono ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{entry.target}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {entry.location} · {entry.count} shown / {entry.totalCount.toLocaleString("en-GB")} total
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
  );
}
