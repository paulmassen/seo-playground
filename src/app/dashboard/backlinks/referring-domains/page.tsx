export const dynamic = 'force-dynamic';

import { getCredentials, getRefDomainsHistory, saveRefDomainsSearch, getRefDomainsResults, getSetting } from '@/lib/db';
import ExportCSVButton from '@/components/ExportCSVButton';
import SearchForm from '@/components/SearchForm';

interface RefDomain {
  domain: string;
  domain_from_rank: number;
  backlinks: number;
  broken_backlinks: number;
  referring_links_tld: Record<string, number>;
  first_seen: string;
  last_seen: string;
  is_broken: boolean;
  is_redirect: boolean;
}

interface SearchParams {
  target?: string;
  limit?: string;
  history_id?: string;
}

function DRBadge({ rank }: { rank: number }) {
  const cls = rank >= 70
    ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
    : rank >= 40
    ? 'bg-blue-50 text-blue-600 border-blue-200'
    : 'bg-slate-100 text-slate-500 border-slate-200';
  return <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border tabular-nums ${cls}`}>DR {rank}</span>;
}

async function fetchRefDomains(target: string, limit: number, login: string, pass: string): Promise<{ items: RefDomain[]; total: number; cost: number; error?: string }> {
  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/backlinks/referring_domains/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      target,
      limit,
      order_by: ['domain_from_rank,desc'],
      filters: ['dofollow', '=', true],
      include_subdomains: true,
    }]),
  });
  if (!res.ok) return { items: [], total: 0, cost: 0, error: `Error HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ total_count?: number; items?: RefDomain[] }> }> };
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

export default async function RefDomainsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const history = getRefDomainsHistory();
  const defaultDomain = getSetting('default_domain') ?? '';

  const params = await searchParams;
  const historyId = params.history_id;
  const target = params.target?.trim() ?? '';
  const limit = Math.min(Number(params.limit ?? 100), 1000);

  let items: RefDomain[] = [];
  let total = 0;
  let error = '';
  let cost = 0;

  if (historyId) {
    items = getRefDomainsResults<RefDomain>(historyId) ?? [];
    const entry = history.find((h) => h.id === historyId);
    total = entry?.total ?? items.length;
  } else if (target && creds) {
    try {
      const result = await fetchRefDomains(target, limit, creds.login, creds.pass);
      if (result.error) {
        error = result.error;
      } else {
        items = result.items;
        total = result.total;
        cost = result.cost;
        const id = crypto.randomUUID();
        saveRefDomainsSearch({ id, ts: Date.now(), target, cost, total }, items);
      }
    } catch (e) {
      error = String(e);
    }
  }

  const csvData = items.map((i) => ({
    domain: i.domain,
    dr: i.domain_from_rank,
    backlinks: i.backlinks,
    broken: i.broken_backlinks,
    first_seen: i.first_seen?.split('T')[0] ?? '',
    last_seen: i.last_seen?.split('T')[0] ?? '',
    is_broken: i.is_broken ? 'yes' : 'no',
    is_redirect: i.is_redirect ? 'yes' : 'no',
  }));

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Referring Domains</h1>
        <p className="text-slate-500 text-sm mt-1 font-medium">Domains linking to a target</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Form + Results */}
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
                  {[50, 100, 250, 500, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
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
                  filename={`referring-domains-${target}.csv`}
                  columns={[
                    { key: 'domain', label: 'Domain' },
                    { key: 'dr', label: 'DR' },
                    { key: 'backlinks', label: 'Backlinks' },
                    { key: 'broken', label: 'Broken' },
                    { key: 'first_seen', label: 'First Seen' },
                    { key: 'last_seen', label: 'Last Seen' },
                  ]}
                />
              </div>
              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Domain</th>
                      <th className="text-center px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">DR</th>
                      <th className="text-right px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Links</th>
                      <th className="text-right px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Broken</th>
                      <th className="text-left px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">First Seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {items.map((item, i) => (
                      <tr key={i} className={`hover:bg-slate-50/50 ${item.is_broken ? 'opacity-50' : ''}`}>
                        <td className="px-5 py-3">
                          <div className="font-bold text-slate-800 flex items-center gap-2">
                            <a href={`https://${item.domain}`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">{item.domain}</a>
                            {item.is_redirect && <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 border border-slate-200 rounded px-1">redirect</span>}
                            {item.is_broken && <span className="text-[9px] font-black uppercase tracking-wider text-red-400 border border-red-200 rounded px-1">broken</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center"><DRBadge rank={item.domain_from_rank} /></td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-slate-700">{item.backlinks.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right font-mono text-slate-400">{item.broken_backlinks > 0 ? item.broken_backlinks : '—'}</td>
                        <td className="px-3 py-3 text-slate-400">{item.first_seen?.split('T')[0] ?? '—'}</td>
                      </tr>
                    ))}
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
                      {h.total?.toLocaleString() ?? '?'} domains · {new Date(h.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
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
