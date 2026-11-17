import { withProjectScope } from '@/lib/db';
import { getCredentials, getSetting, getSubdomainsHistory, saveSubdomainsSearch, getSubdomainsResults, type SubdomainsEntry } from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import { andFilters, cleanDomain, labsCostEstimate, positiveInt, type LabsCondition } from '@/lib/labs';
import SubdomainsTable, { type SubdomainItem } from './SubdomainsTable';
import DeleteHistoryButton from '@/components/DeleteHistoryButton';

export const dynamic = 'force-dynamic';

interface SearchParams {
  target?: string; location?: string; language?: string; limit?: string;
  min_keywords?: string; order?: string; ignore_synonyms?: string; include_paid?: string;
  history_id?: string; prefill?: string;
}

interface Query {
  target: string; location: string; language: string; limit: number;
  minKeywords: number | null; order: string; ignoreSynonyms: boolean; includePaid: boolean;
}

const LIMITS = [50, 100, 200, 500, 1000];
const ORDERS: Record<string, { label: string; rule: string }> = {
  etv: { label: 'Traffic (ETV)', rule: 'metrics.organic.etv,desc' },
  count: { label: 'Ranked keywords', rule: 'metrics.organic.count,desc' },
  top10: { label: 'Keywords in top 3', rule: 'metrics.organic.pos_1,desc' },
  value: { label: 'Traffic value', rule: 'metrics.organic.estimated_paid_traffic_cost,desc' },
};

function toQuery(p: SearchParams, defaults: { location: string; language: string }): Query {
  const limit = Number(p.limit);
  return {
    target: cleanDomain(p.target ?? ''),
    location: p.location ?? defaults.location,
    language: p.language ?? defaults.language,
    limit: LIMITS.includes(limit) ? limit : 100,
    minKeywords: positiveInt(p.min_keywords),
    order: p.order && ORDERS[p.order] ? p.order : 'etv',
    ignoreSynonyms: p.ignore_synonyms === '1',
    includePaid: p.include_paid === '1',
  };
}

function toParams(q: Query): Record<string, string> {
  const out: Record<string, string> = { target: q.target, location: q.location, language: q.language, limit: String(q.limit), order: q.order };
  if (q.minKeywords) out.min_keywords = String(q.minKeywords);
  if (q.ignoreSynonyms) out.ignore_synonyms = '1';
  if (q.includePaid) out.include_paid = '1';
  return out;
}

function buildBody(q: Query) {
  const c: LabsCondition[] = [];
  if (q.minKeywords) c.push(['metrics.organic.count', '>=', q.minKeywords]);
  const body: Record<string, unknown> = {
    target: q.target,
    location_name: q.location,
    language_name: q.language,
    limit: q.limit,
    order_by: [ORDERS[q.order].rule],
    item_types: q.includePaid ? ['organic', 'paid'] : ['organic'],
  };
  if (q.ignoreSynonyms) body.ignore_synonyms = true;
  const filters = andFilters(c);
  if (filters) body.filters = filters;
  return body;
}

