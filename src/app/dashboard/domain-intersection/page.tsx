import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import {
  getCredentials, getDomainIntersectionHistory,
  saveDomainIntersectionSearch, getDomainIntersectionResults, getSetting,
  type DomainIntersectionSearchEntry,
} from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import { andFilters, cleanDomain, labsCostEstimate, positiveInt, type LabsCondition } from '@/lib/labs';
import IntersectionTable, { type IntersectionItem } from './IntersectionTable';
import DeleteHistoryButton from '@/components/DeleteHistoryButton';

interface SearchParams {
  target1?: string;
  target2?: string;
  location?: string;
  language?: string;
  limit?: string;
  mode?: string;
  min_volume?: string;
  max_kd?: string;
  max_pos?: string;
  keyword?: string;
  order?: string;
  offset?: string;
  prefill?: string;
  history_id?: string;
}

type Mode = 'shared' | 'gap';

interface Query {
  target1: string;
  target2: string;
  location: string;
  language: string;
  limit: number;
  mode: Mode;
  minVolume: number | null;
  maxKd: number | null;
  /** Shared: both domains within this position. Gap: Domain 1 within this position. */
  maxPos: number | null;
  keyword: string;
  order: string;
  offset: number;
}

const LIMITS = [50, 100, 250, 500, 1000];
const ORDERS: Record<string, { label: string; rule: string }> = {
  volume: { label: 'Search volume', rule: 'keyword_data.keyword_info.search_volume,desc' },
  kd_asc: { label: 'Easiest first (KD)', rule: 'keyword_data.keyword_properties.keyword_difficulty,asc' },
  cpc: { label: 'CPC (commercial value)', rule: 'keyword_data.keyword_info.cpc,desc' },
  etv1: { label: 'Domain 1 traffic', rule: 'first_domain_serp_element.etv,desc' },
};

function toQuery(p: SearchParams, defaults: { location: string; language: string }): Query {
  const limit = Number(p.limit);
  return {
    target1: cleanDomain(p.target1 ?? ''),
    target2: cleanDomain(p.target2 ?? ''),
    location: p.location ?? defaults.location,
    language: p.language ?? defaults.language,
    limit: LIMITS.includes(limit) ? limit : 100,
    mode: p.mode === 'gap' ? 'gap' : 'shared',
    minVolume: positiveInt(p.min_volume),
    maxKd: positiveInt(p.max_kd),
    maxPos: positiveInt(p.max_pos),
    keyword: (p.keyword ?? '').trim(),
    order: p.order && ORDERS[p.order] ? p.order : 'volume',
    offset: positiveInt(p.offset) ?? 0,
  };
}

function toParams(q: Query): Record<string, string> {
  const out: Record<string, string> = {
    target1: q.target1, target2: q.target2, location: q.location, language: q.language,
    limit: String(q.limit), mode: q.mode, order: q.order,
  };
  if (q.minVolume) out.min_volume = String(q.minVolume);
  if (q.maxKd) out.max_kd = String(q.maxKd);
  if (q.maxPos) out.max_pos = String(q.maxPos);
  if (q.keyword) out.keyword = q.keyword;
  if (q.offset) out.offset = String(q.offset);
  return out;
}

function buildBody(q: Query) {
  const conditions: LabsCondition[] = [];
  if (q.minVolume) conditions.push(['keyword_data.keyword_info.search_volume', '>=', q.minVolume]);
  if (q.maxKd) conditions.push(['keyword_data.keyword_properties.keyword_difficulty', '<=', q.maxKd]);
  if (q.keyword) conditions.push(['keyword_data.keyword', 'ilike', `%${q.keyword}%`]);
  if (q.maxPos) {
    conditions.push(['first_domain_serp_element.rank_group', '<=', q.maxPos]);
    if (q.mode === 'shared') conditions.push(['second_domain_serp_element.rank_group', '<=', q.maxPos]);
  }
  const body: Record<string, unknown> = {
    target1: q.target1,
    target2: q.target2,
    location_name: q.location,
    language_name: q.language,
    // false = keywords target1 ranks for and target2 doesn't (keyword gap).
    intersections: q.mode === 'shared',
    item_types: ['organic'],
    limit: q.limit,
    order_by: [ORDERS[q.order].rule],
  };
  const filters = andFilters(conditions);
  if (filters) body.filters = filters;
  if (q.offset) body.offset = q.offset;
  return body;
}

