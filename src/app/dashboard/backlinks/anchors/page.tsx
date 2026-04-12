export const dynamic = 'force-dynamic';

import { getCredentials, getAnchorsHistory, saveAnchorsSearch, getAnchorsResults, getSetting } from '@/lib/db';
import ExportCSVButton from '@/components/ExportCSVButton';
import SearchForm from '@/components/SearchForm';

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
  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/backlinks/anchors/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ target, limit, order_by: ['backlinks,desc'], include_subdomains: true }]),
  });
  if (!res.ok) return { items: [], total: 0, cost: 0, error: `Error HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ total_count?: number; items?: AnchorItem[] }> }> };
  const task = data.tasks?.[0];
  if (!task) return { items: [], total: 0, cost: 0, error: 'Réponse API vide.' };
  if (task.status_code && task.status_code !== 20000) {
    return { items: [], total: 0, cost: 0, error: `DataForSEO: ${task.status_message} (${task.status_code})` };
  }
  const result = task.result?.[0];
  return {
    items: result?.items ?? [],
    total: result?.total_count ?? 0,
    cost: task.cost ?? 0,
  };
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
    try {
      const result = await fetchAnchors(target, limit, creds.login, creds.pass);
      if (result.error) {
        error = result.error;
      } else {
        items = result.items;
        total = result.total;
        cost = result.cost;
        const id = crypto.randomUUID();
        saveAnchorsSearch({ id, ts: Date.now(), target, cost, total }, items);
      }
    } catch (e) {
      error = String(e);
    }
  }

  const maxLinks = items[0]?.backlinks ?? 1;

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
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Anchors</h1>
        <p className="text-slate-500 text-sm mt-1 font-medium">Anchor text distribution of backlinks</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          <SearchForm className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4" btnLabel="Analyze" btnClassName="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all disabled:opacity-40" disabled={!creds}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Domain</label>
                <input name="target" type="text" defaultValue={target || defaultDomain} placeholder="example.com" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-medium text-slate-900 transition-all" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Limit</label>
                <select name="limit" defaultValue={String(limit)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-medium text-slate-900">
                  {[50, 100, 250, 500].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            {!creds && <p className="text-xs text-amber-600 font-medium">Configure API credentials in Settings first.</p>}
          </SearchForm>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-3 text-sm">{error}</div>}

          {items.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {items.length} shown / {total.toLocaleString()} total
                  {cost > 0 && <span className="ml-3 text-slate-300">· ${cost.toFixed(4)}</span>}
                </p>
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
              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Anchor Text</th>
                      <th className="text-right px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Links</th>
                      <th className="text-right px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Domains</th>
                      <th className="text-left px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Split</th>
                      <th className="text-left px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">First Seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {items.map((item, i) => {
                      const pct = Math.round((item.backlinks / maxLinks) * 100);
                      const dfPct = item.backlinks > 0 ? Math.round((item.dofollow / item.backlinks) * 100) : 0;
                      return (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="px-5 py-3">
                            <div className="font-bold text-slate-800 max-w-xs truncate">{item.anchor || <span className="text-slate-400 italic">empty</span>}</div>
                            <div className="mt-1 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-bold text-slate-700">{item.backlinks.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right font-mono text-slate-500">{item.referring_domains.toLocaleString()}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-black text-emerald-600">{dfPct}% do</span>
                              <span className="text-[9px] text-slate-300">/</span>
                              <span className="text-[9px] font-black text-slate-400">{100 - dfPct}% no</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-slate-400">{item.first_seen?.split('T')[0] ?? '—'}</td>
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
