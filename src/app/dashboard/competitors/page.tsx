import {
  getCredentials,
  getCompetitorsHistory,
  saveCompetitorsSearch,
  getCompetitorsResults,
  type CompetitorsSearchEntry,
} from '@/lib/db';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { LANGUAGES } from '@/lib/geo-options';
import LocationPicker from '@/components/LocationPicker';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import CompetitorsTable from './CompetitorsTable';

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
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) {
    return { items: [], error: `DataForSEO: ${task.status_message}` };
  }
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

// ---- UI helpers ----

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
      error = 'This search is no longer available.';
    }
  }

  if (!historyId && target) {
    const cleanTarget = target.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const dedupeId = stableSearchId(['competitors', cleanTarget, location, language, limit]);
    const cached = getCompetitorsResults<CompetitorItem>(dedupeId);

    if (cached) {
      items = cached;
      const cachedEntry = getCompetitorsHistory().find((e) => e.id === dedupeId);
      cost = cachedEntry?.cost;
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const res = await fetchCompetitors(target, location, language, limit, creds.login, creds.pass);
      items = res.items;
      cost = res.cost;
      error = res.error ?? null;

      if (!error && items.length > 0) {
        const entry: CompetitorsSearchEntry = {
          id: dedupeId,
          ts: Date.now(),
          target: cleanTarget,
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
              placeholder="e.g. example.com"
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
            <LocationPicker name="location" defaultValue={activeEntry?.location ?? location} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" scope="labs" />
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
        <div id="results" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
                {displayTarget
                  ? <><span className="text-slate-900">{displayTarget}</span> — competitors</>
                  : 'Competitors'}
              </h2>
              {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              <span className="text-xs font-black text-slate-400">{items.length} competitor{items.length !== 1 ? 's' : ''}</span>
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton
                    data={items.map((item) => ({
                      domain: item.domain ?? '',
                      intersections: item.intersections ?? '',
                      avg_position: item.avg_position ?? '',
                      traffic: item.full_domain_metrics?.organic?.estimated_traffic ?? item.metrics?.organic?.estimated_traffic ?? '',
                      total_kw: item.full_domain_metrics?.organic?.count ?? item.metrics?.organic?.count ?? '',
                    }))}
                    columns={[
                      { key: 'domain', label: 'Domain' },
                      { key: 'intersections', label: 'Common KWs' },
                      { key: 'avg_position', label: 'Avg Position' },
                      { key: 'traffic', label: 'Est. Traffic' },
                      { key: 'total_kw', label: 'Total KWs' },
                    ]}
                  />
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
                </div>
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No competitors found.</div>
          ) : (
            <CompetitorsTable items={items} maxIntersections={maxIntersections} />
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
                <a key={entry.id} href={`/dashboard/competitors?history_id=${entry.id}#results`}
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
