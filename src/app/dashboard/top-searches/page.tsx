import {
  getCredentials, getSetting,
  getTopSearchesHistory, saveTopSearches, getTopSearchesResults,
  type TopSearchesEntry,
} from '@/lib/db';
import ExportCSVButton from '@/components/ExportCSVButton';
import { LANGUAGES } from '@/lib/geo-options';
import LocationPicker from '@/components/LocationPicker';
import SearchForm from '@/components/SearchForm';

interface MonthlySearch {
  year: number;
  month: number;
  search_volume: number;
}

interface TopSearchItem {
  keyword: string;
  keyword_info?: {
    search_volume?: number;
    cpc?: number;
    competition?: number;
    competition_level?: string;
    monthly_searches?: MonthlySearch[];
  };
  keyword_properties?: {
    keyword_difficulty?: number;
    word_count?: number;
    detected_language?: string;
  };
  search_intent_info?: {
    main_intent?: string;
  };
  avg_backlinks_info?: {
    referring_domains?: number;
  };
}

interface SearchParams {
  location?: string;
  language?: string;
  limit?: string;
  ignore_synonyms?: string;
  history_id?: string;
}

async function fetchTopSearches(
  location: string,
  language: string,
  limit: number,
  ignoreSynonyms: boolean,
  login: string,
  pass: string,
): Promise<{ items: TopSearchItem[]; totalCount?: number; cost?: number; error?: string }> {
  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/top_searches/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      location_name: location,
      language_name: language,
      limit,
      ignore_synonyms: ignoreSynonyms,
      include_serp_info: false,
    }]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { items: [], error: `Erreur API ${res.status}` };
  const data = await res.json() as {
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      cost?: number;
      result?: Array<{ items?: TopSearchItem[]; total_count?: number }>;
    }>;
  };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  return {
    items: task.result?.[0]?.items ?? [],
    totalCount: task.result?.[0]?.total_count,
    cost: task.cost,
  };
}

function DifficultyBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-slate-300 text-xs">—</span>;
  const color = value >= 70 ? 'bg-red-100 text-red-700'
    : value >= 50 ? 'bg-orange-100 text-orange-700'
    : value >= 30 ? 'bg-amber-100 text-amber-700'
    : 'bg-emerald-100 text-emerald-700';
  return <span className={`inline-flex items-center justify-center w-9 h-5 rounded text-[10px] font-black ${color}`}>{value}</span>;
}

