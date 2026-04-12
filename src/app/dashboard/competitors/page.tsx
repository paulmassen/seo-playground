import {
  getCredentials,
  getCompetitorsHistory,
  saveCompetitorsSearch,
  getCompetitorsResults,
  type CompetitorsSearchEntry,
} from '@/lib/db';
import ExportCSVButton from '@/components/ExportCSVButton';
import { LOCATIONS, LANGUAGES } from '@/lib/geo-options';
import SearchForm from '@/components/SearchForm';

// ---- Types ----

interface DomainMetricsOrganic {
  count?: number;
  estimated_traffic?: number;
  is_new?: number;
  is_up?: number;
  is_down?: number;
  is_lost?: number;
}

interface DomainMetrics {
  organic?: DomainMetricsOrganic;
}

export interface CompetitorItem {
  domain?: string;
  avg_position?: number;
  sum_position?: number;
  intersections?: number;
  full_domain_metrics?: DomainMetrics;
  metrics?: DomainMetrics;
}

interface SearchParams {
  target?: string;
  location?: string;
  language?: string;
  limit?: string;
  history_id?: string;
}

// ---- API ----

async function fetchCompetitors(
  target: string,
  location: string,
  language: string,
  limit: number,
  login: string,
  pass: string,
): Promise<{ items: CompetitorItem[]; cost?: number; error?: string }> {
  const clean = target.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      target: clean,
      location_name: location,
      language_name: language,
      limit,
    }]),
  });

  if (!res.ok) return { items: [], error: `Error API ${res.status}: ${res.statusText}` };

  const data = await res.json() as {
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      cost?: number;
      result?: Array<{ items?: CompetitorItem[] }>;
    }>;
  };

  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Réponse API vide.' };
  if (task.status_code && task.status_code !== 20000) {
    return { items: [], error: `DataForSEO: ${task.status_message}` };
  }
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

// ---- UI helpers ----

function fmt(n?: number, decimals = 0) {
  if (n === undefined || n === null) return '—';
  return decimals > 0 ? n.toFixed(decimals) : n.toLocaleString("en-GB");
}

function TrafficBadge({ value }: { value?: number }) {
  if (!value) return <span className="text-slate-300">—</span>;
  const color = value >= 10000 ? 'text-emerald-700 bg-emerald-50'
    : value >= 1000 ? 'text-blue-700 bg-blue-50'
    : 'text-slate-600 bg-slate-100';
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-black tabular-nums ${color}`}>{n(value)}</span>;
}

function n(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Page ----

export default async function CompetitorsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const target = params.target?.trim() ?? '';
  const location = params.location ?? 'France';
  const language = params.language ?? 'French';
  const limit = Math.min(parseInt(params.limit ?? '20', 10) || 20, 100);

  let items: CompetitorItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: CompetitorsSearchEntry | null = null;

  if (historyId) {
    const saved = getCompetitorsResults<CompetitorItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      const history = getCompetitorsHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
    } else {
      error = 'Cette recherche n\'est plus disponible.';
    }
  }

  if (!historyId && target) {
    if (!creds) {
      error = 'Identifiants DataForSEO manquants. Configurez-les dans les paramètres.';
    } else {
      const res = await fetchCompetitors(target, location, language, limit, creds.login, creds.pass);
      items = res.items;
      cost = res.cost;
      error = res.error ?? null;

      if (!error && items.length > 0) {
        const entry: CompetitorsSearchEntry = {
          id: crypto.randomUUID().slice(0, 8),
          ts: Date.now(),
          target: target.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
          location,
          language,
          count: items.length,
          cost,
        };
        saveCompetitorsSearch(entry, items);
      }
    }
  }

  const history = getCompetitorsHistory();
  const hasQuery = historyId || target;
  const displayTarget = activeEntry?.target ?? target.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

  // Max intersections for bar scaling
  const maxIntersections = Math.max(...items.map((i) => i.intersections ?? 0), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Competitors</h1>
        <p className="text-sm text-slate-400 mt-1">Domains that rank for the same keywords as your target.</p>
      </div>

      {/* Form */}
      <SearchForm className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4" btnLabel="Analyze" btnClassName="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Target domain</label>
            <input
              type="text" name="target"
              defaultValue={activeEntry?.target ?? target}
              placeholder="ex: example.com"
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono transition-all"
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
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Number of competitors</label>
            <select name="limit" defaultValue={String(limit)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

      {/* Results */}
      {hasQuery && !error && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
                {displayTarget
                  ? <><span className="text-slate-900">{displayTarget}</span> — competitors</>
                  : 'Concurrents'}
              </h2>
              {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              <span className="text-xs font-black text-slate-400">{items.length} competitor{items.length !== 1 ? 's' : ''}</span>
              {items.length > 0 && (
                <ExportCSVButton
                  data={items.map((item) => ({
                    domain: item.domain ?? '',
                    intersections: item.intersections ?? '',
                    avg_position: item.avg_position ?? '',
                    traffic: item.full_domain_metrics?.organic?.estimated_traffic ?? item.metrics?.organic?.estimated_traffic ?? '',
                    total_kw: item.full_domain_metrics?.organic?.count ?? item.metrics?.organic?.count ?? '',
                  }))}
                  filename={`competitors-${displayTarget}.csv`}
                  columns={[
                    { key: 'domain', label: 'Domain' },
                    { key: 'intersections', label: 'Common KWs' },
                    { key: 'avg_position', label: 'Avg Position' },
                    { key: 'traffic', label: 'Est. Traffic' },
                    { key: 'total_kw', label: 'Total KWs' },
                  ]}
                />
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No competitors found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-5 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 w-10">#</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Competitor domain</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Common keywords</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Avg pos.</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden sm:table-cell">Est. traffic</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell">Total KW</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item, i) => {
                    const intersections = item.intersections ?? 0;
                    const barPct = Math.round((intersections / maxIntersections) * 100);
                    const traffic = item.metrics?.organic?.estimated_traffic;
                    const totalKw = item.full_domain_metrics?.organic?.count;

                    return (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3 text-center">
                          <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 text-xs font-black flex items-center justify-center mx-auto">
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={`https://${item.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono font-bold text-slate-900 hover:text-blue-600 transition-colors text-sm"
                          >
                            {item.domain}
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 tabular-nums w-10 shrink-0">{fmt(intersections)}</span>
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
                              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${barPct}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">
                          {item.avg_position ? item.avg_position.toFixed(1) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          <TrafficBadge value={traffic} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden md:table-cell">
                          {fmt(totalKw)}
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
                <a key={entry.id} href={`/dashboard/competitors?history_id=${entry.id}`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold font-mono truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{entry.target}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {entry.location} · {entry.count} competitor{entry.count !== 1 ? 's' : ''}
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
