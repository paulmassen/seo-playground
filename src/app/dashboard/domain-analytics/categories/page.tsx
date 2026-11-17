import { withProjectScope } from '@/lib/db';
import { getCredentials, getSetting, getDomainCategoriesHistory, saveDomainCategoriesSearch, getDomainCategoriesResults, getCategoryPath, type DomainCategoriesEntry } from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import { andFilters, cleanDomain, labsCostEstimate, positiveInt, type LabsCondition } from '@/lib/labs';
import CategoriesList, { type ResolvedCategoryItem } from './CategoriesList';
import DeleteHistoryButton from '@/components/DeleteHistoryButton';

export const dynamic = 'force-dynamic';

interface Metrics {
  count?: number; etv?: number; estimated_paid_traffic_cost?: number;
  pos_1?: number; pos_2_3?: number; pos_4_10?: number; pos_11_20?: number; pos_21_30?: number;
  pos_31_40?: number; pos_41_50?: number; pos_51_60?: number; pos_61_70?: number; pos_71_80?: number; pos_81_90?: number; pos_91_100?: number;
  is_new?: number; is_up?: number; is_down?: number; is_lost?: number;
}

interface CategoryItem {
  /** Breadcrumb of category codes, root first (e.g. [Food, Beverages, Coffee]). */
  categories?: number[];
  metrics?: { organic?: Metrics; paid?: Metrics };
}

interface SearchParams {
  target?: string; location?: string; language?: string;
  subcategories?: string; serp_mode?: string; min_keywords?: string; order?: string; limit?: string;
  submitted?: string; prefill?: string; history_id?: string;
}

const ORDERS: Record<string, { label: string; rule: string }> = {
  etv: { label: 'Traffic (ETV)', rule: 'metrics.organic.etv,desc' },
  count: { label: 'Ranked keywords', rule: 'metrics.organic.count,desc' },
  top1: { label: '#1 positions', rule: 'metrics.organic.pos_1,desc' },
  value: { label: 'Traffic value', rule: 'metrics.organic.estimated_paid_traffic_cost,desc' },
};
const LIMITS = [50, 100, 250, 500];
const SERP_MODES: Record<string, string> = {
  live: 'Current rankings',
  lost: 'Lost rankings only',
  all: 'Current + lost',
};

interface Query {
  target: string; location: string; language: string;
  subcategories: boolean; serpMode: 'live' | 'lost' | 'all'; minKeywords: number | null; order: string; limit: number;
}

function toQuery(p: SearchParams, defaults: { location: string; language: string }): Query {
  const submitted = p.submitted === '1';
  const limit = Number(p.limit);
  return {
    target: cleanDomain(p.target ?? ''),
    location: p.location ?? defaults.location,
    language: p.language ?? defaults.language,
    // Default on: the leaf categories are the useful ones; off returns only top-level themes.
    subcategories: submitted ? p.subcategories === '1' : true,
    serpMode: p.serp_mode === 'lost' || p.serp_mode === 'all' ? p.serp_mode : 'live',
    minKeywords: positiveInt(p.min_keywords),
    order: p.order && ORDERS[p.order] ? p.order : 'etv',
    limit: LIMITS.includes(limit) ? limit : 100,
  };
}

function toSaved(q: Query): SearchParams {
  return {
    submitted: '1', subcategories: q.subcategories ? '1' : undefined, serp_mode: q.serpMode,
    min_keywords: q.minKeywords ? String(q.minKeywords) : undefined, order: q.order, limit: String(q.limit),
  };
}

function buildBody(q: Query) {
  const conditions: LabsCondition[] = [];
  if (q.minKeywords) conditions.push(['metrics.organic.count', '>=', q.minKeywords]);
  const body: Record<string, unknown> = {
    target: q.target,
    location_name: q.location,
    language_name: q.language,
    include_subcategories: q.subcategories,
    historical_serp_mode: q.serpMode,
    item_types: ['organic', 'paid'],
    order_by: [ORDERS[q.order].rule],
    limit: q.limit,
  };
  const filters = andFilters(conditions);
  if (filters) body.filters = filters;
  return body;
}