async function fetchIntersection(body: Record<string, unknown>, login: string, pass: string): Promise<{ items: IntersectionItem[]; total: number; cost: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: IntersectionItem[] }>(
    'dataforseo_labs/google/domain_intersection/live', body, { login, pass },
  );
  // This endpoint used to silently swallow any DataForSEO-level error (bad status_code, invalid
  // field, etc.) as an empty result with cost 0 — never shown to the user. Now surfaced via `error`.
  return { items: result?.items ?? [], total: result?.total_count ?? 0, cost: cost ?? 0, error };
}

const inputCls = 'w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-medium text-slate-900 dark:text-white transition-all';
const labelCls = 'text-[10px] font-black text-slate-400 uppercase tracking-widest';

function entryQuery(h: DomainIntersectionSearchEntry, defaults: { location: string; language: string }): Query {
  const saved = h.params ? (JSON.parse(h.params) as SearchParams) : {};
  return toQuery({ ...saved, target1: h.target1, target2: h.target2, location: h.location, language: h.language }, defaults);
}

function filterSummary(q: Query): string {
  const parts: string[] = [];
  if (q.minVolume) parts.push(`vol ≥ ${q.minVolume}`);
  if (q.maxKd) parts.push(`KD ≤ ${q.maxKd}`);
  if (q.maxPos) parts.push(`top ${q.maxPos}`);
  if (q.keyword) parts.push(`“${q.keyword}”`);
  return parts.join(' · ');
}

