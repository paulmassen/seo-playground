export const dynamic = 'force-dynamic';

import {
  getCredentials,
  getKwOverviewHistory,
  saveKwOverviewSearch,
  getKwOverviewResults,
  getSetting,
  type KwOverviewSearchEntry,
} from '@/lib/db';
import { LOCATIONS, LANGUAGES } from '@/lib/geo-options';
import SearchForm from '@/components/SearchForm';

// ---- Types ----

interface MonthlySearch {
  year: number;
  month: number;
  search_volume: number;
}

interface KeywordInfo {
  search_volume?: number;
  cpc?: number;
  competition?: number;
  competition_level?: string;
  monthly_searches?: MonthlySearch[];
}

interface KeywordProperties {
  keyword_difficulty?: number;
}

interface SearchIntentInfo {
  main_intent?: string;
}

interface ImpressionsInfo {
  daily_impressions_min?: number;
  daily_impressions_max?: number;
}

export interface KwOverviewItem {
  keyword?: string;
  keyword_info?: KeywordInfo;
  keyword_properties?: KeywordProperties;
  search_intent_info?: SearchIntentInfo;
  impressions_info?: ImpressionsInfo;
}

interface SearchParams {
  keywords?: string;
  location?: string;
  language?: string;
  history_id?: string;
}

// ---- API ----

async function fetchKeywordOverview(
  keywords: string[],
  location: string,
  language: string,
  login: string,
  pass: string,
): Promise<{ items: KwOverviewItem[]; cost?: number; error?: string }> {
  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      keywords,
      location_name: location,
      language_name: language,
    }]),
  });

  if (!res.ok) return { items: [], error: `Error API ${res.status}: ${res.statusText}` };

  const data = await res.json() as {
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      cost?: number;
      result?: Array<{ items?: KwOverviewItem[] }>;
    }>;
  };

  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) {
    return { items: [], error: `DataForSEO: ${task.status_message}` };
  }
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

// ---- UI helpers ----

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function DifficultyBar({ value }: { value?: number }) {
  if (value === undefined) return <span className="text-slate-300">—</span>;
  const color = value >= 70 ? 'bg-red-500' : value >= 40 ? 'bg-amber-400' : 'bg-emerald-400';
  const textColor = value >= 70 ? 'text-red-600' : value >= 40 ? 'text-amber-600' : 'text-emerald-600';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-[11px] font-black tabular-nums ${textColor}`}>{value}</span>
    </div>
  );
}

function IntentBadge({ value }: { value?: string }) {
  if (!value) return <span className="text-slate-300">—</span>;
  const map: Record<string, string> = {
    informational: 'text-blue-600 bg-blue-50 border-blue-100',
    navigational: 'text-violet-600 bg-violet-50 border-violet-100',
    transactional: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    commercial: 'text-amber-600 bg-amber-50 border-amber-100',
  };
  const labels: Record<string, string> = {
    informational: 'Info',
    navigational: 'Nav',
    transactional: 'Transac',
    commercial: 'Commercial',
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${map[value] ?? 'text-slate-500 bg-slate-100 border-slate-200'}`}>
      {labels[value] ?? value}
    </span>
  );
}