async function fetchCategories(body: Record<string, unknown>, login: string, pass: string): Promise<{ items: CategoryItem[]; total?: number; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: CategoryItem[] }>(
    'dataforseo_labs/google/categories_for_domain/live', body, { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], total: result?.total_count, cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

function entryQuery(e: DomainCategoriesEntry, defaults: { location: string; language: string }): Query {
  // Entries saved before params existed were plain searches without subcategories.
  const saved: SearchParams = e.params ? (JSON.parse(e.params) as SearchParams) : { submitted: '1' };
  return toQuery({ ...saved, target: e.target, location: e.location, language: e.language }, defaults);
}

const inputCls = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800';
const labelCls = 'block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5';

async function DomainCategoriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaults = {
    location: toLabsCountry(getSetting('default_location') ?? 'France'),
    language: getSetting('default_language') ?? 'French',
  };
  const historyId = params.history_id;
  const prefill = params.prefill === '1';
  const activeEntry = historyId ? getDomainCategoriesHistory().find((e) => e.id === historyId) ?? null : null;
  const q = activeEntry ? entryQuery(activeEntry, defaults) : toQuery(params, defaults);

  let items: CategoryItem[] = [];
  let total: number | undefined;
  let cost: number | undefined;
  let error: string | null = null;
  let ran = false;

  if (historyId) {
    const saved = getDomainCategoriesResults<CategoryItem>(historyId);
    if (saved && activeEntry) { items = saved; cost = activeEntry.cost; ran = true; }
    else error = 'Search no longer available.';
  } else if (q.target && !prefill) {
    const body = buildBody(q);
    const dedupeId = stableSearchId(['domain-categories-v2', JSON.stringify(body)]);
    const cached = getDomainCategoriesResults<CategoryItem>(dedupeId);
    ran = true;
    if (cached) {
      items = cached;
      cost = getDomainCategoriesHistory().find((e) => e.id === dedupeId)?.cost;
    } else if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; ran = false; }
    else {
      const result = await fetchCategories(body, creds.login, creds.pass);
      items = result.items; total = result.total; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        saveDomainCategoriesSearch({
          id: dedupeId, ts: Date.now(), target: q.target, location: q.location, language: q.language,
          count: items.length, cost, params: JSON.stringify(toSaved(q)),
        }, items);
      }
    }
  }

  const history = getDomainCategoriesHistory();

  const resolved: ResolvedCategoryItem[] = items.map((item) => {
    const codes = item.categories ?? [];
    const leaf = codes[codes.length - 1];
    const o = item.metrics?.organic ?? {};
    const p = item.metrics?.paid ?? {};
    return {
      code: leaf ?? 0,
      // getCategoryPath resolves the full breadcrumb from the leaf code.
      path: leaf != null ? getCategoryPath(leaf) : 'Uncategorised',
      depth: codes.length,
      count: o.count ?? 0,
      etv: o.etv ?? 0,
      value: o.estimated_paid_traffic_cost ?? 0,
      pos1: o.pos_1 ?? 0,
      top3: (o.pos_1 ?? 0) + (o.pos_2_3 ?? 0),
      top10: (o.pos_1 ?? 0) + (o.pos_2_3 ?? 0) + (o.pos_4_10 ?? 0),
      isNew: o.is_new ?? 0,
      isUp: o.is_up ?? 0,
      isDown: o.is_down ?? 0,
      isLost: o.is_lost ?? 0,
      paidCount: p.count ?? 0,
      paidEtv: p.etv ?? 0,
    };
  });

  const geo = { location: q.location, language: q.language, prefill: '1' };
  const link = (path: string, p: Record<string, string>) => `${path}?${new URLSearchParams(p).toString()}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Domain Categories</h1>
        <p className="text-sm text-slate-400 mt-1">
          The product and service themes a domain ranks for in Google, with the keywords and traffic each theme brings. Useful to see what a site is really known for, or where a competitor gets its traffic.
        </p>
      </div>

      <SearchForm
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4"
        btnLabel={<>Analyze<span className="font-mono text-[10px] opacity-50 ml-1.5">≤ ${labsCostEstimate(q.limit).toFixed(3)}</span></>}
        btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors"
      >
        <input type="hidden" name="submitted" value="1" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Domain or subdomain</label>
            <input type="text" name="target" defaultValue={q.target} placeholder="example.com" required className={`${inputCls} font-mono`} />
          </div>
          <LabsLocationLanguageFields defaultLocation={q.location} defaultLanguage={q.language} className={inputCls} labelClassName={labelCls} />
        </div>
        <label className="inline-flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" name="subcategories" value="1" defaultChecked={q.subcategories} className="mt-1" />
          <span>
            Include subcategories
            <span className="block text-[11px] text-slate-400">On: precise themes (e.g. Food › Beverages › Coffee). Off: only broad top-level themes.</span>
          </span>
        </label>
        <details open={q.serpMode !== 'live' || !!q.minKeywords || q.order !== 'etv' || q.limit !== 100}>
          <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 select-none">Filters &amp; sorting</summary>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div>
              <label className={labelCls}>Rankings</label>
              <select name="serp_mode" defaultValue={q.serpMode} className={inputCls}>
                {Object.entries(SERP_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Min. keywords</label>
              <input type="number" name="min_keywords" min={0} defaultValue={q.minKeywords ?? ''} placeholder="e.g. 5" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Sort by</label>
              <select name="order" defaultValue={q.order} className={inputCls}>
                {Object.entries(ORDERS).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Max categories</label>
              <select name="limit" defaultValue={String(q.limit)} className={inputCls}>
                {LIMITS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">“Lost rankings only” shows the themes where the domain used to rank and no longer does: a quick way to spot content that dropped out.</p>
        </details>
      </SearchForm>

      {prefill && q.target && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-sm rounded-xl px-4 py-3">
          Form prefilled for <span className="font-mono font-bold">{q.target}</span>. Nothing has been charged: review the options, then run the analysis.
        </div>
      )}

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {ran && !error && (
        <div id="results" className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                  {items.length}{total && total > items.length ? ` of ${total}` : ''} categories — <span className="text-slate-900 dark:text-white">{q.target}</span>
                </span>
                {historyId && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
                <span className="text-[11px] text-slate-400">{q.location} · {q.language} · {SERP_MODES[q.serpMode].toLowerCase()}{q.subcategories ? ' · with subcategories' : ' · top level'}</span>
              </div>
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
            </div>
            {items.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-slate-400">No categories found. The domain may rank for too few keywords in this location, or the filters are too strict.</div>
            ) : (
              <CategoriesList items={resolved} target={q.target} />
            )}
          </div>

          {items.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-sm text-slate-600 dark:text-slate-400 space-y-1.5">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">How to read this</h2>
              <p>Every keyword in DataForSEO is tagged with Google&apos;s product &amp; service categories. Each row groups the keywords this domain ranks for under one category, so a keyword can count in a parent and in its subcategory.</p>
              <p><strong className="text-slate-800 dark:text-slate-200">Share</strong> is the category&apos;s part of the traffic listed here. <strong className="text-slate-800 dark:text-slate-200">Unknown</strong> collects keywords Google doesn&apos;t classify, often brand and navigational searches.</p>
              <p>A category with many keywords but few top-10 positions is a theme the site covers without winning: a candidate for content work. Paid columns show where the domain also buys Google Ads.</p>
              <p className="pt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold">
                <span className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Next for {q.target}</span>
                <a className="text-blue-600 hover:underline" href={link('/dashboard/ranked-keywords', { target: q.target, ...geo })}>Ranked keywords</a>
                <a className="text-blue-600 hover:underline" href={link('/dashboard/competitors', { target: q.target, ...geo })}>Competitors</a>
                <a className="text-blue-600 hover:underline" href={link('/dashboard/historical-rank', { target: q.target, ...geo })}>Traffic history</a>
              </p>
            </div>
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
              const eq = entryQuery(entry, defaults);
              return (
                <div key={entry.id} className={`flex items-center gap-2 pr-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <a href={`/dashboard/domain-analytics/categories?history_id=${entry.id}#results`} className="flex flex-1 min-w-0 items-center gap-4 pl-6 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.target}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {entry.location} · {entry.count} categories · {eq.subcategories ? 'with subcategories' : 'top level'}
                        {eq.serpMode !== 'live' ? ` · ${SERP_MODES[eq.serpMode].toLowerCase()}` : ''}
                        {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                  </a>
                  <DeleteHistoryButton table="domain_categories_searches" id={entry.id} path="/dashboard/domain-analytics/categories" label={entry.target} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(DomainCategoriesPage);
