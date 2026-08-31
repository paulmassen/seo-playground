export const dynamic = 'force-dynamic';

import { getCredentials, getAnchorsHistory, saveAnchorsSearch, getAnchorsResults, getSetting } from '@/lib/db';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import SearchForm from '@/components/SearchForm';
import AnchorsTable from './AnchorsTable';

interface AnchorItem {
  anchor: string;
  backlinks: number;
  referring_domains: number;
  broken_backlinks: number;
  broken_pages: number;
  dofollow: number;
  nofollow: number;
  first_seen: string;
  last_seen: string;
}

interface SearchParams {
  target?: string;
  limit?: string;
  history_id?: string;
}

async function fetchAnchors(target: string, limit: number, login: string, pass: string): Promise<{ items: AnchorItem[]; total: number; cost: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: AnchorItem[] }>(
    'backlinks/anchors/live',
    { target, limit, order_by: ['backlinks,desc'], include_subdomains: true },
    { login, pass },
  );
  if (error) return { items: [], total: 0, cost: 0, error };
  return { items: result?.items ?? [], total: result?.total_count ?? 0, cost: cost ?? 0 };
}

export default async function AnchorsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const history = getAnchorsHistory();
  const defaultDomain = getSetting('default_domain') ?? '';

  const params = await searchParams;
  const historyId = params.history_id;
  const target = params.target?.trim() ?? '';
  const limit = Math.min(Number(params.limit ?? 100), 1000);

  let items: AnchorItem[] = [];
  let total = 0;
  let error = '';
  let cost = 0;

  if (historyId) {
    items = getAnchorsResults<AnchorItem>(historyId) ?? [];
    const entry = history.find((h) => h.id === historyId);
    total = entry?.total ?? items.length;
  } else if (target && creds) {
    const dedupeId = stableSearchId(['anchors', target, limit]);
    const cached = getAnchorsResults<AnchorItem>(dedupeId);
    if (cached) {
      items = cached;
      const cachedEntry = history.find((h) => h.id === dedupeId);
      total = cachedEntry?.total ?? items.length;
      cost = cachedEntry?.cost ?? 0;
    } else {
      try {
        const result = await fetchAnchors(target, limit, creds.login, creds.pass);
        if (result.error) {
          error = result.error;
        } else {
          items = result.items;
          total = result.total;
          cost = result.cost;
          saveAnchorsSearch({ id: dedupeId, ts: Date.now(), target, cost, total }, items);
        }
      } catch (e) {
        error = String(e);
      }
    }
  }

  const csvData = items.map((i) => ({
    anchor: i.anchor,
    backlinks: i.backlinks,
    referring_domains: i.referring_domains,
    dofollow: i.dofollow,
    nofollow: i.nofollow,
    broken: i.broken_backlinks,
    first_seen: i.first_seen?.split('T')[0] ?? '',
  }));

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Anchors</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium">Anchor text distribution of backlinks</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          <SearchForm className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4" btnLabel="Analyze" btnClassName="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-none transition-all disabled:opacity-40" disabled={!creds}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Domain</label>
                <input name="target" type="text" defaultValue={target || defaultDomain} placeholder="example.com" className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-medium text-slate-900 dark:text-white transition-all" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Limit</label>
                <select name="limit" defaultValue={String(limit)} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm font-medium text-slate-900 dark:text-white">
                  {[50, 100, 250, 500].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            {!creds && <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Configure API credentials in Settings first.</p>}
          </SearchForm>

          {error && <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 rounded-2xl px-5 py-3 text-sm">{error}</div>}

          {items.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {items.length} shown / {total.toLocaleString()} total
                  {cost > 0 && <span className="ml-3 text-slate-300 dark:text-slate-600">· ${cost.toFixed(4)}</span>}
                </p>
                <CopyMarkdownButton
                  data={csvData}
                  columns={[
                    { key: 'anchor', label: 'Anchor' },
                    { key: 'backlinks', label: 'Backlinks' },
                    { key: 'referring_domains', label: 'Ref. Domains' },
                    { key: 'dofollow', label: 'Dofollow' },
                    { key: 'nofollow', label: 'Nofollow' },
                    { key: 'broken', label: 'Broken' },
                    { key: 'first_seen', label: 'First Seen' },
                  ]}
                />
                <ExportCSVButton
                  data={csvData}
                  filename={`anchors-${target}.csv`}
                  columns={[
                    { key: 'anchor', label: 'Anchor' },
                    { key: 'backlinks', label: 'Backlinks' },
                    { key: 'referring_domains', label: 'Ref. Domains' },
                    { key: 'dofollow', label: 'Dofollow' },
                    { key: 'nofollow', label: 'Nofollow' },
                    { key: 'broken', label: 'Broken' },
                    { key: 'first_seen', label: 'First Seen' },
                  ]}
                />
              </div>
              <div id="results" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden">
                <AnchorsTable items={items} />
              </div>
            </div>
          )}
        </div>

        {/* History */}
        <div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sticky top-6">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">History</h2>
            {history.length === 0 ? (
              <p className="text-xs text-slate-400">No searches yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <a key={h.id} href={`?history_id=${h.id}`} className="block rounded-xl px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                    <div className="font-bold text-xs text-slate-800 dark:text-slate-200">{h.target}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(h.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
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
