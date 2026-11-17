import { withProjectScope } from '@/lib/db';
import {
  getCredentials,
  getRankedKwHistory,
  saveRankedKwSearch,
  getRankedKwResults,
  getSetting,
  type RankedKwSearchEntry,
} from '@/lib/db';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { toLabsCountry } from '@/lib/geo-options';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import { andFilters, cleanDomain, labsCostEstimate, positiveInt, type LabsCondition } from '@/lib/labs';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import RankedKeywordsTable from './RankedKeywordsTable';
import { movementOf, rankDelta, type RankedKwItem } from './types';
import DeleteHistoryButton from '@/components/DeleteHistoryButton';

export const dynamic = 'force-dynamic';
export type { RankedKwItem };

interface SearchParams {
  target?: string;
  location?: string;
  language?: string;
  limit?: string;
  order_by?: string;
  max_position?: string;
  min_volume?: string;
  max_kd?: string;
  keyword?: string;
  exclude_keyword?: string;
  url_contains?: string;
  intent?: string;
  serp_mode?: string;
  ignore_synonyms?: string;
  include_paid?: string;
  offset?: string;
  history_id?: string;
  prefill?: string;
}

interface Query {
  target: string;
  location: string;
  language: string;
  limit: number;
  orderBy: string;
  maxPosition: number | null;
  minVolume: number | null;
  maxKd: number | null;
  keyword: string;
  excludeKeyword: string;
  urlContains: string;
  intent: string;
  serpMode: 'live' | 'lost' | 'all';
  ignoreSynonyms: boolean;
  includePaid: boolean;
  offset: number;
}

const LIMITS = [50, 100, 200, 500, 1000];
const ORDERS: Record<string, string> = {
  'ranked_serp_element.serp_item.etv,desc': 'Traffic (ETV)',
  'ranked_serp_element.serp_item.rank_group,asc': 'Position (best first)',
  'keyword_data.keyword_info.search_volume,desc': 'Search volume',
  'keyword_data.keyword_properties.keyword_difficulty,asc': 'Difficulty (lowest first)',
  'keyword_data.keyword_properties.keyword_difficulty,desc': 'Difficulty (highest first)',
  'keyword_data.keyword_info.cpc,desc': 'CPC',
};
const INTENTS = ['informational', 'navigational', 'commercial', 'transactional'];

function toQuery(p: SearchParams, defaults: { location: string; language: string }): Query {
  const limit = Number(p.limit);
  const isPage = /^https?:\/\//i.test(p.target?.trim() ?? '');
  return {
    // A full URL targets one page; anything else is treated as a domain.
    target: isPage ? (p.target ?? '').trim() : cleanDomain(p.target ?? ''),
    location: p.location ?? defaults.location,
    language: p.language ?? defaults.language,
    limit: LIMITS.includes(limit) ? limit : 100,
    orderBy: p.order_by && ORDERS[p.order_by] ? p.order_by : 'ranked_serp_element.serp_item.etv,desc',
    maxPosition: positiveInt(p.max_position),
    minVolume: positiveInt(p.min_volume),
    maxKd: positiveInt(p.max_kd),
    keyword: (p.keyword ?? '').trim(),
    excludeKeyword: (p.exclude_keyword ?? '').trim(),
    urlContains: (p.url_contains ?? '').trim(),
    intent: INTENTS.includes(p.intent ?? '') ? p.intent! : '',
    serpMode: p.serp_mode === 'lost' || p.serp_mode === 'all' ? p.serp_mode : 'live',
    ignoreSynonyms: p.ignore_synonyms === '1',
    includePaid: p.include_paid === '1',
    offset: positiveInt(p.offset) ?? 0,
  };
}

function toParams(q: Query): Record<string, string> {
  const out: Record<string, string> = { target: q.target, location: q.location, language: q.language, limit: String(q.limit), order_by: q.orderBy };
  if (q.maxPosition) out.max_position = String(q.maxPosition);
  if (q.minVolume) out.min_volume = String(q.minVolume);
  if (q.maxKd) out.max_kd = String(q.maxKd);
  if (q.keyword) out.keyword = q.keyword;
  if (q.excludeKeyword) out.exclude_keyword = q.excludeKeyword;
  if (q.urlContains) out.url_contains = q.urlContains;
  if (q.intent) out.intent = q.intent;
  if (q.serpMode !== 'live') out.serp_mode = q.serpMode;
  if (q.ignoreSynonyms) out.ignore_synonyms = '1';
  if (q.includePaid) out.include_paid = '1';
  if (q.offset) out.offset = String(q.offset);
  return out;
}

