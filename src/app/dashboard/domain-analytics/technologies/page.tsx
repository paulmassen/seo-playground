import { withProjectScope } from '@/lib/db';
import {
  getCredentials,
  getDomainTechHistory,
  saveDomainTechSearch,
  getDomainTechResult,
  getDomainFindHistory,
  saveDomainFindSearch,
  getDomainFindResults,
  getTechStatsHistory,
  saveTechStatsSearch,
  getTechStatsResult,
  type DomainTechEntry,
  type DomainFindEntry,
  type TechStatsEntry,
} from '@/lib/db';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import DeleteHistoryButton from '@/components/DeleteHistoryButton';
import { stableSearchId } from '@/lib/dedupe';
import { ranksTo100 } from '@/lib/dfs-rank';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import { LABS_LOCATIONS } from '@/lib/geo-options';
import TechFindTable from './TechFindTable';
import FindFields from './FindFields';
import CompareMatrix, { type CompareColumn } from './CompareMatrix';
import TechNameInput from './TechNameInput';
import AdoptionChart, { type StatsPoint } from './AdoptionChart';
import { canonicalTechName, catalogTechNames, getTechCatalog, suggestTechNames, type TechCatalog } from './tech-catalog';
import {
  estimateFindPrice,
  findByTechHref,
  findParamsToQuery,
  flattenTechs,
  formatLabel,
  GROUP_HELP,
  LANGUAGE_CODES,
  MAX_COMPARE,
  ORDER_OPTIONS,
  PRICE_DOMAIN,
  PRICE_STATS_ITEM,
  PRICE_STATS_TASK,
  STATS_MIN_DATE,
  type FindBy,
  type FindParams,
  type MatchMode,
  type TechCategories,
  type TechDomainItem,
} from './tech-shared';

export const dynamic = 'force-dynamic';

const BASE = '/dashboard/domain-analytics/technologies';

// ---- Types ----

interface StatsResult { technology?: string; date_from?: string; date_to?: string; items?: StatsPoint[] }

interface SearchParams {
  mode?: string;
  /** prefill=1: fill the form from the URL but never run a paid call. */
  prefill?: string;
  // Analyze / compare
  target?: string;
  history_id?: string;
  fresh?: string;
  // Find
  by?: string;
  technology?: string;
  category?: string;
  group?: string;
  path?: string;
  keyword?: string;
  match?: string;
  country?: string;
  min_dr?: string;
  lang?: string;
  order?: string;
  limit?: string;
  page?: string;
  find_history_id?: string;
  // Adoption trend
  date_from?: string;
  date_to?: string;
  stats_history_id?: string;
  stats_country?: string;
}

// ---- API ----

function cleanTarget(t: string) {
  return t.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

async function fetchDomainTech(target: string, login: string, pass: string): Promise<{ result: TechDomainItem | null; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<TechDomainItem>(
    'domain_analytics/technologies/domain_technologies/live', { target }, { login, pass }, 20_000,
  );
  if (error) return { result: null, error };
  // Domain Analytics has no rank_scale option: ranks come on 0–1000, the app shows 0–100.
  return { result: result ? ranksTo100(result) : null, cost };
}

/**
 * Request body for domains_by_technology. Per the docs: one of technology_paths / technologies /
 * categories / groups / keywords is required; `mode` is as_is (exact) or entry (partial); filters
 * use domain_rank on DataForSEO's 0–1000 scale; limit + offset must not exceed 10,000.
 */
function findRequestBody(p: FindParams): Record<string, unknown> {
  const body: Record<string, unknown> = { limit: p.limit, offset: p.page * p.limit, order_by: [p.order] };
  if (p.by === 'technology') {
    if (p.path) body.technology_paths = [{ path: p.path, name: p.value }];
    else body.technologies = [p.value];
  }
  if (p.by === 'category') body.categories = [p.value];
  if (p.by === 'group') body.groups = [p.value];
  if (p.keyword) body.keywords = [p.keyword];
  if (p.by !== 'keyword') body.mode = p.match;

  const conditions: unknown[] = [];
  if (p.country) conditions.push(['country_iso_code', '=', p.country]);
  if (p.minDr > 0) conditions.push(['domain_rank', '>=', p.minDr * 10]);
  if (p.lang) conditions.push(['language_code', '=', p.lang]);
  if (conditions.length === 1) body.filters = conditions[0];
  if (conditions.length > 1) body.filters = conditions.flatMap((c, i) => (i === 0 ? [c] : ['and', c]));
  return body;
}

async function fetchDomainsByTech(p: FindParams, login: string, pass: string): Promise<{ items: TechDomainItem[]; total?: number; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: TechDomainItem[] }>(
    'domain_analytics/technologies/domains_by_technology/live', findRequestBody(p), { login, pass }, 30_000,
  );
  if (error) return { items: [], error };
  return { items: (result?.items ?? []).map(ranksTo100), total: result?.total_count, cost };
}

async function fetchTechStats(technology: string, dateFrom: string, dateTo: string, login: string, pass: string): Promise<{ result: StatsResult | null; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<StatsResult>(
    'domain_analytics/technologies/technology_stats/live', { technology, date_from: dateFrom, date_to: dateTo }, { login, pass }, 30_000,
  );
  if (error) return { result: null, error };
  return { result: result ?? null, cost };
}

