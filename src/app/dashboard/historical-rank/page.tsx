export const dynamic = 'force-dynamic';

import { getCredentials, getHistRankHistory, saveHistRankSearch, getHistRankResults, getSetting } from '@/lib/db';
import { LOCATIONS, LANGUAGES } from '@/lib/geo-options';
import SearchForm from '@/components/SearchForm';

interface HistRankItem {
  se_type?: string;
  year: number;
  month: number;
  metrics: {
    organic?: {
      count?: number;
      pos_1?: number;
      pos_2_3?: number;
      pos_4_10?: number;
      pos_11_20?: number;
      pos_21_30?: number;
      pos_31_40?: number;
      pos_41_50?: number;
      pos_51_60?: number;
      pos_61_70?: number;
      pos_71_80?: number;
      pos_81_90?: number;
      pos_91_100?: number;
      etv?: number;
    };
  };
}

interface SearchParams {
  target?: string;
  location?: string;
  language?: string;
  history_id?: string;
}

async function fetchHistRank(target: string, location: string, language: string, login: string, pass: string): Promise<{ items: HistRankItem[]; cost: number; error?: string }> {
  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/historical_rank_overview/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ target, location_name: location, language_name: language }]),
  });
  if (!res.ok) return { items: [], cost: 0, error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: HistRankItem[] }> }> };
  const task = data.tasks?.[0];
  if (!task) return { items: [], cost: 0, error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) {
    return { items: [], cost: 0, error: `DataForSEO: ${task.status_message} (${task.status_code})` };
  }
  return {
    items: task.result?.[0]?.items ?? [],
    cost: task.cost ?? 0,
  };
}

function formatMonth(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono font-bold text-slate-600 w-10 text-right">{value.toLocaleString()}</span>
    </div>
  );
}

export default async function HistoricalRankPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const history = getHistRankHistory();
  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'French';
  const defaultDomain = getSetting('default_domain') ?? '';

  const params = await searchParams;
  const historyId = params.history_id;
  const target = params.target?.trim() ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;

  let items: HistRankItem[] = [];
  let error = '';
  let cost = 0;

  if (historyId) {
    items = getHistRankResults<HistRankItem>(historyId) ?? [];
  } else if (target && creds) {
    try {
      const result = await fetchHistRank(target, location, language, creds.login, creds.pass);
      if (result.error) {
        error = result.error;
      } else {
        items = result.items;
        cost = result.cost;
        const id = crypto.randomUUID();
        saveHistRankSearch({ id, ts: Date.now(), target, location, language, cost }, items);
      }
    } catch (e) {
      error = String(e);
    }
  }

  // Sort ascending (oldest → newest) for sparkline; descending for table
  const sorted = [...items].sort((a, b) => (a.year - b.year) || (a.month - b.month));
  const maxCount = Math.max(...sorted.map((i) => i.metrics.organic?.count ?? 0), 1);

  // Sparkline
  const sparkData = sorted.map((i) => i.metrics.organic?.count ?? 0);
  const sparkMax = Math.max(...sparkData, 1);
  const W = 300;
  const H = 48;
  const xStep = sparkData.length > 1 ? W / (sparkData.length - 1) : 0;
  const sparkPath = sparkData.map((v, i) => {
    const x = i * xStep;
    const y = H - (v / sparkMax) * (H - 4) - 2;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Historical Rank Overview</h1>
        <p className="text-slate-500 text-sm mt-1 font-medium">Monthly keyword count evolution for a domain</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          <SearchForm className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4" btnLabel="Analyze" btnClassName="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all disabled:opacity-40" disabled={!creds}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Domain</label>
                <input name="target" type="text" defaultValue={target || defaultDomain} placeholder="example.com" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-medium text-slate-900 transition-all" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</label>
                <select name="location" defaultValue={location} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-medium text-slate-900">
                  {LOCATIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Language</label>
                <select name="language" defaultValue={language} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-medium text-slate-900">
                  {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            </div>
            {!creds && <p className="text-xs text-amber-600 font-medium">Configure API credentials in Settings first.</p>}
          </SearchForm>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-3 text-sm">{error}</div>}

          {sorted.length > 0 && (
            <div className="space-y-4">
              {/* Sparkline card */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Total Keywords in Google Top 100
                  {cost > 0 && <span className="ml-3 text-slate-300">· ${cost.toFixed(4)}</span>}
                </p>
                <div className="flex items-end gap-6">
                  <svg width={W} height={H} className="overflow-visible">
                    <defs>
                      <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {sparkData.length > 1 && (
                      <path d={sparkPath + ` L ${((sparkData.length - 1) * xStep).toFixed(1)} ${H} L 0 ${H} Z`} fill="url(#sparkGrad)" />
                    )}
                    {sparkData.length > 1 && <path d={sparkPath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
                  </svg>
                  <div>
                    <div className="text-3xl font-black text-slate-900">{(sorted[sorted.length - 1]?.metrics.organic?.count ?? 0).toLocaleString()}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest">Latest ({formatMonth(sorted[sorted.length - 1].year, sorted[sorted.length - 1].month)})</div>
                  </div>
                </div>
              </div>

              {/* Monthly table */}
              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Month</th>
                      <th className="text-left px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total KWs</th>
                      <th className="text-right px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">#1</th>
                      <th className="text-right px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">2–3</th>
                      <th className="text-right px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">4–10</th>
                      <th className="text-right px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">11–30</th>
                      <th className="text-right px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">ETV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[...sorted].reverse().map((item, i) => {
                      const m = item.metrics.organic ?? {};
                      return (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="px-5 py-3 font-bold text-slate-800">{formatMonth(item.year, item.month)}</td>
                          <td className="px-3 py-3">
                            <Bar value={m.count ?? 0} max={maxCount} color="bg-blue-400" />
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-black text-emerald-600">{(m.pos_1 ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-3 text-right font-mono text-blue-500">{(m.pos_2_3 ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-3 text-right font-mono text-slate-600">{(m.pos_4_10 ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-3 text-right font-mono text-slate-400">{((m.pos_11_20 ?? 0) + (m.pos_21_30 ?? 0)).toLocaleString()}</td>
                          <td className="px-3 py-3 text-right font-mono text-slate-500">{Math.round(m.etv ?? 0).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* History */}
        <div>
          <div className="bg-white border border-slate-200 rounded-3xl p-5 sticky top-6">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">History</h2>
            {history.length === 0 ? (
              <p className="text-xs text-slate-400">No searches yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <a key={h.id} href={`?history_id=${h.id}`} className="block rounded-xl px-3 py-2.5 hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200">
                    <div className="font-bold text-xs text-slate-800">{h.target}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {h.location} · {new Date(h.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
