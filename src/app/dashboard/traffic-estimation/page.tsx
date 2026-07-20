import { getCredentials, getSetting, getTrafficEstimationHistory, saveTrafficEstimationSearch, getTrafficEstimationResults, type TrafficEstimationEntry } from '@/lib/db';
import { LANGUAGES } from '@/lib/geo-options';
import LocationPicker from '@/components/LocationPicker';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';

interface TrafficMetrics { count?: number; etv?: number; impressions_etv?: number; }
interface TrafficItem { target?: string; metrics?: { organic?: TrafficMetrics; paid?: TrafficMetrics } }

interface SearchParams { targets?: string; location?: string; language?: string; history_id?: string; }

async function fetchTraffic(targets: string[], location: string, language: string, login: string, pass: string): Promise<{ items: TrafficItem[]; cost?: number; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/bulk_traffic_estimation/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${login}:${pass}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ targets, location_name: location, language_name: language }]),
  });
  if (!res.ok) return { items: [], error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: TrafficItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }
function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

function TrafficBar({ value, max }: { value?: number; max: number }) {
  if (!value || max === 0) return <span className="text-slate-300 text-xs">0</span>;
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 tabular-nums">{fmt(value)}</span>
    </div>
  );
}

export default async function TrafficEstimationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const rawTargets = params.targets?.trim() ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const historyId = params.history_id;

  let items: TrafficItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: TrafficEstimationEntry | null = null;

  if (historyId) {
    const saved = getTrafficEstimationResults<TrafficItem>(historyId);
    if (saved) { items = saved; activeEntry = getTrafficEstimationHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Search no longer available.';
  } else if (rawTargets) {
    const targetList = rawTargets.split('\n').map((t) => t.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')).filter(Boolean).slice(0, 1000);
    if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
    else {
      const result = await fetchTraffic(targetList, location, language, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: TrafficEstimationEntry = { id: crypto.randomUUID().slice(0, 8), ts: Date.now(), targets: targetList.join(', '), location, language, count: items.length, cost };
        saveTrafficEstimationSearch(entry, items);
      }
    }
  }

  const history = getTrafficEstimationHistory();
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;

  const sorted = [...items].sort((a, b) => (b.metrics?.organic?.etv ?? 0) - (a.metrics?.organic?.etv ?? 0));
  const maxEtv = Math.max(...sorted.map((i) => i.metrics?.organic?.etv ?? 0), 1);

  const csvData = sorted.map((item) => {
    const org = item.metrics?.organic;
    return {
      target: item.target ?? '',
      keywords: org?.count ?? '',
      traffic: org?.etv ?? '',
      paid_keywords: item.metrics?.paid?.count ?? '',
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Traffic Estimation</h1>
        <p className="text-sm text-slate-400 mt-1">Bulk organic traffic estimate for a list of domains.</p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Estimate" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Domains <span className="normal-case font-normal tracking-normal text-slate-300">(one per line)</span></label>
            <textarea name="targets" rows={6} defaultValue={activeEntry?.targets?.split(', ').join('\n') ?? rawTargets} placeholder={"example.com\ncompetitor.com\nanother.fr"} required
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-y bg-white dark:bg-slate-800" />
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

      {(historyId || rawTargets) && !error && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">{items.length} domains</span>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              {items.length > 0 && <ExportCSVButton data={csvData} filename="traffic-estimation.csv" columns={[{key:'target',label:'Domain'},{key:'keywords',label:'Keywords'},{key:'traffic',label:'Est. Traffic (ETV)'},{key:'paid_keywords',label:'Paid KWs'}]} />}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No results found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Domain</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Est. traffic (ETV)</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Keywords</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden sm:table-cell">Paid KWs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {sorted.map((item, i) => {
                    const org = item.metrics?.organic;
                    return (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-3 font-mono text-sm text-slate-900 dark:text-slate-200 font-medium">{item.target ?? '—'}</td>
                        <td className="px-4 py-3"><TrafficBar value={org?.etv} max={maxEtv} /></td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">{fmt(org?.count)}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden sm:table-cell">{fmt(item.metrics?.paid?.count)}</td>
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
                <a key={entry.id} href={`/dashboard/traffic-estimation?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.targets}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{entry.count} domains · {entry.location}{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
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
