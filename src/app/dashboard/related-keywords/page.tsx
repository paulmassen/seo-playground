import {
  getCredentials, getSetting,
  getRelatedKwHistory, saveRelatedKwSearch, getRelatedKwResults,
  type RelatedKwSearchEntry,
} from '@/lib/db';
import ExportCSVButton from '@/components/ExportCSVButton';
import { LOCATIONS, LANGUAGES } from '@/lib/geo-options';
import SearchForm from '@/components/SearchForm';

interface RelatedKeywordItem {
  keyword_data?: {
    keyword?: string;
    search_volume?: number;
    cpc?: number;
    competition?: number;
    competition_index?: number;
    monthly_searches?: { year: number; month: number; search_volume: number }[];
  };
  related_keywords?: string[];
  keyword_difficulty?: number;
  avg_backlinks_info?: {
    referring_domains?: number;
  };
}

interface SearchParams {
  keyword?: string;
  location?: string;
  language?: string;
  depth?: string;
  limit?: string;
  history_id?: string;
}

async function fetchRelatedKeywords(
  keyword: string,
  location: string,
  language: string,
  depth: number,
  limit: number,
  login: string,
  pass: string,
): Promise<{ items: RelatedKeywordItem[]; cost?: number; error?: string }> {
  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      keyword,
      location_name: location,
      language_name: language,
      depth,
      limit,
      include_serp_info: true,
      include_clickstream_data: false,
    }]),
  });
  if (!res.ok) return { items: [], error: `Error API ${res.status}` };
  const data = await res.json() as {
    tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: RelatedKeywordItem[] }> }>;
  };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Réponse API vide.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

function DifficultyBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-slate-300 text-xs">—</span>;
  const color = value >= 70 ? 'bg-red-100 text-red-700'
    : value >= 50 ? 'bg-orange-100 text-orange-700'
    : value >= 30 ? 'bg-amber-100 text-amber-700'
    : 'bg-emerald-100 text-emerald-700';
  return <span className={`inline-flex items-center justify-center w-9 h-5 rounded text-[10px] font-black ${color}`}>{value}</span>;
}

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString("en-GB");
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function RelatedKeywordsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const keyword = params.keyword?.trim() ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const depth = Math.min(Math.max(parseInt(params.depth ?? '1', 10) || 1, 1), 4);
  const limit = Math.min(parseInt(params.limit ?? '100', 10) || 100, 1000);

  let items: RelatedKeywordItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: RelatedKwSearchEntry | null = null;

  if (historyId) {
    const saved = getRelatedKwResults<RelatedKeywordItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      const history = getRelatedKwHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
    } else {
      error = "Cette recherche n'est plus disponible.";
    }
  }

  const hasQuery = historyId || keyword;

  if (!historyId && keyword) {
    if (!creds) {
      error = 'Identifiants DataForSEO manquants. Configurez-les dans les paramètres.';
    } else {
      const result = await fetchRelatedKeywords(keyword, location, language, depth, limit, creds.login, creds.pass);
      items = result.items;
      cost = result.cost;
      error = result.error ?? null;

      if (!error && items.length > 0) {
        const entry: RelatedKwSearchEntry = {
          id: crypto.randomUUID().slice(0, 8),
          ts: Date.now(),
          keyword,
          location,
          language,
          depth,
          count: items.length,
          cost,
        };
        saveRelatedKwSearch(entry, items);
      }
    }
  }

  const history = getRelatedKwHistory();
  const displayKeyword = activeEntry?.keyword ?? keyword;
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;
  const displayDepth = activeEntry?.depth ?? depth;

  const csvData = items.map((item) => ({
    keyword: item.keyword_data?.keyword ?? '',
    search_volume: item.keyword_data?.search_volume ?? '',
    difficulty: item.keyword_difficulty ?? '',
    cpc: item.keyword_data?.cpc != null ? item.keyword_data.cpc.toFixed(2) : '',
    competition_index: item.keyword_data?.competition_index ?? '',
    ref_domains: item.avg_backlinks_info?.referring_domains ?? '',
    related_count: item.related_keywords?.length ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Related Keywords</h1>
        <p className="text-sm text-slate-400 mt-1">Related keywords from a source keyword via DataForSEO Labs.</p>
      </div>

      <SearchForm className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4" btnLabel="Search" btnClassName="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Keyword source</label>
            <input
              type="text" name="keyword"
              defaultValue={displayKeyword}
              placeholder="ex: plombier"
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
            <select name="location" defaultValue={displayLocation}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {LOCATIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
            <select name="language" defaultValue={displayLanguage}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Depth</label>
            <select name="depth" defaultValue={String(displayDepth)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="1">1 — Direct</option>
              <option value="2">2 — Étendu</option>
              <option value="3">3 — Large</option>
              <option value="4">4 — Exhaustif</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Nombre max de results</label>
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

      {hasQuery && !error && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Results</h2>
              {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              <span className="text-xs font-black text-slate-400">{items.length} result{items.length !== 1 ? 's' : ''}</span>
              {items.length > 0 && (
                <ExportCSVButton
                  data={csvData}
                  filename={`related-keywords-${displayKeyword}.csv`}
                  columns={[
                    { key: 'keyword', label: 'Keyword' },
                    { key: 'search_volume', label: 'Search Volume' },
                    { key: 'difficulty', label: 'Difficulty' },
                    { key: 'cpc', label: 'CPC' },
                    { key: 'competition_index', label: 'Competition Index' },
                    { key: 'ref_domains', label: 'Avg Referring Domains' },
                    { key: 'related_count', label: 'Related Count' },
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
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Keyword</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">KD</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Vol.</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">CPC</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden sm:table-cell">Comp.</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell">Ref. domains</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden lg:table-cell">Related</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item, i) => {
                    const kd = item.keyword_data;
                    return (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 font-medium text-slate-900 max-w-[200px]">
                          <span className="truncate block">{kd?.keyword ?? '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <DifficultyBadge value={item.keyword_difficulty} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                          {fmt(kd?.search_volume)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">
                          {kd?.cpc != null ? `$${kd.cpc.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden sm:table-cell">
                          {kd?.competition_index ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden md:table-cell">
                          {fmt(item.avg_backlinks_info?.referring_domains)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
                          {item.related_keywords && item.related_keywords.length > 0 ? (
                            <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              {item.related_keywords.length}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/related-keywords?history_id=${entry.id}`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{entry.keyword}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {entry.count} result{entry.count !== 1 ? 's' : ''}
                      {' · '}{entry.location} · profondeur {entry.depth}
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
