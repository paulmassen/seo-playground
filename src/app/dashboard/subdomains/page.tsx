import { getCredentials, getSetting, getSubdomainsHistory, saveSubdomainsSearch, getSubdomainsResults, type SubdomainsEntry } from '@/lib/db';
import { LANGUAGES } from '@/lib/geo-options';
import LocationPicker from '@/components/LocationPicker';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { stableSearchId } from '@/lib/dedupe';
import SubdomainsTable from './SubdomainsTable';

interface SubdomainItem {
  subdomain?: string;
  metrics?: {
    organic?: {
      count?: number;
      etv?: number;
      estimated_paid_traffic_cost?: number;
    };
  };
}

interface SearchParams { target?: string; location?: string; language?: string; limit?: string; history_id?: string; }

async function fetchSubdomains(target: string, location: string, language: string, limit: number, login: string, pass: string): Promise<{ items: SubdomainItem[]; cost?: number; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/subdomains/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${login}:${pass}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ target, location_name: location, language_name: language, limit }]),
  });
  if (!res.ok) return { items: [], error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: SubdomainItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }
function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

export default async function SubdomainsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const rawTarget = params.target?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const limit = Math.min(parseInt(params.limit ?? '100', 10) || 100, 1000);
  const historyId = params.history_id;

  let items: SubdomainItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: SubdomainsEntry | null = null;

  if (historyId) {
    const saved = getSubdomainsResults<SubdomainItem>(historyId);
    if (saved) { items = saved; activeEntry = getSubdomainsHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Search no longer available.';
  } else if (rawTarget) {
    const dedupeId = stableSearchId(['subdomains', rawTarget, location, language, limit]);
    const cached = getSubdomainsResults<SubdomainItem>(dedupeId);

    if (cached) {
      items = cached;
      const cachedEntry = getSubdomainsHistory().find((e) => e.id === dedupeId);
      activeEntry = cachedEntry ?? null;
      cost = cachedEntry?.cost;
    } else if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
    else {
      const result = await fetchSubdomains(rawTarget, location, language, limit, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: SubdomainsEntry = { id: dedupeId, ts: Date.now(), target: rawTarget, location, language, count: items.length, cost };
        saveSubdomainsSearch(entry, items);
      }
    }
  }

  const history = getSubdomainsHistory();
  const displayTarget = activeEntry?.target ?? rawTarget;
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;

  const csvData = items.map((item) => ({
    subdomain: item.subdomain ?? '',
    keywords: item.metrics?.organic?.count ?? '',
    traffic: item.metrics?.organic?.etv?.toFixed(0) ?? '',
    traffic_cost: item.metrics?.organic?.estimated_paid_traffic_cost?.toFixed(2) ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Subdomains</h1>
        <p className="text-sm text-slate-400 mt-1">Top subdomains by organic traffic for any root domain.</p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Analyze" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Root domain</label>
            <input type="text" name="target" defaultValue={displayTarget} placeholder="example.com" required
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white dark:bg-slate-800" />
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
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Max results</label>
            <select name="limit" defaultValue={String(limit)} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800">
              {['50','100','200','500','1000'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {(historyId || rawTarget) && !error && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">{items.length} subdomains — {displayTarget}</span>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton data={csvData} columns={[{key:'subdomain',label:'Subdomain'},{key:'keywords',label:'Keywords'},{key:'traffic',label:'Est. Traffic (ETV)'},{key:'traffic_cost',label:'Traffic Value ($)'}]} />
                  <ExportCSVButton data={csvData} filename={`subdomains-${displayTarget}.csv`} columns={[{key:'subdomain',label:'Subdomain'},{key:'keywords',label:'Keywords'},{key:'traffic',label:'Est. Traffic (ETV)'},{key:'traffic_cost',label:'Traffic Value ($)'}]} />
                </div>
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No subdomains found.</div>
          ) : (
            <SubdomainsTable items={items} />
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
                <a key={entry.id} href={`/dashboard/subdomains?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.target}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{entry.count} subdomains · {entry.location}{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
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
