import { getCredentials, getKdHistory, saveKdSearch, getKdResults, type KdHistoryEntry } from '@/lib/db';
import KeywordDataForm from './KeywordDataForm';

interface KeywordItem {
  keyword?: string;
  search_volume?: number;
  competition?: string | number;
  competition_index?: number;
  cpc?: number;
  low_top_of_page_bid?: number;
  high_top_of_page_bid?: number;
  monthly_searches?: { year: number; month: number; search_volume: number }[];
}

interface SearchParams {
  se?: string;
  se_type?: string;
  keywords?: string;
  target?: string;
  target_type?: string;
  location?: string;
  language?: string;
  search_partners?: string;
  include_adult_keywords?: string;
  device?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: string;
  history_id?: string;
}

function buildRequestBody(params: Record<string, string | undefined>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (params.location) body.location_name = params.location;
  if (params.language) body.language_name = params.language;
  if (params.search_partners === 'true') body.search_partners = true;
  if (params.date_from) body.date_from = params.date_from;
  if (params.date_to) body.date_to = params.date_to;
  if (params.sort_by && params.sort_by !== 'relevance') body.sort_by = params.sort_by;

  const seType = params.se_type ?? 'search_volume';
  if (seType === 'keywords_for_site') {
    body.target = params.target ?? '';
    if (params.target_type) body.target_type = params.target_type;
    if (params.include_adult_keywords === 'true') body.include_adult_keywords = true;
  } else {
    body.keywords = (params.keywords ?? '').split('\n').map((k) => k.trim()).filter(Boolean).slice(0, 1000);
    if (params.include_adult_keywords === 'true') body.include_adult_keywords = true;
  }
  if (params.se === 'bing' && params.device) body.device = params.device;
  return body;
}

async function fetchKeywordData(
  se: string, seType: string, body: Record<string, unknown>, login: string, pass: string,
): Promise<{ items: KeywordItem[]; cost?: number; error?: string }> {
  const auth = btoa(`${login}:${pass}`);
  const res = await fetch(`https://api.dataforseo.com/v3/keywords_data/${se}/${seType}/live`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([body]),
  });
  if (!res.ok) return { items: [], error: `Error API ${res.status}: ${res.statusText}` };
  const data = await res.json() as {
    tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: KeywordItem[] }>;
  };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Réponse API vide.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  return { items: task.result ?? [], cost: task.cost };
}

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const SE_LABELS: Record<string, string> = { google_ads: 'Google Ads', bing: 'Bing Ads' };
const TYPE_LABELS: Record<string, string> = {
  search_volume: 'Search Volume', keywords_for_site: 'Keywords For Site',
  keywords_for_keywords: 'Keywords For Keywords', ad_traffic_by_keywords: 'Ad Traffic', keyword_performance: 'Performance',
};