// ---- Param parsing ----

const FIND_BYS: FindBy[] = ['technology', 'category', 'group', 'keyword'];
const ORDER_VALUES: string[] = ORDER_OPTIONS.map((o) => o.value);
const LANG_VALUES: string[] = LANGUAGE_CODES.map((l) => l.value);
const COUNTRY_NAMES = new Map<string, string>(LABS_LOCATIONS.map((l) => [l.iso, l.name]));

function parseFindParams(sp: SearchParams): FindParams {
  const by = FIND_BYS.includes(sp.by as FindBy) ? (sp.by as FindBy) : 'technology';
  const value = (by === 'technology' ? sp.technology : by === 'category' ? sp.category : by === 'group' ? sp.group : '')?.trim() ?? '';
  const limit = [10, 20, 50, 100].includes(Number(sp.limit)) ? Number(sp.limit) : 20;
  const maxPage = Math.floor((10_000 - limit) / limit);
  const path = by === 'technology' && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(sp.path ?? '') ? sp.path! : '';
  const country = sp.country?.toUpperCase() ?? '';
  return {
    by,
    value,
    path,
    keyword: sp.keyword?.trim() ?? '',
    match: (sp.match === 'entry' ? 'entry' : 'as_is') as MatchMode,
    country: COUNTRY_NAMES.has(country) ? country : '',
    minDr: Math.min(Math.max(parseInt(sp.min_dr ?? '0', 10) || 0, 0), 100),
    lang: LANG_VALUES.includes(sp.lang ?? '') ? sp.lang! : '',
    order: ORDER_VALUES.includes(sp.order ?? '') ? sp.order! : ORDER_OPTIONS[0].value,
    limit,
    page: Math.min(Math.max(parseInt(sp.page ?? '0', 10) || 0, 0), maxPage),
  };
}

/** Saved params of a history entry; older rows only stored technology + keyword. */
function entryFindParams(e: DomainFindEntry): FindParams {
  if (e.params) {
    try { return JSON.parse(e.params) as FindParams; } catch { /* fall through */ }
  }
  return {
    by: e.technology ? 'technology' : 'keyword', value: e.technology ?? '', path: '', keyword: e.keyword ?? '',
    match: 'as_is', country: '', minDr: 0, lang: '', order: ORDER_OPTIONS[0].value, limit: e.count || 20, page: 0,
  };
}

function hasFindQuery(p: FindParams) {
  return p.by === 'keyword' ? Boolean(p.keyword) : Boolean(p.value);
}

function catalogTitle(catalog: TechCatalog, by: 'category' | 'group', id: string) {
  if (by === 'group') return catalog.groups.find((g) => g.id === id)?.title ?? formatLabel(id);
  for (const g of catalog.groups) {
    const c = g.categories.find((x) => x.id === id);
    if (c) return c.title;
  }
  return formatLabel(id);
}

function findLabel(p: FindParams, catalog: TechCatalog) {
  const parts: string[] = [];
  if (p.by === 'technology') parts.push(p.value + (p.match === 'entry' ? ' (partial)' : ''));
  if (p.by === 'category') parts.push(`Category: ${catalogTitle(catalog, 'category', p.value)}`);
  if (p.by === 'group') parts.push(`Group: ${catalogTitle(catalog, 'group', p.value)}`);
  if (p.keyword) parts.push(`"${p.keyword}"`);
  return parts.join(' + ') || '—';
}

function findFilterSummary(p: FindParams) {
  const parts: string[] = [];
  if (p.country) parts.push(COUNTRY_NAMES.get(p.country) ?? p.country);
  if (p.lang) parts.push(`lang ${p.lang}`);
  if (p.minDr) parts.push(`DR ≥ ${p.minDr}`);
  if (p.order !== ORDER_OPTIONS[0].value) parts.push(ORDER_OPTIONS.find((o) => o.value === p.order)?.label ?? p.order);
  if (p.page) parts.push(`page ${p.page + 1}`);
  return parts.join(' · ');
}

function isoDate(s: string | undefined, fallback: string, min: string, max: string) {
  const v = /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') ? s! : fallback;
  return v < min ? min : v > max ? max : v;
}

// ---- UI helpers ----

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-GB');
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pct(d: number) {
  return `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}%`;
}

const CATEGORY_COLORS: Record<string, string> = {
  'content': 'bg-blue-50 border-blue-100 text-blue-700 hover:border-blue-300',
  'analytics': 'bg-violet-50 border-violet-100 text-violet-700 hover:border-violet-300',
  'marketing': 'bg-pink-50 border-pink-100 text-pink-700 hover:border-pink-300',
  'sales': 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:border-emerald-300',
  'add_ons': 'bg-amber-50 border-amber-100 text-amber-700 hover:border-amber-300',
  'security': 'bg-red-50 border-red-100 text-red-700 hover:border-red-300',
  'web_development': 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:border-indigo-300',
  'servers': 'bg-teal-50 border-teal-100 text-teal-700 hover:border-teal-300',
};