async function DomainIntersectionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  let history = getDomainIntersectionHistory();
  const defaults = {
    location: toLabsCountry(getSetting('default_location') ?? 'France'),
    language: getSetting('default_language') ?? 'French',
  };
  const defaultDomain = getSetting('default_domain') ?? '';

  const params = await searchParams;
  const historyId = params.history_id;
  const prefill = params.prefill === '1';
  const activeEntry = historyId ? history.find((h) => h.id === historyId) ?? null : null;
  const q = activeEntry ? entryQuery(activeEntry, defaults) : toQuery(params, defaults);

  let items: IntersectionItem[] = [];
  let total = 0;
  let error = '';
  let cost = 0;
  let ran = false;

  if (historyId) {
    items = getDomainIntersectionResults<IntersectionItem>(historyId) ?? [];
    total = activeEntry?.totalCount ?? items.length;
    cost = activeEntry?.cost ?? 0;
    ran = true;
    if (!activeEntry) error = 'This search is no longer available.';
  } else if (q.target1 && q.target2 && !prefill) {
    if (q.target1 === q.target2) {
      error = 'Pick two different domains.';
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      try {
        const body = buildBody(q);
        const dedupeId = stableSearchId(['domain-intersection-v2', JSON.stringify(body)]);
        const cachedItems = getDomainIntersectionResults<IntersectionItem>(dedupeId);
        ran = true;
        if (cachedItems) {
          items = cachedItems;
          const cachedEntry = history.find((h) => h.id === dedupeId);
          total = cachedEntry?.totalCount ?? items.length;
          cost = cachedEntry?.cost ?? 0;
        } else {
          const result = await fetchIntersection(body, creds.login, creds.pass);
          if (result.error) {
            error = result.error;
          } else {
            items = result.items;
            total = result.total;
            cost = result.cost;
            saveDomainIntersectionSearch({
              id: dedupeId, ts: Date.now(), target1: q.target1, target2: q.target2, location: q.location, language: q.language,
              count: items.length, totalCount: total, cost, params: JSON.stringify(toParams(q)),
            }, items);
          }
        }
      } catch (e) {
        error = String(e);
      }
    }
  }

  // Re-read so a search saved during this request shows up in the sidebar.
  history = getDomainIntersectionHistory();

  const pageHref = (offset: number) => `?${new URLSearchParams(toParams({ ...q, offset })).toString()}#results`;
  const swapHref = `?${new URLSearchParams({ ...toParams({ ...q, target1: q.target2, target2: q.target1, offset: 0 }), prefill: '1' }).toString()}`;
  const gap = q.mode === 'gap';

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Domain Intersection</h1>
        <p className="text-slate-500 text-sm mt-1 font-medium">
          Compare two domains keyword by keyword: what you both rank for, or what one ranks for and the other is missing (keyword gap).
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          <SearchForm
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4"
            btnLabel={<>Analyze<span className="font-mono text-[10px] opacity-60 ml-1.5">≤ ${labsCostEstimate(q.limit).toFixed(3)}</span></>}
            btnClassName="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-none transition-all disabled:opacity-40"
            disabled={!creds}
          >
            {/* Mode */}
            <div className="space-y-1.5">
              <span className={labelCls}>Comparison</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {([
                  { value: 'shared', title: 'Shared keywords', desc: 'Keywords both domains rank for. Shows who wins each SERP.' },
                  { value: 'gap', title: 'Keyword gap', desc: 'Keywords Domain 1 ranks for and Domain 2 doesn’t. Put the competitor in Domain 1 to find content you’re missing.' },
                ] as const).map((m) => (
                  <label key={m.value} className="flex gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-950 transition-colors">
                    <input type="radio" name="mode" value={m.value} defaultChecked={q.mode === m.value} className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-bold text-slate-900 dark:text-white">{m.title}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{m.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={labelCls}>Domain 1</label>
                <input name="target1" type="text" defaultValue={q.target1 || defaultDomain} placeholder="example.com" className={inputCls} required />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Domain 2</label>
                <input name="target2" type="text" defaultValue={q.target2} placeholder="competitor.com" className={inputCls} required />
              </div>
              <LabsLocationLanguageFields
                defaultLocation={q.location}
                defaultLanguage={q.language}
                className={inputCls}
                wrapperClassName="space-y-1.5"
                labelClassName={labelCls}
              />
            </div>

            <details open={!!(q.minVolume || q.maxKd || q.maxPos || q.keyword || q.order !== 'volume')}>
              <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 select-none">
                Filters &amp; sorting <span className="normal-case font-medium tracking-normal">(applied by DataForSEO: you only pay for matching rows)</span>
              </summary>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                <div className="space-y-1.5">
                  <label className={labelCls}>Min. volume</label>
                  <input name="min_volume" type="number" min={0} defaultValue={q.minVolume ?? ''} placeholder="e.g. 100" className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Max. KD</label>
                  <input name="max_kd" type="number" min={0} max={100} defaultValue={q.maxKd ?? ''} placeholder="e.g. 40" className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls} title="Shared: both domains rank within this position. Gap: Domain 1 ranks within this position.">
                    <span className="underline decoration-dotted underline-offset-[3px] cursor-help">Max. position</span>
                  </label>
                  <select name="max_pos" defaultValue={String(q.maxPos ?? '')} className={inputCls}>
                    <option value="">Any (top 100)</option>
                    <option value="3">Top 3</option>
                    <option value="10">Top 10</option>
                    <option value="20">Top 20</option>
                    <option value="50">Top 50</option>
                  </select>
                </div>
                <div className="space-y-1.5 col-span-2 md:col-span-1">
                  <label className={labelCls}>Keyword contains</label>
                  <input name="keyword" type="text" defaultValue={q.keyword} placeholder="e.g. price" className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Sort by</label>
                  <select name="order" defaultValue={q.order} className={inputCls}>
                    {Object.entries(ORDERS).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelCls}>Rows</label>
                  <select name="limit" defaultValue={String(q.limit)} className={inputCls}>
                    {LIMITS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </details>
            {!creds && <p className="text-xs text-amber-600 font-medium">Configure API credentials in Settings first.</p>}
          </SearchForm>

          {prefill && q.target1 && q.target2 && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-sm rounded-2xl px-5 py-3">
              Form prefilled: <span className="font-mono font-bold">{q.target1}</span> {gap ? 'minus' : 'vs'} <span className="font-mono font-bold">{q.target2}</span>. Adjust the filters, then run the analysis.
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-3 text-sm">{error}</div>}

          {ran && !error && (
            <div id="results" className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {items.length > 0 ? `${q.offset + 1}–${q.offset + items.length}` : 0} of {total.toLocaleString('en-GB')} {gap ? 'gap keywords' : 'common keywords'}
                  {filterSummary(q) && <span className="ml-2 normal-case tracking-normal font-medium">· {filterSummary(q)}</span>}
                  {cost > 0 && <span className="ml-3 text-slate-300">· ${cost.toFixed(4)}</span>}
                </p>
                {historyId && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
              </div>

              {/* Domain header */}
              <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 rounded-2xl px-4 py-3 text-center">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Domain 1 · {gap ? 'ranks' : 'D1'}</p>
                  <p className="font-black text-blue-700 dark:text-blue-300 mt-0.5 font-mono">{q.target1}</p>
                </div>
                <a href={swapHref} title="Swap the two domains (prefills the form)" className="text-xs font-black text-slate-400 hover:text-blue-600 px-2">⇄</a>
                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Domain 2 · {gap ? 'absent' : 'D2'}</p>
                  <p className="font-black text-slate-700 dark:text-slate-200 mt-0.5 font-mono">{q.target2}</p>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl px-6 py-12 text-center text-sm text-slate-400">
                  No keywords match. {gap ? 'Domain 2 may already cover everything Domain 1 ranks for, or the filters are too strict.' : 'These domains share no keyword with these filters.'}
                </div>
              ) : (
                <IntersectionTable items={items} target1={q.target1} target2={q.target2} mode={q.mode} />
              )}

              {(q.offset > 0 || q.offset + items.length < total) && !historyId && (
                <div className="flex items-center justify-between">
                  {q.offset > 0
                    ? <a href={pageHref(Math.max(0, q.offset - q.limit))} className="text-xs font-bold text-blue-600 hover:underline">← Previous {q.limit}</a>
                    : <span />}
                  {q.offset + items.length < total && (
                    <a href={pageHref(q.offset + q.limit)} className="text-xs font-bold text-blue-600 hover:underline">
                      Next {q.limit} <span className="font-mono text-slate-400 font-normal">(≤ ${labsCostEstimate(q.limit).toFixed(3)})</span> →
                    </a>
                  )}
                </div>
              )}

              <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                {gap ? (
                  <>
                    <p><strong className="text-slate-700 dark:text-slate-200">Keyword gap:</strong> {q.target1} ranks in the top 100 for these keywords, {q.target2} doesn&apos;t rank at all. If {q.target2} is your site, these are topics to cover.</p>
                    <p>Start with low KD and high volume. The URL column shows which page of {q.target1} ranks: a model for the content to write.</p>
                  </>
                ) : (
                  <>
                    <p><strong className="text-slate-700 dark:text-slate-200">Shared keywords:</strong> both domains rank in the same SERP. The Gap column is D2 position minus D1 position: green = D1 ahead, red = D2 ahead.</p>
                    <p>Use the quick filters to isolate keywords where one domain is on page one and the other isn&apos;t: the quickest wins (or the biggest threats).</p>
                  </>
                )}
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
                {history.map((h) => {
                  const hq = entryQuery(h, defaults);
                  const isActive = h.id === historyId;
                  return (
                    <div key={h.id} className={`flex items-center gap-1 rounded-xl pr-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border ${isActive ? 'border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-900' : 'border-transparent hover:border-slate-200'}`}>
                      <a href={`?history_id=${h.id}#results`} className="block flex-1 min-w-0 pl-3 py-2.5">
                        <div className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate">
                          {h.target1} <span className="text-slate-300">{hq.mode === 'gap' ? 'minus' : 'vs'}</span> {h.target2}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                          {hq.mode === 'gap' ? 'gap' : 'shared'} · {h.totalCount.toLocaleString('en-GB')} kw
                          {filterSummary(hq) && ` · ${filterSummary(hq)}`}
                          {' · '}{new Date(h.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                      </a>
                      <DeleteHistoryButton table="domain_intersection_searches" id={h.id} path="/dashboard/domain-intersection" label={`${h.target1} vs ${h.target2}`} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default withProjectScope(DomainIntersectionPage);