function buildBody(q: Query) {
  const c: LabsCondition[] = [];
  if (q.maxPosition) c.push(['ranked_serp_element.serp_item.rank_group', '<=', q.maxPosition]);
  if (q.minVolume) c.push(['keyword_data.keyword_info.search_volume', '>=', q.minVolume]);
  if (q.maxKd) c.push(['keyword_data.keyword_properties.keyword_difficulty', '<=', q.maxKd]);
  if (q.keyword) c.push(['keyword_data.keyword', 'ilike', `%${q.keyword}%`]);
  if (q.excludeKeyword) c.push(['keyword_data.keyword', 'not_ilike', `%${q.excludeKeyword}%`]);
  if (q.urlContains) c.push(['ranked_serp_element.serp_item.relative_url', 'ilike', `%${q.urlContains}%`]);
  if (q.intent) c.push(['keyword_data.search_intent_info.main_intent', '=', q.intent]);
  const body: Record<string, unknown> = {
    target: q.target,
    location_name: q.location,
    language_name: q.language,
    limit: q.limit,
    order_by: [q.orderBy],
    item_types: q.includePaid ? ['organic', 'paid'] : ['organic'],
    historical_serp_mode: q.serpMode,
  };
  if (q.ignoreSynonyms) body.ignore_synonyms = true;
  if (q.offset) body.offset = q.offset;
  const filters = andFilters(c);
  if (filters) body.filters = filters;
  return body;
}

async function fetchRankedKeywords(body: Record<string, unknown>, login: string, pass: string): Promise<{ items: RankedKwItem[]; totalCount: number; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: RankedKwItem[] }>(
    'dataforseo_labs/google/ranked_keywords/live', body, { login, pass },
  );
  if (error) return { items: [], totalCount: 0, error };
  return { items: result?.items ?? [], totalCount: result?.total_count ?? 0, cost };
}

// ---- UI helpers ----

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function filterSummary(q: Query): string {
  const parts: string[] = [];
  if (q.serpMode !== 'live') parts.push(q.serpMode === 'lost' ? 'lost keywords' : 'live + lost');
  if (q.maxPosition) parts.push(`top ${q.maxPosition}`);
  if (q.minVolume) parts.push(`vol ≥ ${q.minVolume}`);
  if (q.maxKd) parts.push(`KD ≤ ${q.maxKd}`);
  if (q.keyword) parts.push(`“${q.keyword}”`);
  if (q.excludeKeyword) parts.push(`not “${q.excludeKeyword}”`);
  if (q.urlContains) parts.push(`URL ~ ${q.urlContains}`);
  if (q.intent) parts.push(q.intent);
  if (q.ignoreSynonyms) parts.push('no synonyms');
  if (q.includePaid) parts.push('+ ads');
  return parts.join(' · ');
}

const inputCls = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all';
const labelCls = 'block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5';

function entryQuery(e: RankedKwSearchEntry, defaults: { location: string; language: string }): Query {
  const saved = e.params ? (JSON.parse(e.params) as SearchParams) : {};
  return toQuery({ ...saved, target: saved.target ?? e.target, location: e.location, language: e.language }, defaults);
}

// ---- Page ----

