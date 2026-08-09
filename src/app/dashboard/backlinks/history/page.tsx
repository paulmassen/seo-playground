import { getCredentials, getSetting, getBlHistHistory, saveBlHist, getBlHistResults, type BlHistEntry } from '@/lib/db';
import { stableSearchId } from '@/lib/dedupe';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import BacklinksHistoryTable from './BacklinksHistoryTable';

interface HistoryPoint {
  date?: string;
  backlinks?: number;
  new_backlinks?: number;
  lost_backlinks?: number;
  referring_domains?: number;
  new_referring_domains?: number;
  lost_referring_domains?: number;
  referring_main_domains?: number;
}

interface SearchParams { target?: string; history_id?: string; }

async function fetchHistory(target: string, login: string, pass: string): Promise<{ items: HistoryPoint[]; cost?: number; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/backlinks/history/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${login}:${pass}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ target }]),
  });
  if (!res.ok) return { items: [], error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: HistoryPoint[] }> }> };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }
function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

function SparkChart({ points, key1, key2, color1, color2 }: {
  points: HistoryPoint[];
  key1: keyof HistoryPoint;
  key2?: keyof HistoryPoint;
  color1: string;
  color2?: string;
}) {
  const vals1 = points.map((p) => (p[key1] as number | undefined) ?? 0);
  const vals2 = key2 ? points.map((p) => (p[key2] as number | undefined) ?? 0) : [];
  const allVals = [...vals1, ...vals2].filter((v) => v > 0);
  if (allVals.length < 2) return <div className="h-24 flex items-center justify-center text-xs text-slate-300">Not enough data</div>;

  const maxV = Math.max(...allVals);
  const minV = 0;
  const range = maxV - minV || 1;
  const W = 500, H = 80, PAD = { l: 0, r: 0, t: 8, b: 8 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;
  const n = points.length;
  const toX = (i: number) => PAD.l + (i / Math.max(n - 1, 1)) * cW;
  const toY = (v: number) => PAD.t + (1 - (v - minV) / range) * cH;

  const makePath = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${H}px` }}>
      <path d={makePath(vals1)} fill="none" stroke={color1} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {vals2.length > 0 && <path d={makePath(vals2)} fill="none" stroke={color2} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 2" />}
      <circle cx={toX(n - 1)} cy={toY(vals1[n - 1])} r="3" fill={color1} />
    </svg>
  );
}

export default async function BacklinksHistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultDomain = getSetting('default_domain') ?? '';
  const rawTarget = params.target?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '';
  const historyId = params.history_id;

  let items: HistoryPoint[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: BlHistEntry | null = null;

  if (historyId) {
    const saved = getBlHistResults<HistoryPoint>(historyId);
    if (saved) { items = saved; activeEntry = getBlHistHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Search no longer available.';
  } else if (rawTarget) {
    const dedupeId = stableSearchId(['backlinks-history', rawTarget]);
    const cached = getBlHistResults<HistoryPoint>(dedupeId);
    if (cached) {
      items = cached;
      cost = getBlHistHistory().find((e) => e.id === dedupeId)?.cost;
    } else if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
    else {
      const result = await fetchHistory(rawTarget, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: BlHistEntry = { id: dedupeId, ts: Date.now(), target: rawTarget, count: items.length, cost };
        saveBlHist(entry, items);
      }
    }
  }

  const searchHistory = getBlHistHistory();
  const displayTarget = activeEntry?.target ?? rawTarget;
  const sorted = [...items].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const latest = sorted[sorted.length - 1];

  const csvData = sorted.map((p) => ({
    date: p.date ?? '',
    backlinks: p.backlinks ?? '',
    new_backlinks: p.new_backlinks ?? '',
    lost_backlinks: p.lost_backlinks ?? '',
    referring_domains: p.referring_domains ?? '',
    new_referring_domains: p.new_referring_domains ?? '',
    lost_referring_domains: p.lost_referring_domains ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
          <a href="/dashboard/backlinks" className="hover:text-slate-600 transition-colors">Backlinks</a>
          <span className="text-slate-200">/</span>
          <span className="text-slate-600">History</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Backlink History</h1>
        <p className="text-sm text-slate-400 mt-1">Monthly evolution of backlinks and referring domains over time.</p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Load history" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Domain</label>
          <input type="text" name="target" defaultValue={displayTarget || defaultDomain} placeholder="example.com" required
            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white dark:bg-slate-800" />
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {(historyId || rawTarget) && !error && sorted.length > 0 && (
        <div className="space-y-4">
          {/* KPI snapshot */}
          {latest && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Backlinks', value: fmt(latest.backlinks) },
                { label: 'Ref. domains', value: fmt(latest.referring_domains) },
                { label: 'New (last period)', value: fmt(latest.new_backlinks), accent: 'bg-emerald-50 border-emerald-100 dark:bg-emerald-950 dark:border-emerald-900' },
                { label: 'Lost (last period)', value: fmt(latest.lost_backlinks), accent: latest.lost_backlinks ? 'bg-red-50 border-red-100 dark:bg-red-950 dark:border-red-900' : undefined },
              ].map((card) => (
                <div key={card.label} className={`rounded-xl border px-4 py-3 ${card.accent ?? 'bg-slate-50 border-slate-100 dark:bg-slate-800 dark:border-slate-700'}`}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{card.label}</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">{card.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Backlinks over time</p>
              <SparkChart points={sorted} key1="backlinks" color1="#3b82f6" />
              <div className="flex gap-4 mt-3 text-[10px] text-slate-400">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-blue-500 rounded" /> Total</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Referring domains over time</p>
              <SparkChart points={sorted} key1="referring_domains" color1="#10b981" />
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">New vs Lost backlinks</p>
              <SparkChart points={sorted} key1="new_backlinks" key2="lost_backlinks" color1="#10b981" color2="#ef4444" />
              <div className="flex gap-4 mt-3 text-[10px] text-slate-400">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-emerald-500 rounded" /> New</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-red-400 rounded border-dashed" /> Lost</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">New vs Lost referring domains</p>
              <SparkChart points={sorted} key1="new_referring_domains" key2="lost_referring_domains" color1="#10b981" color2="#ef4444" />
            </div>
          </div>

          {/* Table */}
          <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">{sorted.length} data points</span>
              <div className="flex items-center gap-3">
                {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
                <CopyMarkdownButton data={csvData} columns={[{key:'date',label:'Date'},{key:'backlinks',label:'Backlinks'},{key:'new_backlinks',label:'New'},{key:'lost_backlinks',label:'Lost'},{key:'referring_domains',label:'Ref. Domains'},{key:'new_referring_domains',label:'New RD'},{key:'lost_referring_domains',label:'Lost RD'}]} />
                <ExportCSVButton data={csvData} filename={`backlinks-history-${displayTarget}.csv`} columns={[{key:'date',label:'Date'},{key:'backlinks',label:'Backlinks'},{key:'new_backlinks',label:'New'},{key:'lost_backlinks',label:'Lost'},{key:'referring_domains',label:'Ref. Domains'},{key:'new_referring_domains',label:'New RD'},{key:'lost_referring_domains',label:'Lost RD'}]} />
              </div>
            </div>
            <BacklinksHistoryTable points={sorted} />
          </div>
        </div>
      )}

      {searchHistory.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {searchHistory.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/backlinks/history?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.target}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{entry.count} data points{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
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
