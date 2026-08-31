import {
  getCredentials,
  getDomainTechHistory,
  saveDomainTechSearch,
  getDomainTechResult,
  getDomainFindHistory,
  saveDomainFindSearch,
  getDomainFindResults,
  type DomainTechEntry,
  type DomainFindEntry,
} from '@/lib/db';
import SearchForm from '@/components/SearchForm';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import TechFindTable from './TechFindTable';

export const dynamic = 'force-dynamic';

// ---- Types ----

// technologies: { category: { subcategory: ["TechName", ...] } }
// e.g. { content: { cms: ["WordPress"] }, servers: { cdn: ["Cloudflare"] } }
type TechCategories = Record<string, Record<string, string[]>>;

interface DomainTechResult {
  domain?: string;
  title?: string;
  description?: string;
  domain_rank?: number;
  last_visited?: string;
  country_iso_code?: string;
  phone_numbers?: string[];
  emails?: string[];
  social_graph_urls?: string[];
  technologies?: TechCategories;
}

interface FindDomainItem {
  domain?: string;
  title?: string;
  description?: string;
  domain_rank?: number;
  country_iso_code?: string;
  last_visited?: string;
  technologies?: TechCategories;
}

interface SearchParams {
  mode?: string;
  target?: string;
  keyword?: string;
  technology?: string;
  limit?: string;
  history_id?: string;
  find_history_id?: string;
}

// ---- Prices ----
const PRICE_DOMAIN = 0.001;
const PRICE_FIND = 0.01;

// ---- API ----

function cleanTarget(t: string) {
  return t.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

async function fetchDomainTech(
  target: string,
  login: string,
  pass: string,
): Promise<{ result: DomainTechResult | null; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<DomainTechResult>(
    'domain_analytics/technologies/domain_technologies/live', { target }, { login, pass }, 20_000,
  );
  if (error) return { result: null, error };
  return { result: result ?? null, cost };
}

async function fetchDomainsByTech(opts: {
  keyword?: string;
  technology?: string;
  limit: number;
  login: string;
  pass: string;
}): Promise<{ items: FindDomainItem[]; total?: number; cost?: number; error?: string }> {
  const body: Record<string, unknown> = { limit: opts.limit, order_by: ['domain_rank,desc'] };
  if (opts.technology) body.technologies = [opts.technology];
  if (opts.keyword) body.keywords = [opts.keyword];

  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: FindDomainItem[] }>(
    'domain_analytics/technologies/domains_by_technology/live', body, { login: opts.login, pass: opts.pass }, 20_000,
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], total: result?.total_count, cost };
}

// ---- UI helpers ----

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-GB');
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const CATEGORY_COLORS: Record<string, string> = {
  'content': 'bg-blue-50 border-blue-100 text-blue-700',
  'analytics': 'bg-violet-50 border-violet-100 text-violet-700',
  'marketing': 'bg-pink-50 border-pink-100 text-pink-700',
  'sales': 'bg-emerald-50 border-emerald-100 text-emerald-700',
  'add_ons': 'bg-amber-50 border-amber-100 text-amber-700',
  'security': 'bg-red-50 border-red-100 text-red-700',
  'web_development': 'bg-indigo-50 border-indigo-100 text-indigo-700',
  'servers': 'bg-teal-50 border-teal-100 text-teal-700',
};