function CompetitionBadge({ level }: { level?: string }) {
  if (!level) return <span className="text-slate-300">—</span>;
  const map: Record<string, string> = {
    HIGH: 'text-red-600 bg-red-50',
    MEDIUM: 'text-amber-600 bg-amber-50',
    LOW: 'text-emerald-600 bg-emerald-50',
  };
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${map[level] ?? 'text-slate-500 bg-slate-100'}`}>{level}</span>;
}

function Sparkline({ monthly }: { monthly?: MonthlySearch[] }) {
  const data = monthly?.slice(-12) ?? [];
  if (data.length === 0) return <span className="text-slate-300 text-xs">—</span>;
  const max = Math.max(...data.map((m) => m.search_volume ?? 0), 1);
  return (
    <div className="flex items-end gap-0.5 h-7" title={data.map((m) => `${MONTHS[m.month - 1]}: ${m.search_volume?.toLocaleString("en-GB")}`).join(' · ')}>
      {data.map((m, i) => (
        <div
          key={i}
          className="w-2 bg-blue-400 rounded-sm hover:bg-blue-600 transition-colors"
          style={{ height: `${Math.max(2, Math.round(((m.search_volume ?? 0) / max) * 28))}px` }}
        />
      ))}
    </div>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Page ----

export default async function KeywordOverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const rawKeywords = params.keywords ?? '';
  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'French';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;

  let items: KwOverviewItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: KwOverviewSearchEntry | null = null;

  if (historyId) {
    const saved = getKwOverviewResults<KwOverviewItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      const history = getKwOverviewHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
    } else {
      error = 'This search is no longer available.';
    }
  }

  const keywords = rawKeywords.split('\n').map((k) => k.trim()).filter(Boolean).slice(0, 1000);

  if (!historyId && keywords.length > 0) {
    if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const res = await fetchKeywordOverview(keywords, location, language, creds.login, creds.pass);
      items = res.items;
      cost = res.cost;
      error = res.error ?? null;

      if (!error && items.length > 0) {
        const label = keywords.slice(0, 3).join(', ');
        const entry: KwOverviewSearchEntry = {
          id: crypto.randomUUID().slice(0, 8),
          ts: Date.now(),
          keywords: label.length > 80 ? label.slice(0, 77) + '…' : label,
          location,
          language,
          count: items.length,
          cost,
        };
        saveKwOverviewSearch(entry, items);
      }
    }
  }

  const history = getKwOverviewHistory();
  const hasQuery = historyId || keywords.length > 0;

  // Aggregate stats
  const avgDifficulty = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.keyword_properties?.keyword_difficulty ?? 0), 0) / items.length)
    : null;
  const totalVolume = items.reduce((s, i) => s + (i.keyword_info?.search_volume ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Keyword Overview</h1>
        <p className="text-sm text-slate-400 mt-1">Detailed SEO metrics per keyword via DataForSEO Labs.</p>
      </div>

      {/* Form */}
      <SearchForm className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4" btnLabel="Analyze" btnClassName="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
              Keywords <span className="text-slate-300 normal-case font-normal">(one per line, max 1000)</span>
            </label>
            <textarea
              name="keywords"
              defaultValue={activeEntry ? '' : rawKeywords}
              rows={5}
              placeholder={"plombier paris\ndébouchage évier\nrobineterie fuite"}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-y"
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
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

      {/* Summary stats */}
      {hasQuery && !error && items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Keywords</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{items.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total volume</p>
            <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{totalVolume.toLocaleString("en-GB")}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Avg KD</p>
            <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{avgDifficulty ?? '—'}</p>
          </div>
        </div>
      )}

      {/* Results table */}
      {hasQuery && !error && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Results</h2>
              {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              <span className="text-xs font-black text-slate-400">{items.length} keyword{items.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No results.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Keyword</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Vol.</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Difficulty KD</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Intent</th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 hidden sm:table-cell">Competition</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell">CPC</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hidden xl:table-cell">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-900 max-w-xs">{item.keyword ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                        {item.keyword_info?.search_volume?.toLocaleString("en-GB") ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <DifficultyBar value={item.keyword_properties?.keyword_difficulty} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <IntentBadge value={item.search_intent_info?.main_intent} />
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <CompetitionBadge level={item.keyword_info?.competition_level} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden md:table-cell">
                        {item.keyword_info?.cpc != null ? `$${item.keyword_info.cpc.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <Sparkline monthly={item.keyword_info?.monthly_searches} />
                      </td>
                    </tr>
                  ))}
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
                <a key={entry.id} href={`/dashboard/keyword-overview?history_id=${entry.id}`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{entry.keywords}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {entry.location} · {entry.count} keyword{entry.count !== 1 ? 's' : ''}
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
