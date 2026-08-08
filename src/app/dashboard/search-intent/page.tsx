import { getCredentials, getSetting, getSearchIntentHistory, saveSearchIntentSearch, getSearchIntentResults, type SearchIntentEntry } from '@/lib/db';
import { LANGUAGES } from '@/lib/geo-options';
import LocationPicker from '@/components/LocationPicker';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';

interface IntentItem {
  keyword?: string;
  keyword_intent?: { label?: string; probability?: number } | null;
  secondary_keyword_intents?: Array<{ label?: string; probability?: number }> | null;
}

interface SearchParams { keywords?: string; location?: string; language?: string; history_id?: string; }

async function fetchIntent(keywords: string[], location: string, language: string, login: string, pass: string): Promise<{ items: IntentItem[]; cost?: number; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/search_intent/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${login}:${pass}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ keywords, location_name: location, language_name: language }]),
  });
  if (!res.ok) return { items: [], error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: IntentItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

const INTENT_CONFIG: Record<string, { label: string; cls: string }> = {
  informational: { label: 'Informational', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  navigational:  { label: 'Navigational',  cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  commercial:    { label: 'Commercial',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  transactional: { label: 'Transactional', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

function IntentBadge({ intent }: { intent?: string }) {
  if (!intent) return <span className="text-slate-300 text-xs">—</span>;
  const cfg = INTENT_CONFIG[intent];
  if (!cfg) return <span className="text-xs text-slate-500">{intent}</span>;
  return <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${cfg.cls}`}>{cfg.label}</span>;
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

export default async function SearchIntentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const rawKeywords = params.keywords?.trim() ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const historyId = params.history_id;

  let items: IntentItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: SearchIntentEntry | null = null;

  if (historyId) {
    const saved = getSearchIntentResults<IntentItem>(historyId);
    if (saved) { items = saved; activeEntry = getSearchIntentHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Search no longer available.';
  } else if (rawKeywords) {
    const kwList = rawKeywords.split('\n').map((k) => k.trim()).filter(Boolean).slice(0, 1000);
    if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
    else {
      const result = await fetchIntent(kwList, location, language, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: SearchIntentEntry = { id: crypto.randomUUID().slice(0, 8), ts: Date.now(), keywords: kwList.join(', '), location, language, count: items.length, cost };
        saveSearchIntentSearch(entry, items);
      }
    }
  }

  const history = getSearchIntentHistory();
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;

  const getMainIntent = (item: IntentItem) => item.keyword_intent?.label;
  const getSecondaryIntents = (item: IntentItem) =>
    item.secondary_keyword_intents?.map((s) => s.label).filter(Boolean) as string[] | undefined;

  const intentCounts = items.reduce<Record<string, number>>((acc, item) => {
    const intent = getMainIntent(item) ?? 'unknown';
    acc[intent] = (acc[intent] ?? 0) + 1;
    return acc;
  }, {});

  const csvData = items.map((item) => ({
    keyword: item.keyword ?? '',
    intent: getMainIntent(item) ?? '',
    secondary: (getSecondaryIntents(item) ?? []).join(', '),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Search Intent</h1>
        <p className="text-sm text-slate-400 mt-1">Classify keywords by intent: informational, navigational, commercial or transactional.</p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Classify" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Keywords <span className="normal-case font-normal tracking-normal text-slate-300">(one per line, max 1000)</span></label>
            <textarea name="keywords" rows={6} defaultValue={activeEntry?.keywords?.split(', ').join('\n') ?? rawKeywords} placeholder={"plombier paris\ndébouchage urgence\nmeilleur plombier"} required
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-y bg-white dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
            <LocationPicker name="location" defaultValue={displayLocation} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800" scope="labs" />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
            <select name="language" defaultValue={displayLanguage} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800">
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {/* Intent summary pills */}
      {items.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(intentCounts).sort((a, b) => b[1] - a[1]).map(([intent, count]) => {
            const cfg = INTENT_CONFIG[intent];
            return (
              <div key={intent} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${cfg?.cls ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                <span>{cfg?.label ?? intent}</span>
                <span className="font-black">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {(historyId || rawKeywords) && !error && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">{items.length} keywords</span>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              {items.length > 0 && <ExportCSVButton data={csvData} filename="search-intent.csv" columns={[{key:'keyword',label:'Keyword'},{key:'intent',label:'Main Intent'},{key:'secondary',label:'Secondary Intents'}]} />}
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
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Main intent</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell">Secondary intents</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {items.map((item, i) => {
                    const secondary = getSecondaryIntents(item);
                    return (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-3 text-[11px] font-mono text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-200">{item.keyword ?? '—'}</td>
                      <td className="px-4 py-3 text-center"><IntentBadge intent={getMainIntent(item)} /></td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex gap-1 flex-wrap">
                          {secondary?.map((s) => <IntentBadge key={s} intent={s} />)}
                        </div>
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
                <a key={entry.id} href={`/dashboard/search-intent?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.keywords}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{entry.count} keywords · {entry.location}{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
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