function categoryColor(cat: string) {
  for (const [key, val] of Object.entries(CATEGORY_COLORS)) {
    if (cat.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return 'bg-slate-50 border-slate-200 text-slate-600';
}

function formatLabel(slug: string) {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function PriceTag({ price }: { price: number }) {
  return <span className="font-mono text-[10px] opacity-50 ml-1.5">~${price.toFixed(3)}</span>;
}

function entryLabel(e: DomainFindEntry) {
  const parts = [];
  if (e.technology) parts.push(e.technology);
  if (e.keyword) parts.push(`"${e.keyword}"`);
  return parts.join(' + ') || '—';
}

// ---- Page ----

export default async function TechnologiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;

  const mode = params.mode === 'find' ? 'find' : 'domain';
  const historyId = params.history_id;
  const findHistoryId = params.find_history_id;

  // --- Domain mode ---
  const target = cleanTarget(params.target?.trim() ?? '');
  let domainResult: DomainTechResult | null = null;
  let domainCost: number | undefined;
  let domainError: string | null = null;
  let isDomainFromHistory = false;
  let activeDomainEntry: DomainTechEntry | null = null;

  // --- Find mode ---
  const keyword = params.keyword?.trim() ?? '';
  const technology = params.technology?.trim() ?? '';
  const limit = Math.min(parseInt(params.limit ?? '20', 10) || 20, 100);
  let findItems: FindDomainItem[] = [];
  let findTotal: number | undefined;
  let findCost: number | undefined;
  let findError: string | null = null;
  let isFindFromHistory = false;
  let activeFindEntry: DomainFindEntry | null = null;

  if (mode === 'domain') {
    if (historyId) {
      domainResult = getDomainTechResult<DomainTechResult>(historyId);
      if (domainResult) {
        isDomainFromHistory = true;
        const history = getDomainTechHistory();
        activeDomainEntry = history.find((e) => e.id === historyId) ?? null;
      } else {
        domainError = "This search is no longer available.";
      }
    } else if (target) {
      const dedupeId = stableSearchId(['domain-tech', target]);
      const cachedResult = getDomainTechResult<DomainTechResult>(dedupeId);
      if (cachedResult) {
        domainResult = cachedResult;
        domainCost = getDomainTechHistory().find((e) => e.id === dedupeId)?.cost;
      } else if (!creds) {
        domainError = 'DataForSEO credentials missing. Configure them in Settings.';
      } else {
        const res = await fetchDomainTech(target, creds.login, creds.pass);
        if (res.error) {
          domainError = res.error;
        } else if (res.result) {
          domainResult = res.result;
          domainCost = res.cost;
          const entry: DomainTechEntry = { id: dedupeId, ts: Date.now(), target, cost: domainCost };
          saveDomainTechSearch(entry, domainResult);
        } else {
          domainError = 'No data found for this domain.';
        }
      }
    }
  }

  if (mode === 'find') {
    if (findHistoryId) {
      findItems = getDomainFindResults<FindDomainItem>(findHistoryId) ?? [];
      if (findItems.length > 0) {
        isFindFromHistory = true;
        const history = getDomainFindHistory();
        activeFindEntry = history.find((e) => e.id === findHistoryId) ?? null;
        findTotal = activeFindEntry?.totalCount;
      } else {
        findError = "This search is no longer available.";
      }
    } else if (keyword || technology) {
      const dedupeId = stableSearchId(['domain-find', keyword, technology, limit]);
      const cachedItems = getDomainFindResults<FindDomainItem>(dedupeId);
      if (cachedItems) {
        findItems = cachedItems;
        const cachedEntry = getDomainFindHistory().find((e) => e.id === dedupeId);
        findTotal = cachedEntry?.totalCount;
        findCost = cachedEntry?.cost;
      } else if (!creds) {
        findError = 'DataForSEO credentials missing. Configure them in Settings.';
      } else {
        const res = await fetchDomainsByTech({ keyword: keyword || undefined, technology: technology || undefined, limit, login: creds.login, pass: creds.pass });
        if (res.error) {
          findError = res.error;
        } else {
          findItems = res.items;
          findTotal = res.total;
          findCost = res.cost;
          if (findItems.length > 0) {
            const entry: DomainFindEntry = { id: dedupeId, ts: Date.now(), keyword: keyword || undefined, technology: technology || undefined, count: findItems.length, totalCount: findTotal, cost: findCost };
            saveDomainFindSearch(entry, findItems);
          }
        }
      }
    }
  }

  const domainHistory = getDomainTechHistory();
  const findHistory = getDomainFindHistory();
  const displayTarget = activeDomainEntry?.target ?? target;

  const techCategories = domainResult?.technologies
    ? Object.entries(domainResult.technologies).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const totalTechs = techCategories.reduce(
    (s, [, subcats]) => s + new Set(Object.values(subcats).flat()).size,
    0,
  );

  const activeTech = activeFindEntry?.technology ?? technology;
  const activeKw = activeFindEntry?.keyword ?? keyword;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Technologies</h1>
        <p className="text-sm text-slate-400 mt-1">Detect tech stacks or find domains by technology and keyword.</p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {([
          { label: 'Analyze Domain', value: 'domain' },
          { label: 'Find Domains', value: 'find' },
        ] as const).map((tab) => (
          <a
            key={tab.value}
            href={`/dashboard/domain-analytics/technologies?mode=${tab.value}`}
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

      {/* Domain mode form */}
      {mode === 'domain' && (
        <SearchForm
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-4"
          btnLabel={<>Analyze<PriceTag price={PRICE_DOMAIN} /></>}
          btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors"
        >
          <input type="hidden" name="mode" value="domain" />
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Domain</label>
            <input
              type="text" name="target"
              defaultValue={displayTarget}
              placeholder="e.g. example.com"
              required
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white dark:bg-slate-900 transition-all"
            />
          </div>
        </SearchForm>
      )}

      {/* Find Domains form */}
      {mode === 'find' && (
        <SearchForm
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-4"
          btnLabel={<>Search<PriceTag price={PRICE_FIND} /></>}
          btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors"
        >
          <input type="hidden" name="mode" value="find" />
          <p className="text-xs text-slate-400">Fill one or both fields to narrow the search.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Technology</label>
              <input
                type="text" name="technology"
                defaultValue={activeTech}
                placeholder="e.g. WordPress, Shopify, React…"
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Keyword</label>
              <input
                type="text" name="keyword"
                defaultValue={activeKw}
                placeholder="e.g. plumbing, dentist…"
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 transition-all"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <div className="w-32">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Results</label>
              <select name="limit" defaultValue={String(limit)}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900">
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>
        </SearchForm>
      )}

      {/* Errors */}
      {mode === 'domain' && domainError && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{domainError}</div>
      )}
      {mode === 'find' && findError && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{findError}</div>
      )}

      {/* ---- Domain results ---- */}
      {mode === 'domain' && (historyId || target) && !domainError && domainResult && (
        <>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Domain</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{domainResult.domain ?? displayTarget}</span>
              {isDomainFromHistory && (
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>
              )}
            </div>
            {domainResult.domain_rank !== undefined && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">DR</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{fmt(domainResult.domain_rank)}</span>
              </div>
            )}
            {domainResult.country_iso_code && (
              <span className="text-sm font-bold text-slate-500 uppercase">{domainResult.country_iso_code}</span>
            )}
            {totalTechs > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Technologies</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{totalTechs}</span>
              </div>
            )}
            {domainCost !== undefined && (
              <span className="text-[10px] font-mono text-slate-400 ml-auto">cost: ${domainCost.toFixed(4)}</span>
            )}
          </div>

          {/* Domain meta */}
          {(domainResult.title || domainResult.emails?.length || domainResult.phone_numbers?.length || domainResult.social_graph_urls?.length) && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 space-y-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Domain Info</h2>
              {domainResult.title && <p className="text-sm font-bold text-slate-900 dark:text-white">{domainResult.title}</p>}
              {domainResult.description && <p className="text-sm text-slate-500">{domainResult.description}</p>}
              <div className="flex flex-wrap gap-4 pt-1">
                {domainResult.emails && domainResult.emails.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Emails</p>
                    <div className="flex flex-wrap gap-1.5">
                      {domainResult.emails.map((e, i) => (
                        <span key={i} className="text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md">{e}</span>
                      ))}
                    </div>
                  </div>
                )}
                {domainResult.phone_numbers && domainResult.phone_numbers.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Phone</p>
                    <div className="flex flex-wrap gap-1.5">
                      {domainResult.phone_numbers.map((p, i) => (
                        <span key={i} className="text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
                {domainResult.social_graph_urls && domainResult.social_graph_urls.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Social</p>
                    <div className="flex flex-wrap gap-1.5">
                      {domainResult.social_graph_urls.map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded-md truncate max-w-[200px]">{u}</a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tech stack */}
          {techCategories.length > 0 ? (
            <div className="space-y-4">
              {techCategories.map(([category, subcats]) => {
                const subEntries = Object.entries(subcats).sort(([a], [b]) => a.localeCompare(b));
                const colorClass = categoryColor(category);
                const uniqueCount = new Set(subEntries.flatMap(([, names]) => names)).size;
                return (
                  <div id="results" key={category} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                      <h2 className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">{formatLabel(category)}</h2>
                      <span className="text-[10px] font-black text-slate-400">{uniqueCount}</span>
                    </div>
                    <div className="p-4 space-y-3">
                      {subEntries.map(([subcat, names]) => (
                        <div key={subcat}>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{formatLabel(subcat)}</p>
                          <div className="flex flex-wrap gap-2">
                            {names.map((name) => (
                              <span key={name} className={`inline-flex items-center px-3 py-1.5 rounded-xl border text-xs font-bold ${colorClass}`}>
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm px-6 py-12 text-center text-sm text-slate-400">
              No technologies detected for this domain.
            </div>
          )}

          {/* Domain history */}
          {domainHistory.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
              </div>
              <div className="divide-y divide-slate-50 dark:divide-slate-700">
                {domainHistory.map((entry) => {
                  const isActive = entry.id === historyId;
                  return (
                    <a key={entry.id} href={`/dashboard/domain-analytics/technologies?mode=domain&history_id=${entry.id}#results`}
                      className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold font-mono truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.target}</p>
                        {entry.cost !== undefined && <p className="text-[11px] text-slate-400 mt-0.5">${entry.cost.toFixed(4)}</p>}
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-400">{fmtDate(entry.ts)}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- Find results ---- */}
      {mode === 'find' && (findHistoryId || keyword || technology) && !findError && (
        <>
          <div className="flex items-center gap-4 flex-wrap">
            {activeTech && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Technology</span>
                <span className="px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold">{activeTech}</span>
              </div>
            )}
            {activeKw && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Keyword</span>
                <span className="px-2 py-0.5 rounded-lg bg-violet-50 border border-violet-100 text-violet-700 text-xs font-bold">&ldquo;{activeKw}&rdquo;</span>
              </div>
            )}
            {isFindFromHistory && (
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>
            )}
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
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm px-6 py-12 text-center text-sm text-slate-400">
              No domains found.
            </div>
          ) : (
            <TechFindTable items={findItems} />
          )}

          {/* Find history */}
          {findHistory.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
              </div>
              <div className="divide-y divide-slate-50 dark:divide-slate-700">
                {findHistory.map((entry) => {
                  const isActive = entry.id === findHistoryId;
                  return (
                    <a key={entry.id} href={`/dashboard/domain-analytics/technologies?mode=find&find_history_id=${entry.id}#results`}
                      className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entryLabel(entry)}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {entry.count} shown
                          {entry.totalCount !== undefined ? ` / ${fmt(entry.totalCount)} total` : ''}
                          {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-400">{fmtDate(entry.ts)}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
