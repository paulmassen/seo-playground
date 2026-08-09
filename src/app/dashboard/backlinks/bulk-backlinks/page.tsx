import { getCredentials, getBlBulkBlHistory, saveBlBulkBl, getBlBulkBlResults, type BlBulkBlEntry } from '@/lib/db';
import { stableSearchId } from '@/lib/dedupe';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import BulkBacklinksTable from './BulkBacklinksTable';

interface BulkBlItem {
  target?: string;
  backlinks?: number;
}

interface SearchParams { targets?: string; history_id?: string; }

async function fetchBulkBacklinks(targets: string[], login: string, pass: string): Promise<{ items: BulkBlItem[]; cost?: number; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/backlinks/bulk_backlinks/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${login}:${pass}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ targets }]),
  });
  if (!res.ok) return { items: [], error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: BulkBlItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

export default async function BulkBacklinksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const rawTargets = params.targets?.trim() ?? '';
  const historyId = params.history_id;

  let items: BulkBlItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: BlBulkBlEntry | null = null;

  if (historyId) {
    const saved = getBlBulkBlResults<BulkBlItem>(historyId);
    if (saved) { items = saved; activeEntry = getBlBulkBlHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Search no longer available.';
  } else if (rawTargets) {
    const targetList = rawTargets.split('\n').map((t) => t.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')).filter(Boolean).slice(0, 1000);
    const dedupeId = stableSearchId(['bulk-backlinks', targetList.join(',')]);
    const cached = getBlBulkBlResults<BulkBlItem>(dedupeId);
    if (cached) {
      items = cached;
      cost = getBlBulkBlHistory().find((e) => e.id === dedupeId)?.cost;
    } else if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
    else {
      const result = await fetchBulkBacklinks(targetList, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: BlBulkBlEntry = { id: dedupeId, ts: Date.now(), targets: targetList.join(', '), count: items.length, cost };
        saveBlBulkBl(entry, items);
      }
    }
  }

  const history = getBlBulkBlHistory();
  const sorted = [...items].sort((a, b) => (b.backlinks ?? 0) - (a.backlinks ?? 0));

  const csvData = sorted.map((item) => ({
    target: item.target ?? '',
    backlinks: item.backlinks ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-1">
          <a href="/dashboard/backlinks" className="hover:text-slate-600 transition-colors">Backlinks</a>
          <span className="text-slate-200">/</span>
          <span className="text-slate-600">Bulk Backlinks</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Bulk Backlinks</h1>
        <p className="text-sm text-slate-400 mt-1">
          Total backlink count for a list of domains in a single request.{' '}
          Need referring domains/IPs instead? Use <a href="/dashboard/backlinks/bulk-referring-domains" className="text-blue-600 hover:underline">Bulk Ref. Domains</a>.
        </p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Fetch" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Domains <span className="normal-case font-normal tracking-normal text-slate-300">(one per line)</span></label>
          <textarea name="targets" rows={6} defaultValue={activeEntry?.targets?.split(', ').join('\n') ?? rawTargets} placeholder={"example.com\ncompetitor.com\nanother.fr"} required
            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-y bg-white dark:bg-slate-800" />
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {(historyId || rawTargets) && !error && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">{sorted.length} domains</span>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              {sorted.length > 0 && <CopyMarkdownButton data={csvData} columns={[{key:'target',label:'Domain'},{key:'backlinks',label:'Backlinks'}]} />}
              {sorted.length > 0 && <ExportCSVButton data={csvData} filename="bulk-backlinks.csv" columns={[{key:'target',label:'Domain'},{key:'backlinks',label:'Backlinks'}]} />}
            </div>
          </div>
          {sorted.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No results found.</div>
          ) : (
            <BulkBacklinksTable items={sorted} />
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
                <a key={entry.id} href={`/dashboard/backlinks/bulk-backlinks?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.targets}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{entry.count} domains{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
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
