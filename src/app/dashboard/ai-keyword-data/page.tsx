export const dynamic = 'force-dynamic';

import {
  getCredentials, getSetting,
  getAiKwDataHistory, saveAiKwDataSearch, getAiKwDataResults,
  type AiKwDataEntry,
} from '@/lib/db';
import { LANGUAGES } from '@/lib/geo-options';
import LocationPicker from '@/components/LocationPicker';
import SearchForm from '@/components/SearchForm';
import HistorySidebar from '@/components/HistorySidebar';

// ---- Types ----

interface MonthlyAiSearch {
  year: number;
  month: number;
  ai_search_volume: number;
}

interface AiKeywordItem {
  keyword?: string;
  ai_search_volume?: number;
  ai_monthly_searches?: MonthlyAiSearch[];
}

interface SearchParams {
  keywords?: string;
  location?: string;
  language?: string;
  history_id?: string;
}

// ---- API ----

async function fetchAiKeywordData(
  keywords: string[],
  location: string,
  language: string,
  login: string,
  pass: string,
): Promise<{ items: AiKeywordItem[]; cost?: number; error?: string }> {
  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/ai_optimization/ai_keyword_data/keywords_search_volume/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ keywords, location_name: location, language_name: language }]),
  });
  if (!res.ok) return { items: [], error: `API error ${res.status}: ${res.statusText}` };

  const data = await res.json() as {
    tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: AiKeywordItem[] }> }>;
  };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

// ---- UI helpers ----

function Sparkline({ monthly }: { monthly?: MonthlyAiSearch[] }) {
  const data = [...(monthly ?? [])].reverse().slice(-12);
  if (data.length === 0) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const max = Math.max(...data.map((m) => m.ai_search_volume ?? 0), 1);
  return (
    <div className="flex items-end gap-0.5 h-6"
      title={data.map((m) => `${m.month}/${m.year}: ${m.ai_search_volume?.toLocaleString('en-GB')}`).join(' · ')}>
      {data.map((m, i) => (
        <div
          key={i}
          className="w-1.5 bg-violet-300 dark:bg-violet-500 rounded-sm"
          style={{ height: `${Math.max(2, Math.round(((m.ai_search_volume ?? 0) / max) * 24))}px` }}
        />
      ))}
    </div>
  );
}

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-GB');
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Page ----

export default async function AiKeywordDataPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const keywords = params.keywords?.trim() ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;

  let items: AiKeywordItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: AiKwDataEntry | null = null;

  if (historyId) {
    const saved = getAiKwDataResults<AiKeywordItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      activeEntry = getAiKwDataHistory().find((e) => e.id === historyId) ?? null;
    } else {
      error = 'Search no longer available.';
    }
  }

  const hasQuery = !!(historyId || keywords);

  if (!historyId && keywords) {
    if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const kwList = keywords.split('\n').map((k) => k.trim()).filter(Boolean).slice(0, 1000);
      const result = await fetchAiKeywordData(kwList, location, language, creds.login, creds.pass);
      items = result.items;
      cost = result.cost;
      error = result.error ?? null;

      if (!error && items.length > 0) {
        const label = kwList.slice(0, 3).join(', ') + (kwList.length > 3 ? '…' : '');
        const entry: AiKwDataEntry = {
          id: crypto.randomUUID().slice(0, 8),
          ts: Date.now(),
          keywords: label,
          location,
          language,
          count: items.length,
          cost,
        };
        saveAiKwDataSearch(entry, items);
      }
    }
  }

  const history = getAiKwDataHistory();
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;
  const totalVolume = items.reduce((s, i) => s + (i.ai_search_volume ?? 0), 0);

  const historyItems = history.map((entry) => {
    const isActive = entry.id === historyId;
    return (
      <a key={entry.id} href={`/dashboard/ai-keyword-data?history_id=${entry.id}#results`}
        className={`flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950/40' : ''}`}>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.keywords}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {entry.count} keyword{entry.count !== 1 ? 's' : ''}
            {' · '}{entry.location}
            {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
      </a>
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">AI Keyword Data</h1>
        <p className="text-sm text-slate-400 mt-1">Search volume estimates reflecting keyword usage in AI tools (ChatGPT, Gemini, etc.), via DataForSEO.</p>
      </div>

      {!creds && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 text-amber-700 dark:text-amber-400 text-sm rounded-xl px-4 py-3">
          DataForSEO credentials missing. Configure them in{' '}
          <a href="/dashboard/settings" className="underline font-semibold">settings</a>.
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-6">
          <SearchForm
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4"
            btnLabel="Analyze"
            btnClassName="w-full bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-violet-600 dark:hover:bg-violet-500 dark:hover:text-white transition-colors"
            loadingLabel="Fetching AI search volume…"
            disabled={!creds}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Keywords <span className="text-slate-300 dark:text-slate-600 font-normal normal-case tracking-normal">(one per line, max 1000)</span>
                </label>
                <textarea
                  name="keywords"
                  defaultValue={activeEntry ? '' : keywords}
                  rows={6}
                  placeholder={'plombier paris\nmeilleur restaurant italien\nseo agi'}
                  required
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all font-mono resize-y dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
                <LocationPicker name="location" defaultValue={displayLocation} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
                <select name="language" defaultValue={displayLanguage}
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800">
                  {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>
          </SearchForm>

          {error && <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

          {hasQuery && !error && items.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Keywords</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{items.length}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total AI volume</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{totalVolume.toLocaleString('en-GB')}</p>
              </div>
            </div>
          )}

          {hasQuery && !error && (
            <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Results</h2>
                  {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md">History</span>}
                </div>
                <div className="flex items-center gap-3">
                  {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
                  <span className="text-xs font-black text-slate-400">{items.length} keyword{items.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
              {items.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-slate-400">No results found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
                        <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Keyword</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">AI volume</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">12mo trend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {items
                        .sort((a, b) => (b.ai_search_volume ?? 0) - (a.ai_search_volume ?? 0))
                        .map((item, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                            <td className="px-6 py-3 font-medium text-slate-900 dark:text-white max-w-xs">{item.keyword ?? '—'}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                              {fmt(item.ai_search_volume)}
                            </td>
                            <td className="px-4 py-3">
                              <Sparkline monthly={item.ai_monthly_searches} />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!hasQuery && !error && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm px-6 py-16 text-center">
              <p className="text-slate-400 text-sm">Enter keywords above to see their estimated search volume inside AI tools.</p>
              <p className="text-slate-300 dark:text-slate-600 text-xs mt-1">Powered by DataForSEO AI Keyword Data API.</p>
            </div>
          )}
        </div>

        {history.length > 0 && (
          <HistorySidebar title="History" items={historyItems} />
        )}
      </div>
    </div>
  );
}
