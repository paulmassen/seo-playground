export const dynamic = 'force-dynamic';

import {
  getCredentials, getDomainIntersectionHistory,
  saveDomainIntersectionSearch, getDomainIntersectionResults, getSetting,
} from '@/lib/db';
import ExportCSVButton from '@/components/ExportCSVButton';
import { LOCATIONS, LANGUAGES } from '@/lib/geo-options';
import SearchForm from '@/components/SearchForm';

interface IntersectionItem {
  keyword_data: {
    keyword: string;
    location_code: number;
    language_code: string;
    keyword_info?: {
      search_volume?: number;
      competition?: number;
      cpc?: number;
    };
    keyword_properties?: {
      keyword_difficulty?: number;
    };
  };
  first_domain_serp_element?: {
    rank_group?: number;
    rank_absolute?: number;
    url?: string;
  };
  second_domain_serp_element?: {
    rank_group?: number;
    rank_absolute?: number;
    url?: string;
  };
}

interface SearchParams {
  target1?: string;
  target2?: string;
  location?: string;
  language?: string;
  limit?: string;
  history_id?: string;
}

async function fetchIntersection(target1: string, target2: string, location: string, language: string, limit: number, login: string, pass: string): Promise<{ items: IntersectionItem[]; total: number; cost: number }> {
  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/domain_intersection/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      target1,
      target2,
      location_name: location,
      language_name: language,
      limit,
      order_by: ['keyword_data.keyword_info.search_volume,desc'],
    }]),
  });
  if (!res.ok) return { items: [], total: 0, cost: 0 };
  const data = await res.json() as { tasks?: Array<{ cost?: number; result?: Array<{ total_count?: number; items?: IntersectionItem[] }> }> };
  const result = data.tasks?.[0]?.result?.[0];
  return {
    items: result?.items ?? [],
    total: result?.total_count ?? 0,
    cost: data.tasks?.[0]?.cost ?? 0,
  };
}

function PosBadge({ pos }: { pos: number | undefined }) {
  if (!pos) return <span className="text-slate-300">—</span>;
  const cls = pos <= 3 ? 'text-emerald-600 font-black' : pos <= 10 ? 'text-blue-600 font-bold' : 'text-slate-500';
  return <span className={`font-mono tabular-nums text-xs ${cls}`}>#{pos}</span>;
}

function KdBadge({ kd }: { kd: number | undefined }) {
  if (kd === undefined) return <span className="text-slate-300">—</span>;
  const cls = kd >= 70 ? 'bg-red-50 text-red-500 border-red-200' : kd >= 40 ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200';
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-black border ${cls}`}>{kd}</span>;
}

export default async function DomainIntersectionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const history = getDomainIntersectionHistory();
  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'French';
  const defaultDomain = getSetting('default_domain') ?? '';

  const params = await searchParams;
  const historyId = params.history_id;
  const target1 = params.target1?.trim() ?? '';
  const target2 = params.target2?.trim() ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const limit = Math.min(Number(params.limit ?? 100), 1000);

  let items: IntersectionItem[] = [];
  let total = 0;
  let error = '';
  let cost = 0;

  if (historyId) {
    items = getDomainIntersectionResults<IntersectionItem>(historyId) ?? [];
    const entry = history.find((h) => h.id === historyId);
    total = entry?.totalCount ?? items.length;
  } else if (target1 && target2 && creds) {
    try {
      const result = await fetchIntersection(target1, target2, location, language, limit, creds.login, creds.pass);
      items = result.items;
      total = result.total;
      cost = result.cost;
      const id = crypto.randomUUID();
      saveDomainIntersectionSearch({
        id, ts: Date.now(), target1, target2, location, language,
        count: items.length, totalCount: total, cost,
      }, items);
    } catch (e) {
      error = String(e);
    }
  }

  const csvData = items.map((i) => ({
    keyword: i.keyword_data.keyword,
    volume: i.keyword_data.keyword_info?.search_volume ?? '',
    kd: i.keyword_data.keyword_properties?.keyword_difficulty ?? '',
    pos_target1: i.first_domain_serp_element?.rank_absolute ?? '',
    pos_target2: i.second_domain_serp_element?.rank_absolute ?? '',
  }));

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Domain Intersection</h1>
        <p className="text-slate-500 text-sm mt-1 font-medium">Keywords two domains rank for simultaneously</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          <SearchForm className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4" btnLabel="Analyze" btnClassName="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all disabled:opacity-40" disabled={!creds}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Domain 1</label>
                <input name="target1" type="text" defaultValue={target1 || defaultDomain} placeholder="example.com" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-medium text-slate-900 transition-all" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Domain 2</label>
                <input name="target2" type="text" defaultValue={target2} placeholder="competitor.com" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-medium text-slate-900 transition-all" />
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
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Limit</label>
              <select name="limit" defaultValue={String(limit)} className="w-48 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-medium text-slate-900">
                {[50, 100, 250, 500, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {!creds && <p className="text-xs text-amber-600 font-medium">Configure API credentials in Settings first.</p>}
          </SearchForm>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-3 text-sm">{error}</div>}

          {items.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {items.length} shown / {total.toLocaleString()} common keywords
                  {cost > 0 && <span className="ml-3 text-slate-300">· ${cost.toFixed(4)}</span>}
                </p>
                <ExportCSVButton
                  data={csvData}
                  filename={`intersection-${target1}-${target2}.csv`}
                  columns={[
                    { key: 'keyword', label: 'Keyword' },
                    { key: 'volume', label: 'Volume' },
                    { key: 'kd', label: 'KD' },
                    { key: 'pos_target1', label: `Pos ${target1}` },
                    { key: 'pos_target2', label: `Pos ${target2}` },
                  ]}
                />
              </div>

              {/* Domain header */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 text-center">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Domain 1</p>
                  <p className="font-black text-blue-700 mt-0.5">{target1}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Domain 2</p>
                  <p className="font-black text-slate-700 mt-0.5">{target2}</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-5 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Keyword</th>
                      <th className="text-right px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vol.</th>
                      <th className="text-center px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">KD</th>
                      <th className="text-center px-3 py-3.5 text-[10px] font-black text-blue-400 uppercase tracking-widest">D1</th>
                      <th className="text-center px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">D2</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {items.map((item, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-5 py-3 font-bold text-slate-800">{item.keyword_data.keyword}</td>
                        <td className="px-3 py-3 text-right font-mono text-slate-500">
                          {(item.keyword_data.keyword_info?.search_volume ?? 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <KdBadge kd={item.keyword_data.keyword_properties?.keyword_difficulty} />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <PosBadge pos={item.first_domain_serp_element?.rank_absolute} />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <PosBadge pos={item.second_domain_serp_element?.rank_absolute} />
                        </td>
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
                    <div className="font-bold text-xs text-slate-800">{h.target1} <span className="text-slate-300">vs</span> {h.target2}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {h.totalCount.toLocaleString()} common · {new Date(h.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
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