function categoryColor(cat: string) {
  for (const [key, val] of Object.entries(CATEGORY_COLORS)) {
    if (cat.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-400';
}

function PriceTag({ price }: { price: number }) {
  return <span className="font-mono text-[10px] opacity-50 ml-1.5">~${price.toFixed(3)}</span>;
}

const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm';
const formCard = `${card} p-6 space-y-4`;
const btn = 'w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors';
const inputCls = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 transition-all';
const labelCls = 'block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5';

function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'error' }) {
  return tone === 'error'
    ? <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{children}</div>
    : <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-sm rounded-xl px-4 py-3">{children}</div>;
}

function HistoryBadge() {
  return <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>;
}

function HistoryCard({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
      </div>
      <div className="divide-y divide-slate-50 dark:divide-slate-700">{children}</div>
    </div>
  );
}

function HistoryRow({ href, active, title, sub, ts, mono, del }: { href: string; active: boolean; title: string; sub?: string; ts: number; mono?: boolean; del: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-2 pr-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${active ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
      <a href={href} className="flex flex-1 min-w-0 items-center gap-4 pl-6 py-3.5">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold truncate ${mono ? 'font-mono' : ''} ${active ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{title}</p>
          {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
        <span className="shrink-0 text-[11px] text-slate-400">{fmtDate(ts)}</span>
      </a>
      {del}
    </div>
  );
}

// ---- Page ----

async function TechnologiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const catalog = getTechCatalog(creds);
  const prefill = params.prefill === '1';

  const mode = params.mode === 'find' ? 'find' : params.mode === 'stats' ? 'stats' : 'domain';

  // ======== Analyze Domain (one domain, or up to MAX_COMPARE side by side) ========
  const historyId = params.history_id;
  const rawTargets = [...new Set((params.target ?? '').split(/[\s,;]+/).map(cleanTarget).filter(Boolean))];
  const targets = rawTargets.slice(0, MAX_COMPARE);
  const tooMany = rawTargets.length > MAX_COMPARE;
  const domainHistory = getDomainTechHistory();
  const latestSaved = (domain: string) => domainHistory.find((e) => e.target === domain) ?? null;

  let domainResult: TechDomainItem | null = null;
  let domainCost: number | undefined;
  let domainError: string | null = null;
  let isDomainFromHistory = false;
  let activeDomainEntry: DomainTechEntry | null = null;
  let compareColumns: CompareColumn[] = [];
  let compareCost = 0;
  const compareErrors: string[] = [];

  if (mode === 'domain') {
    if (historyId) {
      domainResult = getDomainTechResult<TechDomainItem>(historyId);
      if (domainResult) {
        isDomainFromHistory = true;
        activeDomainEntry = domainHistory.find((e) => e.id === historyId) ?? null;
      } else {
        domainError = 'This search is no longer available.';
      }
    } else if (targets.length === 1 && !prefill) {
      const target = targets[0];
      const dedupeId = stableSearchId(['domain-tech', target]);
      const cachedResult = getDomainTechResult<TechDomainItem>(dedupeId);
      if (cachedResult) {
        domainResult = cachedResult;
        domainCost = domainHistory.find((e) => e.id === dedupeId)?.cost;
      } else if (!creds) {
        domainError = 'DataForSEO credentials missing. Configure them in Settings.';
      } else {
        const res = await fetchDomainTech(target, creds.login, creds.pass);
        if (res.error) {
          domainError = res.error;
        } else if (res.result) {
          domainResult = res.result;
          domainCost = res.cost;
          saveDomainTechSearch({ id: dedupeId, ts: Date.now(), target, cost: domainCost }, domainResult);
        } else {
          domainError = 'No data found for this domain.';
        }
      }
    } else if (targets.length > 1 && !prefill) {
      // Compare: reuse the latest saved profile of each domain unless fresh=1, so re-opening a
      // comparison is free; only domains never analysed (or explicitly refreshed) are paid for.
      const fresh = params.fresh === '1';
      const columns = await Promise.all(targets.map(async (domain): Promise<CompareColumn | null> => {
        const dedupeId = stableSearchId(['domain-tech', domain]);
        const windowHit = getDomainTechResult<TechDomainItem>(dedupeId);
        if (windowHit) return { domain, technologies: windowHit.technologies, fromHistory: false };
        const saved = !fresh ? latestSaved(domain) : null;
        const savedResult = saved ? getDomainTechResult<TechDomainItem>(saved.id) : null;
        if (saved && savedResult) return { domain, technologies: savedResult.technologies, savedAt: saved.ts, fromHistory: true };
        if (!creds) { compareErrors.push(`${domain}: DataForSEO credentials missing.`); return null; }
        const res = await fetchDomainTech(domain, creds.login, creds.pass);
        if (res.error || !res.result) { compareErrors.push(`${domain}: ${res.error ?? 'no data found'}`); return null; }
        compareCost += res.cost ?? 0;
        saveDomainTechSearch({ id: dedupeId, ts: Date.now(), target: domain, cost: res.cost }, res.result);
        return { domain, technologies: res.result.technologies, fromHistory: false };
      }));
      compareColumns = columns.filter((c): c is CompareColumn => c !== null);
    }
  }

  // ======== Find Domains ========
  const findHistoryId = params.find_history_id;
  const findHistory = getDomainFindHistory();
  let findParams = parseFindParams(params);
  let findItems: TechDomainItem[] = [];
  let findTotal: number | undefined;
  let findCost: number | undefined;
  let findError: string | null = null;
  let findSuggestions: string[] = [];
  let isFindFromHistory = false;
  let findRan = false;

  if (mode === 'find') {
    if (findHistoryId) {
      const entry = findHistory.find((e) => e.id === findHistoryId) ?? null;
      findItems = getDomainFindResults<TechDomainItem>(findHistoryId) ?? [];
      if (entry) {
        isFindFromHistory = true;
        findRan = true;
        findParams = entryFindParams(entry);
        findTotal = entry.totalCount;
        findCost = entry.cost;
      } else {
        findError = 'This search is no longer available.';
      }
    } else if (hasFindQuery(findParams)) {
      // Fix the casing to the catalogue spelling, and refuse exact searches that can only return nothing.
      if (findParams.by === 'technology') {
        const canonical = canonicalTechName(catalog, findParams.value);
        if (canonical) findParams = { ...findParams, value: canonical };
        else if (findParams.match === 'as_is' && catalog.groups.length > 0) {
          findError = `“${findParams.value}” is not in DataForSEO's technology list, so an exact search would return nothing (and still be charged). Nothing was charged.`;
          findSuggestions = suggestTechNames(catalog, findParams.value);
        }
      }
      if (!findError && !prefill) {
        const dedupeId = stableSearchId(['domain-find', JSON.stringify(findParams)]);
        const cachedItems = getDomainFindResults<TechDomainItem>(dedupeId);
        if (cachedItems) {
          findRan = true;
          findItems = cachedItems;
          const cachedEntry = findHistory.find((e) => e.id === dedupeId);
          findTotal = cachedEntry?.totalCount;
          findCost = cachedEntry?.cost;
        } else if (!creds) {
          findError = 'DataForSEO credentials missing. Configure them in Settings.';
        } else {
          const res = await fetchDomainsByTech(findParams, creds.login, creds.pass);
          if (res.error) {
            findError = res.error;
          } else {
            findRan = true;
            findItems = res.items;
            findTotal = res.total;
            findCost = res.cost;
            // Saved even when empty, so the spend is recorded and the search can be found again.
            saveDomainFindSearch({
              id: dedupeId, ts: Date.now(),
              keyword: findParams.keyword || undefined,
              technology: findParams.by === 'technology' ? findParams.value : undefined,
              count: findItems.length, totalCount: findTotal, cost: findCost,
              params: JSON.stringify(findParams),
            }, findItems);
          }
        }
      }
    }
  }

  // ======== Adoption trend (technology_stats) ========
  // technology_stats rejects date_to >= today ("must be earlier than present date").
  const today = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const statsHistoryId = params.stats_history_id;
  const statsHistory = getTechStatsHistory();
  let statsTech = mode === 'stats' ? params.technology?.trim() ?? '' : '';
  let statsFrom = isoDate(params.date_from, yearAgo, STATS_MIN_DATE, today);
  let statsTo = isoDate(params.date_to, today, STATS_MIN_DATE, today);
  let statsResult: StatsResult | null = null;
  let statsCost: number | undefined;
  let statsError: string | null = null;
  let statsSuggestions: string[] = [];
  let isStatsFromHistory = false;

  if (mode === 'stats') {
    if (statsHistoryId) {
      const entry = statsHistory.find((e) => e.id === statsHistoryId) ?? null;
      statsResult = getTechStatsResult<StatsResult>(statsHistoryId);
      if (entry && statsResult) {
        isStatsFromHistory = true;
        statsTech = entry.technology;
        statsFrom = entry.dateFrom;
        statsTo = entry.dateTo;
        statsCost = entry.cost;
      } else {
        statsError = 'This search is no longer available.';
      }
    } else if (statsTech) {
      if (statsFrom > statsTo) [statsFrom, statsTo] = [statsTo, statsFrom];
      const canonical = canonicalTechName(catalog, statsTech);
      if (canonical) statsTech = canonical;
      else if (catalog.groups.length > 0) {
        statsError = `“${statsTech}” is not in DataForSEO's technology list. Nothing was charged.`;
        statsSuggestions = suggestTechNames(catalog, statsTech);
      }
      if (!statsError && !prefill) {
        const dedupeId = stableSearchId(['tech-stats', statsTech, statsFrom, statsTo]);
        const cached = getTechStatsResult<StatsResult>(dedupeId);
        if (cached) {
          statsResult = cached;
          statsCost = statsHistory.find((e) => e.id === dedupeId)?.cost;
        } else if (!creds) {
          statsError = 'DataForSEO credentials missing. Configure them in Settings.';
        } else {
          const res = await fetchTechStats(statsTech, statsFrom, statsTo, creds.login, creds.pass);
          if (res.error) statsError = res.error;
          else if (res.result) {
            statsResult = res.result;
            statsCost = res.cost;
            const entry: TechStatsEntry = { id: dedupeId, ts: Date.now(), technology: statsTech, dateFrom: statsFrom, dateTo: statsTo, cost: statsCost };
            saveTechStatsSearch(entry, statsResult);
          } else statsError = 'No data returned for this technology.';
        }
      }
    }
  }

  // ---- Derived display values ----
  const techNames = mode === 'stats' ? catalogTechNames(catalog) : [];
  const displayTarget = activeDomainEntry?.target ?? targets.join(', ');
  const domainTechs = flattenTechs(domainResult?.technologies);
  const techCategories = domainResult?.technologies
    ? Object.entries(domainResult.technologies as TechCategories).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const findPrice = estimateFindPrice(findParams.limit);
  const domainPrice = targets.length > 1 ? PRICE_DOMAIN * targets.filter((t) => !latestSaved(t)).length : PRICE_DOMAIN;
  const statsMonths = Math.max(1, Math.round((Date.parse(statsTo) - Date.parse(statsFrom)) / (30.4 * 24 * 3600 * 1000)) + 1);
  const statsPrice = PRICE_STATS_TASK + statsMonths * PRICE_STATS_ITEM;
  const statsItems = statsResult?.items ?? [];
  const statsCountry = params.stats_country?.toUpperCase() ?? '';
  const prefillSaved = prefill && targets.length === 1 ? latestSaved(targets[0]) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Technologies</h1>
        <p className="text-sm text-slate-400 mt-1">
          See which CMS, analytics, ad and e-commerce tools a site runs, compare stacks, or build lists of sites using a given technology.
          Data comes from DataForSEO&apos;s crawl of home pages, so it can be a few weeks old.
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {([
          { label: 'Analyze Domain', value: 'domain' },
          { label: 'Find Domains', value: 'find' },
          { label: 'Adoption Trend', value: 'stats' },
        ] as const).map((tab) => (
          <a
            key={tab.value}
            href={`${BASE}?mode=${tab.value}`}
            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
              mode === tab.value
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {/* ================= Analyze Domain ================= */}
      {mode === 'domain' && (
        <>
          <SearchForm className={formCard} btnLabel={<>{targets.length > 1 ? 'Compare' : 'Analyze'}<PriceTag price={domainPrice} /></>} btnClassName={btn}>
            <input type="hidden" name="mode" value="domain" />
            <div>
              <label className={labelCls} htmlFor="target-input">Domain(s)</label>
              <input
                id="target-input" type="text" name="target"
                defaultValue={displayTarget}
                placeholder="example.com, or up to 5 domains separated by commas to compare"
                required
                className={`${inputCls} font-mono`}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                One domain shows its full stack and contact details. Up to {MAX_COMPARE} comma-separated domains are compared side by side.
                Each domain costs ~${PRICE_DOMAIN.toFixed(3)}; in a comparison, domains already in your history are reused for free.
              </p>
            </div>
          </SearchForm>

          {tooMany && <Notice>Only the first {MAX_COMPARE} domains are compared.</Notice>}
          {prefill && targets.length > 0 && (
            <Notice>
              Form prefilled, nothing has been charged. Click {targets.length > 1 ? 'Compare' : 'Analyze'} to run it.
              {prefillSaved && (
                <> Or <a className="font-bold underline" href={`${BASE}?mode=domain&history_id=${prefillSaved.id}#results`}>open the saved result from {fmtDate(prefillSaved.ts)}</a> for free.</>
              )}
            </Notice>
          )}
          {domainError && <Notice tone="error">{domainError}</Notice>}
          {compareErrors.length > 0 && <Notice tone="error">{compareErrors.join(' · ')}</Notice>}

          {/* Compare */}
          {compareColumns.length > 0 && (
            <div id="results" className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-400">
                {compareColumns.map((c) => (
                  <span key={c.domain} className="font-mono">
                    {c.domain}: {c.fromHistory && c.savedAt ? `saved ${fmtDate(c.savedAt)}` : 'fresh'}
                  </span>
                ))}
                {compareColumns.some((c) => c.fromHistory) && (
                  <a className="font-bold text-blue-600 hover:text-blue-800" href={`${BASE}?mode=domain&target=${encodeURIComponent(targets.join(','))}&fresh=1#results`}>
                    Re-analyze all (~${(PRICE_DOMAIN * targets.length).toFixed(3)})
                  </a>
                )}
                <span className="ml-auto font-mono">cost: ${compareCost.toFixed(4)}</span>
              </div>
              <CompareMatrix columns={compareColumns} />
            </div>
          )}

          {/* Single domain */}
          {domainResult && (
            <div id="results" className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400">Domain</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{domainResult.domain ?? displayTarget}</span>
                  {isDomainFromHistory && <HistoryBadge />}
                </div>
                {domainResult.domain_rank !== undefined && (
                  <div className="flex items-center gap-1.5" title="DataForSEO domain rank, 0–100, based on the backlink profile.">
                    <span className="text-xs font-black uppercase tracking-widest text-slate-400">DR</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{fmt(domainResult.domain_rank)}</span>
                  </div>
                )}
                {domainResult.country_iso_code && <span className="text-sm font-bold text-slate-500 uppercase">{domainResult.country_iso_code}</span>}
                {domainTechs.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black uppercase tracking-widest text-slate-400">Technologies</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{domainTechs.length}</span>
                  </div>
                )}
                {domainResult.last_visited && <span className="text-[11px] text-slate-400">crawled {domainResult.last_visited.split(' ')[0]}</span>}
                <div className="flex items-center gap-2 ml-auto">
                  {domainCost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${domainCost.toFixed(4)}</span>}
                  {domainTechs.length > 0 && (
                    <>
                      <CopyMarkdownButton
                        data={domainTechs.map((t) => ({ group: formatLabel(t.group), category: formatLabel(t.category), technology: t.name }))}
                        columns={[{ key: 'group', label: 'Group' }, { key: 'category', label: 'Category' }, { key: 'technology', label: 'Technology' }]}
                      />
                      <ExportCSVButton
                        data={domainTechs.map((t) => ({ group: formatLabel(t.group), category: formatLabel(t.category), technology: t.name, path: t.path }))}
                        columns={[{ key: 'group', label: 'Group' }, { key: 'category', label: 'Category' }, { key: 'technology', label: 'Technology' }, { key: 'path', label: 'Path' }]}
                        filename={`tech-stack-${domainResult.domain ?? displayTarget}.csv`}
                      />
                    </>
                  )}
                </div>
              </div>

              {(domainResult.title || domainResult.emails?.length || domainResult.phone_numbers?.length || domainResult.social_graph_urls?.length) && (
                <div className={`${card} p-5 space-y-3`}>
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Domain Info</h2>
                  {domainResult.title && <p className="text-sm font-bold text-slate-900 dark:text-white">{domainResult.title}</p>}
                  {domainResult.description && <p className="text-sm text-slate-500">{domainResult.description}</p>}
                  <div className="flex flex-wrap gap-4 pt-1">
                    {([['Emails', domainResult.emails], ['Phone', domainResult.phone_numbers]] as const).map(([lbl, list]) => list && list.length > 0 && (
                      <div key={lbl}>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{lbl}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {list.map((v) => (
                            <span key={v} className="text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md">{v}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {domainResult.social_graph_urls && domainResult.social_graph_urls.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Social</p>
                        <div className="flex flex-wrap gap-1.5">
                          {domainResult.social_graph_urls.map((u) => /^https?:\/\//.test(u) ? (
                            <a key={u} href={u} target="_blank" rel="noopener noreferrer"
                              className="text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded-md truncate max-w-[220px]">{u}</a>
                          ) : (
                            <span key={u} className="text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md">{u}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {techCategories.length > 0 ? (
                <>
                  <p className="text-[11px] text-slate-400">
                    DataForSEO files each technology under a group (e.g. Marketing) and a category (e.g. CRM). Click a technology to list other
                    sites that use it: the search form opens prefilled and nothing is charged until you run it.
                  </p>
                  {techCategories.map(([category, subcats]) => {
                    const subEntries = Object.entries(subcats).sort(([a], [b]) => a.localeCompare(b));
                    const colorClass = categoryColor(category);
                    const uniqueCount = new Set(subEntries.flatMap(([, names]) => names)).size;
                    return (
                      <div key={category} className={`${card} overflow-hidden`}>
                        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <h2 className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">{formatLabel(category)}</h2>
                            {GROUP_HELP[category] && <p className="text-[11px] text-slate-400 mt-0.5">{GROUP_HELP[category]}</p>}
                          </div>
                          <span className="text-[10px] font-black text-slate-400 shrink-0">{uniqueCount}</span>
                        </div>
                        <div className="p-4 space-y-3">
                          {subEntries.map(([subcat, names]) => (
                            <div key={subcat}>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{formatLabel(subcat)}</p>
                              <div className="flex flex-wrap gap-2">
                                {names.map((name) => (
                                  <a key={name} href={findByTechHref(name, `${category}.${subcat}`)}
                                    title={`Find other domains using ${name}`}
                                    className={`inline-flex items-center px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${colorClass}`}>
                                    {name}
                                  </a>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className={`${card} px-6 py-12 text-center text-sm text-slate-400`}>No technologies detected for this domain.</div>
              )}
            </div>
          )}

          {domainHistory.length > 0 && (
            <HistoryCard>
              {domainHistory.map((entry) => (
                <HistoryRow key={entry.id} mono
                  href={`${BASE}?mode=domain&history_id=${entry.id}#results`}
                  active={entry.id === historyId}
                  title={entry.target}
                  sub={entry.cost !== undefined ? `$${entry.cost.toFixed(4)}` : undefined}
                  ts={entry.ts}
                  del={<DeleteHistoryButton table="domain_tech_searches" id={entry.id} path={BASE} label={entry.target} />}
                />
              ))}
            </HistoryCard>
          )}
        </>
      )}

      {/* ================= Find Domains ================= */}
      {mode === 'find' && (
        <>
          <SearchForm className={formCard} btnLabel={<>Search<PriceTag price={findPrice} /></>} btnClassName={btn}>
            <FindFields groups={catalog.groups} initial={findParams} />
          </SearchForm>

          {prefill && hasFindQuery(findParams) && !findError && (
            <Notice>Form prefilled, nothing has been charged. Adjust the filters if needed, then click Search (~${findPrice.toFixed(3)}).</Notice>
          )}
          {findError && (
            <Notice tone="error">
              {findError}
              {findSuggestions.length > 0 && (
                <span className="block mt-1.5">
                  Did you mean:{' '}
                  {findSuggestions.map((s, i) => (
                    <span key={s}>
                      {i > 0 && ', '}
                      <a className="font-bold underline" href={`${BASE}?${findParamsToQuery({ ...findParams, value: s, path: '', page: 0 }, { prefill: '1' })}`}>{s}</a>
                    </span>
                  ))}
                  {' '}— or <a className="font-bold underline" href={`${BASE}?${findParamsToQuery({ ...findParams, match: 'entry', page: 0 }, { prefill: '1' })}`}>switch to partial match</a>.
                </span>
              )}
            </Notice>
          )}

          {findRan && !findError && (
            <div id="results" className="space-y-3">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold">{findLabel(findParams, catalog)}</span>
                {findFilterSummary(findParams) && <span className="text-[11px] text-slate-400">{findFilterSummary(findParams)}</span>}
                {isFindFromHistory && <HistoryBadge />}
                {findTotal !== undefined && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-xs font-black uppercase tracking-widest text-slate-400">Total</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{fmt(findTotal)}</span>
                    <span className="text-xs text-slate-400">domains</span>
                    {findCost !== undefined && <span className="text-[10px] font-mono text-slate-400 ml-2">· cost: ${findCost.toFixed(4)}</span>}
                  </div>
                )}
              </div>

              {findItems.length === 0 ? (
                <div className={`${card} px-6 py-12 text-center text-sm text-slate-400`}>
                  No domains found.{findParams.match === 'as_is' && findParams.by !== 'keyword' ? ' Try a partial match or remove some filters.' : ' Try removing some filters.'}
                </div>
              ) : (
                <TechFindTable
                  items={findItems}
                  highlight={findParams.by === 'technology' ? findParams.value : undefined}
                  filename={`domains-${findLabel(findParams, catalog).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-p${findParams.page + 1}.csv`}
                />
              )}

              {findTotal !== undefined && findTotal > findParams.limit && (
                <div className="flex items-center justify-between gap-4 text-xs flex-wrap">
                  <span className="text-slate-400">
                    Domains {fmt(findParams.page * findParams.limit + 1)}–{fmt(findParams.page * findParams.limit + findItems.length)} of {fmt(findTotal)}.
                    {' '}Each page is a separate paid call.
                    {findTotal > 10_000 && ' DataForSEO pages through the first 10,000 only: narrow with filters to reach the rest.'}
                  </span>
                  <div className="flex items-center gap-2">
                    {findParams.page > 0 && (
                      <a href={`${BASE}?${findParamsToQuery({ ...findParams, page: findParams.page - 1 })}#results`}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                        ← Prev<PriceTag price={findPrice} />
                      </a>
                    )}
                    {(findParams.page + 1) * findParams.limit < Math.min(findTotal, 10_000) && (
                      <a href={`${BASE}?${findParamsToQuery({ ...findParams, page: findParams.page + 1 })}#results`}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                        Next →<PriceTag price={findPrice} />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {findHistory.length > 0 && (
            <HistoryCard>
              {findHistory.map((entry) => {
                const p = entryFindParams(entry);
                const lbl = findLabel(p, catalog);
                return (
                  <HistoryRow key={entry.id}
                    href={`${BASE}?mode=find&find_history_id=${entry.id}#results`}
                    active={entry.id === findHistoryId}
                    title={lbl}
                    sub={[
                      `${entry.count} shown${entry.totalCount !== undefined ? ` / ${fmt(entry.totalCount)} total` : ''}`,
                      findFilterSummary(p),
                      entry.cost !== undefined ? `$${entry.cost.toFixed(4)}` : '',
                    ].filter(Boolean).join(' · ')}
                    ts={entry.ts}
                    del={<DeleteHistoryButton table="domain_find_searches" id={entry.id} path={BASE} label={lbl} />}
                  />
                );
              })}
            </HistoryCard>
          )}
        </>
      )}

      {/* ================= Adoption Trend ================= */}
      {mode === 'stats' && (
        <>
          <SearchForm className={formCard} btnLabel={<>Show trend<PriceTag price={statsPrice} /></>} btnClassName={btn}>
            <input type="hidden" name="mode" value="stats" />
            <p className="text-[11px] text-slate-400">
              How many sites DataForSEO detects using a technology, one point per month (data starts {STATS_MIN_DATE}), with the split by country.
              Useful to check whether a platform is gaining or losing ground in a market.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls} htmlFor="stats-tech">Technology</label>
                <TechNameInput id="stats-tech" name="technology" names={techNames} defaultValue={statsTech} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="stats-from">From</label>
                <input id="stats-from" type="date" name="date_from" min={STATS_MIN_DATE} max={today} defaultValue={statsFrom} className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="stats-to">To</label>
                <input id="stats-to" type="date" name="date_to" min={STATS_MIN_DATE} max={today} defaultValue={statsTo} className={inputCls} />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">Estimated cost: ${PRICE_STATS_TASK.toFixed(3)} + ${PRICE_STATS_ITEM.toFixed(4)} per monthly data point (≈ ${statsPrice.toFixed(3)} for this range).</p>
          </SearchForm>

          {statsError && (
            <Notice tone="error">
              {statsError}
              {statsSuggestions.length > 0 && (
                <span className="block mt-1.5">Did you mean:{' '}
                  {statsSuggestions.map((s, i) => (
                    <span key={s}>{i > 0 && ', '}<a className="font-bold underline" href={`${BASE}?mode=stats&technology=${encodeURIComponent(s)}&date_from=${statsFrom}&date_to=${statsTo}&prefill=1`}>{s}</a></span>
                  ))}
                </span>
              )}
            </Notice>
          )}
          {prefill && statsTech && !statsError && <Notice>Form prefilled, nothing has been charged. Click Show trend to run it.</Notice>}

          {statsResult && (() => {
            const first = statsItems[0];
            const last = statsItems[statsItems.length - 1];
            const delta = first?.domains_count && last ? ((last.domains_count ?? 0) - first.domains_count) / first.domains_count : null;
            const topCountries = Object.entries(last?.countries ?? {}).sort(([, a], [, b]) => b - a).slice(0, 15);
            const reopenQs = statsHistoryId ? `stats_history_id=${statsHistoryId}` : `technology=${encodeURIComponent(statsTech)}&date_from=${statsFrom}&date_to=${statsTo}`;
            const techName = statsResult.technology ?? statsTech;
            return (
              <div id="results" className="space-y-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold">{techName}</span>
                  <span className="text-[11px] text-slate-400">{statsFrom} → {statsTo}</span>
                  {isStatsFromHistory && <HistoryBadge />}
                  {last && <span className="text-sm"><span className="font-mono font-bold text-slate-900 dark:text-white">{fmt(last.domains_count)}</span> <span className="text-slate-400 text-xs">domains on {last.date.slice(0, 10)}</span></span>}
                  {delta !== null && <span className={`text-xs font-black ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{pct(delta)} over the period</span>}
                  <div className="flex items-center gap-2 ml-auto">
                    {statsCost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${statsCost.toFixed(4)}</span>}
                    <a href={findByTechHref(techName)} className="text-[11px] font-bold text-blue-600 hover:text-blue-800">List these domains →</a>
                    {statsItems.length > 0 && (
                      <ExportCSVButton
                        data={statsItems.map((p) => ({ date: p.date.slice(0, 10), domains: p.domains_count ?? '', ...(statsCountry ? { country: p.countries?.[statsCountry] ?? '' } : {}) }))}
                        columns={[{ key: 'date', label: 'Date' }, { key: 'domains', label: 'Domains' }, ...(statsCountry ? [{ key: 'country', label: `Domains in ${statsCountry}` }] : [])]}
                        filename={`tech-adoption-${techName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`}
                      />
                    )}
                  </div>
                </div>

                {statsItems.length === 0 ? (
                  <div className={`${card} px-6 py-12 text-center text-sm text-slate-400`}>No data points for this period.</div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                    <div className={`${card} p-5 lg:col-span-2`}>
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Domains using it {statsCountry ? `in ${COUNTRY_NAMES.get(statsCountry) ?? statsCountry}` : 'worldwide'}</h2>
                        {statsCountry && <a href={`${BASE}?mode=stats&${reopenQs}#results`} className="text-[11px] font-bold text-blue-600">Show worldwide</a>}
                      </div>
                      <AdoptionChart points={statsItems} country={statsCountry || undefined} />
                    </div>
                    <div className={`${card} overflow-hidden`}>
                      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-700">
                        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Top countries (latest month)</h2>
                        <p className="text-[11px] text-slate-400 mt-0.5">Click a country to chart it: free, it uses the data already loaded.</p>
                      </div>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                          {topCountries.map(([iso, count]) => {
                            const firstCount = first?.countries?.[iso];
                            const d = firstCount ? (count - firstCount) / firstCount : null;
                            return (
                              <tr key={iso} className={iso === statsCountry ? 'bg-blue-50 dark:bg-blue-900/20' : ''}>
                                <td className="px-5 py-2">
                                  <a href={`${BASE}?mode=stats&${reopenQs}&stats_country=${iso}#results`} className="text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-blue-600">
                                    {iso === 'WW' ? 'Unassigned (WW)' : COUNTRY_NAMES.get(iso) ?? iso}
                                  </a>
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">{fmt(count)}</td>
                                <td className={`px-5 py-2 text-right text-[11px] font-bold tabular-nums ${d === null ? 'text-slate-300' : d >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {d === null ? '—' : pct(d)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {statsHistory.length > 0 && (
            <HistoryCard>
              {statsHistory.map((entry) => (
                <HistoryRow key={entry.id}
                  href={`${BASE}?mode=stats&stats_history_id=${entry.id}#results`}
                  active={entry.id === statsHistoryId}
                  title={entry.technology}
                  sub={[`${entry.dateFrom} → ${entry.dateTo}`, entry.cost !== undefined ? `$${entry.cost.toFixed(4)}` : ''].filter(Boolean).join(' · ')}
                  ts={entry.ts}
                  del={<DeleteHistoryButton table="tech_stats_searches" id={entry.id} path={BASE} label={entry.technology} />}
                />
              ))}
            </HistoryCard>
          )}
        </>
      )}
    </div>
  );
}

export default withProjectScope(TechnologiesPage);