async function RankedKeywordsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;
  const prefill = params.prefill === '1';
  const defaults = {
    location: toLabsCountry(getSetting('default_location') ?? 'France'),
    language: getSetting('default_language') ?? 'French',
  };

  const activeEntry = historyId ? getRankedKwHistory().find((e) => e.id === historyId) ?? null : null;
  const q = activeEntry ? entryQuery(activeEntry, defaults) : toQuery(params, defaults);

  let items: RankedKwItem[] = [];
  let totalCount = 0;
  let cost: number | undefined;
  let error: string | null = null;
  let ran = false;

  if (historyId) {
    const saved = getRankedKwResults<RankedKwItem>(historyId);
    if (saved && activeEntry) {
      items = saved;
      totalCount = activeEntry.totalCount ?? items.length;
      cost = activeEntry.cost;
      ran = true;
    } else {
      error = 'This search is no longer available.';
    }
  } else if (q.target && !prefill) {
    // prefill=1 (links from other tools) only fills the form: no paid call until the user submits.
    const body = buildBody(q);
    const dedupeId = stableSearchId(['ranked-keywords-v2', JSON.stringify(body)]);
    const cached = getRankedKwResults<RankedKwItem>(dedupeId);
    ran = true;

    if (cached) {
      items = cached;
      const cachedEntry = getRankedKwHistory().find((e) => e.id === dedupeId);
      totalCount = cachedEntry?.totalCount ?? items.length;
      cost = cachedEntry?.cost;
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const result = await fetchRankedKeywords(body, creds.login, creds.pass);
      items = result.items;
      totalCount = result.totalCount;
      cost = result.cost;
      error = result.error ?? null;

      if (!error) {
        saveRankedKwSearch({
          id: dedupeId, ts: Date.now(), target: q.target, location: q.location, language: q.language,
          count: items.length, totalCount, cost, params: JSON.stringify(toParams(q)),
        }, items);
      }
    }
  }

  const history = getRankedKwHistory();

  // Summary of the loaded rows
  const pos = (i: RankedKwItem) => i.ranked_serp_element?.serp_item?.rank_group ?? 999;
  const top3 = items.filter((i) => pos(i) <= 3).length;
  const top10 = items.filter((i) => pos(i) <= 10).length;
  const striking = items.filter((i) => pos(i) >= 4 && pos(i) <= 20).length;
  const etv = items.reduce((s, i) => s + (i.ranked_serp_element?.serp_item?.etv ?? 0), 0);
  const value = items.reduce((s, i) => s + (i.ranked_serp_element?.serp_item?.estimated_paid_traffic_cost ?? 0), 0);
  const moves = { new: 0, up: 0, down: 0, lost: 0 };
  for (const i of items) { const m = movementOf(i); if (m !== 'same') moves[m] += 1; }

  const isPage = q.target.startsWith('http');
  const pageHref = (offset: number) => `?${new URLSearchParams(toParams({ ...q, offset })).toString()}#results`;
  const geo = { location: q.location, language: q.language };
  const links = q.target && !isPage ? [
    { label: 'Competitors', href: `/dashboard/competitors?${new URLSearchParams({ target: q.target, ...geo, prefill: '1' })}` },
    { label: 'Subdomains', href: `/dashboard/subdomains?${new URLSearchParams({ target: q.target, ...geo, prefill: '1' })}` },
    { label: 'Ranking history', href: `/dashboard/historical-rank?${new URLSearchParams({ target: q.target, ...geo, prefill: '1' })}` },
    { label: 'Backlinks', href: `/dashboard/backlinks?${new URLSearchParams({ target: q.target, prefill: '1' })}` },
  ] : [];

  const csvData = items.map((i) => {
    const it = i.ranked_serp_element?.serp_item;
    return {
      keyword: i.keyword_data?.keyword ?? '',
      position: it?.rank_group ?? '',
      previous: it?.rank_changes?.previous_rank_absolute ?? '',
      change: rankDelta(i) ?? '',
      movement: movementOf(i),
      volume: i.keyword_data?.keyword_info?.search_volume ?? '',
      etv: it?.etv != null ? Math.round(it.etv) : '',
      kd: i.keyword_data?.keyword_properties?.keyword_difficulty ?? '',
      cpc: i.keyword_data?.keyword_info?.cpc ?? '',
      intent: i.keyword_data?.search_intent_info?.main_intent ?? '',
      type: it?.type ?? '',
      serp_features: (i.ranked_serp_element?.serp_item_types ?? []).filter((t) => t !== 'organic').join(' | '),
      url: it?.url ?? '',
    };
  });
  const csvColumns = [
    { key: 'keyword', label: 'Keyword' }, { key: 'position', label: 'Position' }, { key: 'previous', label: 'Previous (abs.)' },
    { key: 'change', label: 'Change' }, { key: 'movement', label: 'Movement' }, { key: 'volume', label: 'Volume' },
    { key: 'etv', label: 'Traffic (ETV)' }, { key: 'kd', label: 'KD' }, { key: 'cpc', label: 'CPC' }, { key: 'intent', label: 'Intent' },
    { key: 'type', label: 'Result type' }, { key: 'serp_features', label: 'SERP features' }, { key: 'url', label: 'URL' },
  ];

  const advancedOpen = !!(q.minVolume || q.maxKd || q.keyword || q.excludeKeyword || q.urlContains || q.intent || q.serpMode !== 'live' || q.ignoreSynonyms || q.includePaid);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Ranked Keywords</h1>
        <p className="text-sm text-slate-400 mt-1">
          Every keyword a domain (or a single page) ranks for in Google&apos;s top 100, with the traffic each one brings and how positions moved since the previous check.
        </p>
      </div>

      {/* Form */}
      <SearchForm
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4"
        btnLabel={<>Analyze<span className="font-mono text-[10px] opacity-50 ml-1.5">≤ ${labsCostEstimate(q.limit).toFixed(3)}</span></>}
        btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Target domain or page URL</label>
            <input type="text" name="target" defaultValue={q.target} placeholder="example.com  or  https://example.com/page" required className={`${inputCls} font-mono`} />
            <p className="text-[11px] text-slate-400 mt-1">A domain covers the whole site (subdomains included). A full URL starting with https:// limits the results to that page.</p>
          </div>
          <LabsLocationLanguageFields defaultLocation={q.location} defaultLanguage={q.language} className={inputCls} labelClassName={labelCls} />
          <div>
            <label className={labelCls}>Sort by</label>
            <select name="order_by" defaultValue={q.orderBy} className={inputCls}>
              {Object.entries(ORDERS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Max position</label>
              <select name="max_position" defaultValue={String(q.maxPosition ?? '')} className={inputCls}>
                <option value="">All (top 100)</option>
                <option value="3">Top 3</option>
                <option value="10">Top 10</option>
                <option value="20">Top 20</option>
                <option value="50">Top 50</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Rows</label>
              <select name="limit" defaultValue={String(q.limit)} className={inputCls}>
                {LIMITS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </div>

        <details open={advancedOpen}>
          <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 select-none">
            Filters <span className="normal-case font-medium tracking-normal">(applied by DataForSEO: you only pay for matching rows)</span>
          </summary>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div>
              <label className={labelCls}>Min. volume</label>
              <input name="min_volume" type="number" min={0} defaultValue={q.minVolume ?? ''} placeholder="e.g. 50" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Max. KD</label>
              <input name="max_kd" type="number" min={0} max={100} defaultValue={q.maxKd ?? ''} placeholder="e.g. 40" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Intent</label>
              <select name="intent" defaultValue={q.intent} className={inputCls}>
                <option value="">Any</option>
                {INTENTS.map((i) => <option key={i} value={i}>{i[0].toUpperCase() + i.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} title="Live: keywords ranking now. Lost: keywords that ranked at the previous check and no longer do.">
                <span className="underline decoration-dotted underline-offset-[3px] cursor-help">Rankings</span>
              </label>
              <select name="serp_mode" defaultValue={q.serpMode} className={inputCls}>
                <option value="live">Current (live)</option>
                <option value="lost">Lost since last check</option>
                <option value="all">Current + lost</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Keyword contains</label>
              <input name="keyword" type="text" defaultValue={q.keyword} placeholder="e.g. price" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Keyword excludes</label>
              <input name="exclude_keyword" type="text" defaultValue={q.excludeKeyword} placeholder="e.g. brand name" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>URL contains</label>
              <input name="url_contains" type="text" defaultValue={q.urlContains} placeholder="e.g. /blog/" className={`${inputCls} font-mono`} />
            </div>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer" title="Keep one keyword per group of near-identical variants (plurals, word order…).">
                <input type="checkbox" name="ignore_synonyms" value="1" defaultChecked={q.ignoreSynonyms} /> Skip near-duplicates
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                <input type="checkbox" name="include_paid" value="1" defaultChecked={q.includePaid} /> Include Google Ads
              </label>
            </div>
          </div>
        </details>
      </SearchForm>

      {prefill && q.target && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-sm rounded-xl px-4 py-3">
          Form prefilled for <span className="font-mono font-bold">{q.target}</span>. Nothing has been charged: adjust the filters, then run the analysis.
        </div>
      )}

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {/* Stats bar */}
      {ran && !error && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Matching keywords', value: totalCount.toLocaleString('en-GB'), sub: `${items.length} loaded`, hint: 'Total keywords matching your filters, according to DataForSEO.' },
            { label: 'Traffic (loaded)', value: Math.round(etv).toLocaleString('en-GB'), sub: `worth ~$${Math.round(value).toLocaleString('en-GB')}/mo in ads`, hint: 'Sum of the estimated monthly visits (ETV) of the loaded rows, and what that traffic would cost in Google Ads.' },
            { label: 'Top 10', value: top10, sub: `of which top 3: ${top3}` },
            { label: 'Striking distance', value: striking, sub: 'positions 4–20', hint: 'Keywords ranking 4–20: close to the top, usually the cheapest gains.' },
            { label: 'Movements', value: `+${moves.up + moves.new} / −${moves.down + moves.lost}`, sub: `${moves.new} new · ${moves.up} up · ${moves.down} down · ${moves.lost} lost`, hint: 'Compared with the previous check of each SERP by DataForSEO (usually a few weeks earlier).' },
          ].map((stat) => (
            <div key={stat.label} title={stat.hint} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{stat.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Results table */}
      {ran && !error && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
                <span className="text-slate-900 dark:text-white normal-case font-mono">{q.target}</span> — ranked keywords
              </h2>
              {historyId && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
              <span className="text-[11px] text-slate-400">{q.location} · {q.language}{filterSummary(q) && ` · ${filterSummary(q)}`}</span>
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton data={csvData} columns={csvColumns} />
                  <ExportCSVButton data={csvData} filename={`ranked-keywords-${cleanDomain(q.target)}.csv`} columns={csvColumns} />
                </div>
              )}
            </div>
          </div>
          {links.length > 0 && (
            <div className="px-6 py-2 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
              <span className="font-black uppercase tracking-widest">Next:</span>
              {links.map((l) => <a key={l.label} href={l.href} className="font-bold hover:text-blue-600">{l.label} →</a>)}
            </div>
          )}

          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No keywords match. Loosen the filters or check the location.</div>
          ) : (
            <RankedKeywordsTable items={items} showType={q.includePaid} />
          )}

          {(q.offset > 0 || q.offset + items.length < totalCount) && !historyId && (
            <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              {q.offset > 0
                ? <a href={pageHref(Math.max(0, q.offset - q.limit))} className="text-xs font-bold text-blue-600 hover:underline">← Previous {q.limit}</a>
                : <span />}
              <span className="text-[11px] text-slate-400">{q.offset + 1}–{q.offset + items.length} of {totalCount.toLocaleString('en-GB')}</span>
              {q.offset + items.length < totalCount
                ? <a href={pageHref(q.offset + q.limit)} className="text-xs font-bold text-blue-600 hover:underline">Next {q.limit} <span className="font-mono text-slate-400 font-normal">(≤ ${labsCostEstimate(q.limit).toFixed(3)})</span> →</a>
                : <span />}
            </div>
          )}
        </div>
      )}

      {ran && !error && items.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-sm text-slate-600 dark:text-slate-400 space-y-1.5">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">How to read this</h2>
          <p><strong className="text-slate-800 dark:text-slate-200">Traffic (ETV)</strong> is the estimated monthly visits a keyword brings at its current position: volume × expected click-through rate. Sort by it to see what actually drives the site.</p>
          <p><strong className="text-slate-800 dark:text-slate-200">Change</strong> compares with DataForSEO&apos;s previous check of that SERP (absolute positions, ads and features included). Use “Rankings: Lost” to list keywords that dropped out entirely.</p>
          <p>The <strong className="text-slate-800 dark:text-slate-200">By page</strong> view groups keywords by URL: the pages carrying the traffic, and those competing for the same queries (cannibalisation).</p>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              const eq = entryQuery(entry, defaults);
              const summary = filterSummary(eq);
              return (
                <div key={entry.id} className={`flex items-center gap-2 pr-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <a href={`/dashboard/ranked-keywords?history_id=${entry.id}#results`} className="flex flex-1 min-w-0 items-center gap-4 pl-6 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate font-mono ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{eq.target || entry.target}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {entry.location} · {entry.count} shown / {entry.totalCount.toLocaleString('en-GB')} total
                        {summary && ` · ${summary}`}
                        {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                  </a>
                  <DeleteHistoryButton table="ranked_kw_searches" id={entry.id} path="/dashboard/ranked-keywords" label={entry.target} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(RankedKeywordsPage);