function IntentBadge({ intent }: { intent?: string }) {
  if (!intent) return <span className="text-slate-300 text-xs">—</span>;
  const map: Record<string, string> = {
    informational: 'bg-blue-50 text-blue-600',
    navigational: 'bg-purple-50 text-purple-600',
    commercial: 'bg-amber-50 text-amber-700',
    transactional: 'bg-emerald-50 text-emerald-700',
  };
  const cls = map[intent] ?? 'bg-slate-100 text-slate-500';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide ${cls}`}>{intent.slice(0, 5)}</span>;
}

function TrendSparkline({ monthly }: { monthly?: MonthlySearch[] }) {
  if (!monthly || monthly.length === 0) return <span className="text-slate-300 text-xs">—</span>;
  const sorted = [...monthly].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  const values = sorted.map((m) => m.search_volume);
  const max = Math.max(...values, 1);
  const w = 60, h = 20;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-GB');
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const COST_PER_1000 = 0.05;

export default async function TopSearchesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const limit = Math.min(Math.max(parseInt(params.limit ?? '100', 10) || 100, 1), 1000);
  const ignoreSynonyms = params.ignore_synonyms === 'true';

  let items: TopSearchItem[] = [];
  let cost: number | undefined;
  let totalCount: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: TopSearchesEntry | null = null;

  if (historyId) {
    const saved = getTopSearchesResults<TopSearchItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      const history = getTopSearchesHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
      totalCount = activeEntry?.totalCount;
      cost = activeEntry?.cost;
    } else {
      error = "Cette recherche n'est plus disponible.";
    }
  }

  const hasQuery = !!(historyId || params.location || params.language || params.limit);

  if (!historyId && (params.location || params.language || params.limit)) {
    if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const result = await fetchTopSearches(location, language, limit, ignoreSynonyms, creds.login, creds.pass);
      items = result.items;
      cost = result.cost;
      totalCount = result.totalCount;
      error = result.error ?? null;

      if (!error && items.length > 0) {
        const entry: TopSearchesEntry = {
          id: crypto.randomUUID().slice(0, 8),
          ts: Date.now(),
          location,
          language,
          limitCount: limit,
          count: items.length,
          totalCount,
          cost,
        };
        saveTopSearches(entry, items);
      }
    }
  }

  const history = getTopSearchesHistory();
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;
  const displayLimit = activeEntry?.limitCount ?? limit;

  const estimatedCost = (limit * COST_PER_1000 / 1000).toFixed(4);

  const csvData = items.map((item) => ({
    keyword: item.keyword ?? '',
    search_volume: item.keyword_info?.search_volume ?? '',
    cpc: item.keyword_info?.cpc != null ? item.keyword_info.cpc.toFixed(2) : '',
    competition_level: item.keyword_info?.competition_level ?? '',
    keyword_difficulty: item.keyword_properties?.keyword_difficulty ?? '',
    word_count: item.keyword_properties?.word_count ?? '',
    intent: item.search_intent_info?.main_intent ?? '',
    ref_domains: item.avg_backlinks_info?.referring_domains ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Top Searches</h1>
        <p className="text-sm text-slate-400 mt-1">Keywords les plus recherchés pour une localisation et langue données via DataForSEO Labs.</p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Search" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
            <LocationPicker name="location" defaultValue={displayLocation} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
            <select name="language" defaultValue={displayLanguage}
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800">
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Number of results</label>
            <select name="limit" defaultValue={String(displayLimit)}
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800">
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3 cursor-pointer pb-2.5">
              <input type="checkbox" name="ignore_synonyms" value="true" defaultChecked={ignoreSynonyms}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">Ignore synonyms</span>
            </label>
          </div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-100 dark:border-amber-900 rounded-xl px-4 py-3">
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Cost: <span className="font-black">${COST_PER_1000} / 1,000 keywords</span> — estimated for {limit} results:{' '}
            <span className="font-black">${estimatedCost}</span>
          </p>
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {hasQuery && !error && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Results</h2>
              {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
              {totalCount !== undefined && (
                <span className="text-[10px] text-slate-400 font-mono">{fmt(totalCount)} total</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              <span className="text-xs font-black text-slate-400">{items.length} keyword{items.length !== 1 ? 's' : ''}</span>
              {items.length > 0 && (
                <ExportCSVButton
                  data={csvData}
                  filename={`top-searches-${displayLocation}-${displayLanguage}.csv`}
                  columns={[
                    { key: 'keyword', label: 'Keyword' },
                    { key: 'search_volume', label: 'Search Volume' },
                    { key: 'cpc', label: 'CPC' },
                    { key: 'competition_level', label: 'Competition' },
                    { key: 'keyword_difficulty', label: 'KD' },
                    { key: 'word_count', label: 'Word Count' },
                    { key: 'intent', label: 'Intent' },
                    { key: 'ref_domains', label: 'Avg Ref. Domains' },
                  ]}
                />
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No results found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">#</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Keyword</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">KD</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Vol.</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">CPC</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 hidden sm:table-cell">Intent</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell">Comp.</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden lg:table-cell">Ref. Dom.</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden xl:table-cell">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {items.map((item, i) => {
                    const ki = item.keyword_info;
                    const kp = item.keyword_properties;
                    const compLevel = ki?.competition_level;
                    const compColor = compLevel === 'HIGH' ? 'text-red-500 bg-red-50 dark:bg-red-950'
                      : compLevel === 'MEDIUM' ? 'text-amber-600 bg-amber-50 dark:bg-amber-950'
                      : compLevel === 'LOW' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950'
                      : 'text-slate-400 bg-slate-100 dark:bg-slate-800';
                    return (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-3 text-[11px] font-mono text-slate-400 tabular-nums">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-[220px]">
                          <span className="truncate block">{item.keyword}</span>
                          {kp?.word_count !== undefined && (
                            <span className="text-[10px] text-slate-400">{kp.word_count} mot{kp.word_count !== 1 ? 's' : ''}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <DifficultyBadge value={kp?.keyword_difficulty} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                          {fmt(ki?.search_volume)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">
                          {ki?.cpc != null ? `$${ki.cpc.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center hidden sm:table-cell">
                          <IntentBadge intent={item.search_intent_info?.main_intent} />
                        </td>
                        <td className="px-4 py-3 text-center hidden md:table-cell">
                          {compLevel ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black ${compColor}`}>
                              {compLevel}
                            </span>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden lg:table-cell">
                          {fmt(item.avg_backlinks_info?.referring_domains)}
                        </td>
                        <td className="px-4 py-3 text-right hidden xl:table-cell">
                          <TrendSparkline monthly={ki?.monthly_searches} />
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

      {history.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/top-searches?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>
                      {entry.location} · {entry.language}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {entry.count} keywords
                      {entry.totalCount !== undefined ? ` / ${fmt(entry.totalCount)} total` : ''}
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