async function fetchSubdomains(body: Record<string, unknown>, login: string, pass: string): Promise<{ items: SubdomainItem[]; total?: number; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: SubdomainItem[] }>(
    'dataforseo_labs/google/subdomains/live', body, { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], total: result?.total_count, cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

const inputCls = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800';
const labelCls = 'block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5';

function entryQuery(e: SubdomainsEntry, defaults: { location: string; language: string }): Query {
  const saved = e.params ? (JSON.parse(e.params) as SearchParams) : {};
  return toQuery({ ...saved, target: e.target, location: e.location, language: e.language }, defaults);
}

async function SubdomainsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaults = {
    location: toLabsCountry(getSetting('default_location') ?? 'France'),
    language: getSetting('default_language') ?? 'French',
  };
  const historyId = params.history_id;
  const prefill = params.prefill === '1';
  const activeEntry = historyId ? getSubdomainsHistory().find((e) => e.id === historyId) ?? null : null;
  const q = activeEntry ? entryQuery(activeEntry, defaults) : toQuery(params, defaults);

  let items: SubdomainItem[] = [];
  let total: number | undefined;
  let cost: number | undefined;
  let error: string | null = null;
  let ran = false;

  if (historyId) {
    const saved = getSubdomainsResults<SubdomainItem>(historyId);
    if (saved && activeEntry) { items = saved; total = activeEntry.totalCount; cost = activeEntry.cost; ran = true; }
    else error = 'Search no longer available.';
  } else if (q.target && !prefill) {
    const body = buildBody(q);
    const dedupeId = stableSearchId(['subdomains-v2', JSON.stringify(body)]);
    const cached = getSubdomainsResults<SubdomainItem>(dedupeId);
    ran = true;

    if (cached) {
      items = cached;
      const cachedEntry = getSubdomainsHistory().find((e) => e.id === dedupeId);
      total = cachedEntry?.totalCount;
      cost = cachedEntry?.cost;
    } else if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
    else {
      const result = await fetchSubdomains(body, creds.login, creds.pass);
      items = result.items; total = result.total; cost = result.cost; error = result.error ?? null;
      if (!error) {
        saveSubdomainsSearch({
          id: dedupeId, ts: Date.now(), target: q.target, location: q.location, language: q.language,
          count: items.length, totalCount: total, cost, params: JSON.stringify(toParams(q)),
        }, items);
      }
    }
  }

  const history = getSubdomainsHistory();
  const totalEtv = items.reduce((s, i) => s + (i.metrics?.organic?.etv ?? 0), 0);
  const totalKw = items.reduce((s, i) => s + (i.metrics?.organic?.count ?? 0), 0);
  const leader = [...items].sort((a, b) => (b.metrics?.organic?.etv ?? 0) - (a.metrics?.organic?.etv ?? 0))[0];
  const leaderShare = leader && totalEtv > 0 ? Math.round(((leader.metrics?.organic?.etv ?? 0) / totalEtv) * 100) : null;

  const csvData = items.map((item) => {
    const o = item.metrics?.organic;
    return {
      subdomain: item.subdomain ?? '',
      keywords: o?.count ?? '',
      top3: (o?.pos_1 ?? 0) + (o?.pos_2_3 ?? 0),
      top10: (o?.pos_1 ?? 0) + (o?.pos_2_3 ?? 0) + (o?.pos_4_10 ?? 0),
      traffic: o?.etv != null ? Math.round(o.etv) : '',
      share: totalEtv > 0 && o?.etv != null ? `${((o.etv / totalEtv) * 100).toFixed(1)}%` : '',
      traffic_cost: o?.estimated_paid_traffic_cost != null ? Math.round(o.estimated_paid_traffic_cost) : '',
      new: o?.is_new ?? '', up: o?.is_up ?? '', down: o?.is_down ?? '', lost: o?.is_lost ?? '',
    };
  });
  const csvColumns = [
    { key: 'subdomain', label: 'Subdomain' }, { key: 'keywords', label: 'Keywords' }, { key: 'top3', label: 'Top 3' },
    { key: 'top10', label: 'Top 10' }, { key: 'traffic', label: 'Est. Traffic (ETV)' }, { key: 'share', label: 'Traffic share' },
    { key: 'traffic_cost', label: 'Traffic Value ($)' }, { key: 'new', label: 'New KWs' }, { key: 'up', label: 'Up' },
    { key: 'down', label: 'Down' }, { key: 'lost', label: 'Lost' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Subdomains</h1>
        <p className="text-sm text-slate-400 mt-1">
          How a root domain&apos;s organic traffic splits across its subdomains (blog, shop, help center, country sites…), with ranking movements for each.
        </p>
      </div>

      <SearchForm
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4"
        btnLabel={<>Analyze<span className="font-mono text-[10px] opacity-50 ml-1.5">≤ ${labsCostEstimate(q.limit).toFixed(3)}</span></>}
        btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Root domain</label>
            <input type="text" name="target" defaultValue={q.target} placeholder="example.com" required className={`${inputCls} font-mono`} />
          </div>
          <LabsLocationLanguageFields defaultLocation={q.location} defaultLanguage={q.language} className={inputCls} labelClassName={labelCls} />
          <div>
            <label className={labelCls}>Sort by</label>
            <select name="order" defaultValue={q.order} className={inputCls}>
              {Object.entries(ORDERS).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Min. keywords</label>
              <input type="number" name="min_keywords" min={0} defaultValue={q.minKeywords ?? ''} placeholder="e.g. 10" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Max results</label>
              <select name="limit" defaultValue={String(q.limit)} className={inputCls}>
                {LIMITS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer" title="Count one keyword per group of near-identical variants.">
            <input type="checkbox" name="ignore_synonyms" value="1" defaultChecked={q.ignoreSynonyms} /> Skip near-duplicate keywords
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" name="include_paid" value="1" defaultChecked={q.includePaid} /> Include Google Ads metrics
          </label>
        </div>
      </SearchForm>

      {prefill && q.target && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-sm rounded-xl px-4 py-3">
          Form prefilled for <span className="font-mono font-bold">{q.target}</span>. Nothing has been charged: run the analysis when ready.
        </div>
      )}

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {ran && !error && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Subdomains', value: (total ?? items.length).toLocaleString('en-GB'), sub: `${items.length} loaded` },
            { label: 'Traffic (loaded)', value: Math.round(totalEtv).toLocaleString('en-GB'), sub: 'visits / month (ETV)' },
            { label: 'Ranked keywords', value: totalKw.toLocaleString('en-GB'), sub: 'summed over subdomains' },
            { label: 'Main subdomain', value: leaderShare != null ? `${leaderShare}%` : '—', sub: leader?.subdomain ?? '' },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{s.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate font-mono">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {ran && !error && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400"><span className="text-slate-900 dark:text-white font-mono normal-case">{q.target}</span> — subdomains</span>
              {historyId && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
              <span className="text-[11px] text-slate-400">{q.location} · {q.language}</span>
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton data={csvData} columns={csvColumns} />
                  <ExportCSVButton data={csvData} filename={`subdomains-${q.target}.csv`} columns={csvColumns} />
                </div>
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No subdomains with organic rankings in this market. Try another location, or lower the minimum.</div>
          ) : (
            <SubdomainsTable items={items} totalEtv={totalEtv} location={q.location} language={q.language} />
          )}
        </div>
      )}

      {ran && !error && items.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-sm text-slate-600 dark:text-slate-400 space-y-1.5">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">How to read this</h2>
          <p><strong className="text-slate-800 dark:text-slate-200">Share</strong> is each subdomain&apos;s part of the traffic summed over the loaded subdomains. A site where one subdomain carries nearly everything has its SEO concentrated in one place.</p>
          <p><strong className="text-slate-800 dark:text-slate-200">Movements</strong> (new / up / down / lost) count keywords that changed since DataForSEO&apos;s previous check: a quick way to spot the section of a site that is growing or dropping.</p>
          <p>Each row links to Ranked Keywords for that subdomain only (prefilled, nothing charged until you run it).</p>
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
                <div key={entry.id} className={`flex items-center gap-2 pr-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <a href={`/dashboard/subdomains?history_id=${entry.id}#results`} className="flex flex-1 min-w-0 items-center gap-4 pl-6 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.target}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{entry.count} subdomains · {entry.location}{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                  </a>
                  <DeleteHistoryButton table="subdomains_searches" id={entry.id} path="/dashboard/subdomains" label={entry.target} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(SubdomainsPage);