function CompetitionBadge({ value }: { value?: string | number }) {
  if (value === undefined || value === null) return <span className="text-slate-300">—</span>;
  const label = typeof value === 'string' ? value : value > 0.66 ? 'HIGH' : value > 0.33 ? 'MEDIUM' : 'LOW';
  const color = label === 'HIGH' ? 'text-red-500 bg-red-50' : label === 'MEDIUM' ? 'text-amber-500 bg-amber-50' : 'text-emerald-600 bg-emerald-50';
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${color}`}>{label}</span>;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function KeywordDataPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  let items: KeywordItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: KdHistoryEntry | null = null;

  if (historyId) {
    const saved = getKdResults<KeywordItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      const index = getKdHistory();
      activeEntry = index.find((e) => e.id === historyId) ?? null;
    } else {
      error = 'Cette recherche n\'est plus disponible.';
    }
  }

  const se = activeEntry?.se ?? params.se ?? 'google_ads';
  const seType = activeEntry?.seType ?? params.se_type ?? 'search_volume';
  const hasQuery = historyId || (seType === 'keywords_for_site' ? params.target?.trim() : params.keywords?.trim());

  if (!historyId && hasQuery) {
    if (!creds) {
      error = 'Identifiants DataForSEO manquants. Configurez-les dans les paramètres.';
    } else {
      const body = buildRequestBody(params as Record<string, string | undefined>);
      const result = await fetchKeywordData(se, seType, body, creds.login, creds.pass);
      items = result.items;
      cost = result.cost;
      error = result.error ?? null;

      if (!error && items.length > 0) {
        const label = seType === 'keywords_for_site'
          ? (params.target ?? 'site')
          : (params.keywords ?? '').split('\n').filter(Boolean).slice(0, 3).join(', ');
        const entry: KdHistoryEntry = {
          id: crypto.randomUUID().slice(0, 8),
          ts: Date.now(), se, seType,
          label: label.length > 60 ? label.slice(0, 57) + '…' : label,
          count: items.length, cost: result.cost,
          params: Object.fromEntries(
            Object.entries(params).filter(([k, v]) => k !== 'history_id' && v !== undefined)
          ) as Record<string, string>,
        };
        saveKdSearch(entry, items);
      }
    }
  }

  const historyIndex = getKdHistory();
  const sourceParams = activeEntry?.params ?? (params as Record<string, string | undefined>);
  const formDefaults = {
    se: sourceParams.se ?? 'google_ads', seType: sourceParams.se_type ?? 'search_volume',
    keywords: sourceParams.keywords ?? '', target: sourceParams.target ?? '',
    targetType: sourceParams.target_type ?? 'site', location: sourceParams.location ?? 'France',
    language: sourceParams.language ?? 'French', searchPartners: sourceParams.search_partners ?? 'false',
    includeAdult: sourceParams.include_adult_keywords ?? 'false', device: sourceParams.device ?? 'all',
    dateFrom: sourceParams.date_from ?? '', dateTo: sourceParams.date_to ?? '',
    sortBy: sourceParams.sort_by ?? 'relevance',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Keyword Data</h1>
        <p className="text-sm text-slate-400 mt-1">Volumes de recherche, CPC et données de concurrence via DataForSEO.</p>
      </div>

      <KeywordDataForm defaults={formDefaults} />

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
              <span className="text-xs font-black text-slate-400">{items.length} mot{items.length !== 1 ? 's' : ''}-clé{items.length !== 1 ? 's' : ''}</span>
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
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Vol.</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Compét.</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Index</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">CPC</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Bid Low</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Bid High</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hidden xl:table-cell">Tendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item, i) => {
                    const monthly = item.monthly_searches?.slice(-12) ?? [];
                    const maxVol = Math.max(...monthly.map((m) => m.search_volume ?? 0), 1);
                    return (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 font-medium text-slate-900 max-w-xs">{item.keyword ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">{item.search_volume?.toLocaleString("en-GB") ?? '—'}</td>
                        <td className="px-4 py-3 text-center"><CompetitionBadge value={item.competition} /></td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">{item.competition_index ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">{item.cpc != null ? `$${item.cpc.toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">{item.low_top_of_page_bid != null ? `$${item.low_top_of_page_bid.toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">{item.high_top_of_page_bid != null ? `$${item.high_top_of_page_bid.toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-3 hidden xl:table-cell">
                          {monthly.length > 0 ? (
                            <div className="flex items-end gap-0.5 h-7">
                              {monthly.map((m, j) => (
                                <div key={j} title={`${MONTHS[m.month - 1]} ${m.year}: ${m.search_volume?.toLocaleString("en-GB")}`}
                                  className="w-2.5 bg-blue-400 rounded-sm hover:bg-blue-600 transition-colors"
                                  style={{ height: `${Math.max(2, Math.round(((m.search_volume ?? 0) / maxVol) * 28))}px` }} />
                              ))}
                            </div>
                          ) : <span className="text-slate-300 text-xs">—</span>}
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

      {historyIndex.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Search history</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {historyIndex.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/keyword-data?history_id=${entry.id}`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                  <div className="shrink-0 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{SE_LABELS[entry.se] ?? entry.se}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">{TYPE_LABELS[entry.seType] ?? entry.seType}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{entry.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {entry.count} result{entry.count !== 1 ? 's' : ''}{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
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
