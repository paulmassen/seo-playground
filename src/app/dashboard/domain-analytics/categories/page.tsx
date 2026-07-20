import { getCredentials, getSetting, getDomainCategoriesHistory, saveDomainCategoriesSearch, getDomainCategoriesResults, type DomainCategoriesEntry } from '@/lib/db';
import { LANGUAGES } from '@/lib/geo-options';
import LocationPicker from '@/components/LocationPicker';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';

interface CategoryItem {
  categories?: number[];
  metrics?: {
    organic?: { etv?: number; count?: number };
  };
}

interface SearchParams { target?: string; location?: string; language?: string; history_id?: string; }

async function fetchCategories(target: string, location: string, language: string, login: string, pass: string): Promise<{ items: CategoryItem[]; cost?: number; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/categories_for_domain/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${login}:${pass}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ target, location_name: location, language_name: language }]),
  });
  if (!res.ok) return { items: [], error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: CategoryItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

export default async function DomainCategoriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const rawTarget = params.target?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const historyId = params.history_id;

  let items: CategoryItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: DomainCategoriesEntry | null = null;

  if (historyId) {
    const saved = getDomainCategoriesResults<CategoryItem>(historyId);
    if (saved) { items = saved; activeEntry = getDomainCategoriesHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Search no longer available.';
  } else if (rawTarget) {
    if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
    else {
      const result = await fetchCategories(rawTarget, location, language, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: DomainCategoriesEntry = { id: crypto.randomUUID().slice(0, 8), ts: Date.now(), target: rawTarget, location, language, count: items.length, cost };
        saveDomainCategoriesSearch(entry, items);
      }
    }
  }

  const history = getDomainCategoriesHistory();
  const displayTarget = activeEntry?.target ?? rawTarget;
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;

  const totalEtv = items.reduce((sum, i) => sum + (i.metrics?.organic?.etv ?? 0), 0);

  const csvData = items.map((item) => ({
    category_code: item.categories?.[0] ?? '',
    keywords: item.metrics?.organic?.count ?? '',
    etv: item.metrics?.organic?.etv?.toFixed(0) ?? '',
  }));

  const maxEtv = Math.max(...items.map((i) => i.metrics?.organic?.etv ?? 0), 1);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
          <a href="/dashboard/domain-analytics" className="hover:text-slate-600 transition-colors">Domain Analytics</a>
          <span className="text-slate-200">/</span>
          <span className="text-slate-600">Categories</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Domain Categories</h1>
        <p className="text-sm text-slate-400 mt-1">Thematic categories that best describe a domain&apos;s organic content.</p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Analyze" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Domain</label>
            <input type="text" name="target" defaultValue={displayTarget} placeholder="example.com" required
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
            <LocationPicker name="location" defaultValue={displayLocation} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800" />
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

      {(historyId || rawTarget) && !error && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">{items.length} categories — {displayTarget}</span>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              {items.length > 0 && <ExportCSVButton data={csvData} filename={`categories-${displayTarget}.csv`} columns={[{key:'category_code',label:'Category Code'},{key:'keywords',label:'Keywords'},{key:'etv',label:'Est. Traffic (ETV)'}]} />}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No categories found.</div>
          ) : (
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {items.map((item, i) => {
                const etv = item.metrics?.organic?.etv ?? 0;
                const count = item.metrics?.organic?.count ?? 0;
                const barW = Math.round((etv / maxEtv) * 100);
                const share = totalEtv > 0 ? ((etv / totalEtv) * 100).toFixed(1) : '0.0';
                const codes = item.categories ?? [];
                return (
                  <div key={i} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="w-10 text-right text-[11px] font-mono text-slate-400 tabular-nums shrink-0">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {codes.map((c) => (
                          <span key={c} className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                        <span className="text-[11px] text-slate-400">{count.toLocaleString('en-GB')} keywords</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${barW}%` }} />
                        </div>
                        <span className="text-[11px] font-black text-slate-500 tabular-nums shrink-0">{share}%</span>
                        <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">{Math.round(etv).toLocaleString('en-GB')} ETV</span>
                      </div>
                    </div>
                  </div>
                );
              })}
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
                <a key={entry.id} href={`/dashboard/domain-analytics/categories?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.target}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{entry.count} categories{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
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
