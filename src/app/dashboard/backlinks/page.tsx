import { METRIC_HINTS } from '@/lib/metric-glossary';
import { withProjectScope } from '@/lib/db';
import {
  getCredentials,
  getBacklinksHistory,
  getBacklinksEntry,
  saveBacklinksSearch,
  getBacklinksResult,
  getBacklinksLinks,
  type BacklinksSearchEntry,
} from '@/lib/db';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import BacklinksTable from './BacklinksTable';
import {
  buildLinksBody, buildSummaryBody, describeQuery, hasAdvancedFilters, parseQuery, queryKey, queryToParams,
  rescaleLegacyLink, slimBacklink, ITEM_TYPES, LIMITS, MAX_OFFSET, ORDER_OPTIONS, PLATFORMS,
  type BacklinkItem, type BacklinksQuery, type RawParams,
} from './query';
import DeleteHistoryButton from '@/components/DeleteHistoryButton';

// ---- Types ----

interface BacklinksSummary {
  target?: string;
  rank?: number;
  backlinks?: number;
  backlinks_spam_score?: number;
  new_backlinks?: number;
  lost_backlinks?: number;
  referring_domains?: number;
  referring_domains_nofollow?: number;
  new_referring_domains?: number;
  lost_referring_domains?: number;
  referring_ips?: number;
  referring_subnets?: number;
  referring_pages?: number;
  referring_pages_nofollow?: number;
  broken_backlinks?: number;
  broken_pages?: number;
  /** Older saved summaries only; the live API calls it backlinks_spam_score. */
  spam_score?: number;
  referring_links_types?: Record<string, number>;
  referring_links_tld?: Record<string, number>;
  referring_links_attributes?: Record<string, number>;
  referring_links_platform_types?: Record<string, number>;
  referring_links_semantic_locations?: Record<string, number>;
  referring_links_countries?: Record<string, number>;
}

// ---- API ----

async function fetchSummary(q: BacklinksQuery, login: string, pass: string) {
  return callDataForSeoFirst<BacklinksSummary>('backlinks/summary/live', buildSummaryBody(q), { login, pass });
}

async function fetchLinks(body: Record<string, unknown>, login: string, pass: string): Promise<{ items: BacklinkItem[]; total: number; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: Record<string, unknown>[] }>(
    'backlinks/backlinks/live', body, { login, pass },
  );
  if (error) return { items: [], total: 0, error };
  return { items: (result?.items ?? []).map(slimBacklink), total: result?.total_count ?? 0, cost };
}

// ---- UI helpers ----

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-GB');
}

function SpamBadge({ score }: { score?: number }) {
  if (score === undefined) return <span className="text-slate-300">—</span>;
  const color = score >= 60 ? 'text-red-600 bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-900'
    : score >= 30 ? 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-900'
    : 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-900';
  return <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${color}`}>{score} / 100</span>;
}

function Delta({ value, invert = false }: { value?: number; invert?: boolean }) {
  if (!value) return null;
  const positive = invert ? value < 0 : value > 0;
  return (
    <span className={`text-[10px] font-black ml-1 ${positive ? 'text-emerald-500' : 'text-red-500'}`}>
      {value > 0 ? '+' : ''}{fmt(value)}
    </span>
  );
}

function StatCard({ label, value, new: newVal, lost, hint, info, href, hrefLabel }: { label: string; value?: number; new?: number; lost?: number; hint?: string; info?: string; href?: string; hrefLabel?: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400"><span title={info} className={info ? 'underline decoration-dotted decoration-slate-300 dark:decoration-slate-600 underline-offset-[3px] cursor-help' : undefined}>{label}</span></p>
      <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{fmt(value)}</p>
      {(newVal !== undefined || lost !== undefined) && (
        <p className="text-[11px] mt-0.5 text-slate-400">
          {newVal !== undefined && <><Delta value={newVal} /> new</>}
          {newVal !== undefined && lost !== undefined && ' · '}
          {lost !== undefined && <><Delta value={-lost} invert /> lost</>}
        </p>
      )}
      {hint && <p className="text-[11px] mt-0.5 text-slate-400">{hint}</p>}
      {href && (
        <a href={href} className="inline-block text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline mt-0.5">{hrefLabel ?? 'View'} →</a>
      )}
    </div>
  );
}

/** One summary breakdown. Bars with an `href` re-run the list with that filter (a paid request). */
function Breakdown({ title, entries, total, color, label, hrefFor }: {
  title: string; entries: [string, number][]; total: number; color: string;
  label?: (k: string) => string; hrefFor?: (k: string) => string | undefined;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
      <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">{title}</h2>
      <div className="space-y-2">
        {entries.map(([key, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const href = hrefFor?.(key);
          const body = (
            <>
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className={`text-xs font-medium truncate ${href ? 'text-slate-700 dark:text-slate-200 group-hover:text-blue-600' : 'text-slate-600 dark:text-slate-300'}`}>{label ? label(key) : key}</span>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 shrink-0">{fmt(count)} <span className="text-slate-300 dark:text-slate-600">({pct}%)</span></span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </>
          );
          return href
            ? <a key={key} href={href} className="block group" title="Load the backlinks matching this value">{body}</a>
            : <div key={key}>{body}</div>;
        })}
      </div>
    </div>
  );
}

function topEntries(obj: Record<string, number> | undefined, n = 8): [string, number][] {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj).filter(([k, v]) => k && v > 0).sort(([, a], [, b]) => b - a).slice(0, n);
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const inputCls = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-500 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all';
const labelCls = 'block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5';
const hintCls = 'text-[10px] text-slate-400 mt-1';

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children}
      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  );
}

// ---- Page ----

async function BacklinksPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = typeof params.history_id === 'string' ? params.history_id : undefined;

  let summary: BacklinksSummary | null = null;
  let links: BacklinkItem[] = [];
  let linksTotal = 0;
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: BacklinksSearchEntry | null = null;
  let q = parseQuery(params);

  if (historyId) {
    activeEntry = getBacklinksEntry(historyId);
    const savedSummary = getBacklinksResult<BacklinksSummary>(historyId);
    if (activeEntry && savedSummary) {
      isFromHistory = true;
      summary = savedSummary;
      links = getBacklinksLinks<BacklinkItem>(historyId) ?? [];
      linksTotal = activeEntry.linksTotal ?? links.length;
      cost = activeEntry.cost;
      if (activeEntry.params !== undefined) {
        q = parseQuery(Object.fromEntries(new URLSearchParams(activeEntry.params)));
      } else {
        // Saved before filters and rank_scale existed: plain search, ranks on the 0–1000 scale.
        // The limit wasn't recorded either: infer it from the stored list so "Next" continues the same page size.
        const limit = LIMITS.find((l) => l >= links.length) ?? 1000;
        q = parseQuery({ target: activeEntry.target, limit: String(limit) });
        links = links.map(rescaleLegacyLink);
        if (summary.rank !== undefined) summary = { ...summary, rank: Math.round(summary.rank / 10) };
      }
    } else {
      error = 'This search is no longer available.';
    }
  } else if (q.target) {
    const key = queryKey(q);
    const dedupeId = stableSearchId(['backlinks-v2', key]);
    const cachedSummary = getBacklinksResult<BacklinksSummary>(dedupeId);
    const { body, error: bodyError } = buildLinksBody(q);

    if (cachedSummary) {
      summary = cachedSummary;
      links = getBacklinksLinks<BacklinkItem>(dedupeId) ?? [];
      const cachedEntry = getBacklinksEntry(dedupeId);
      linksTotal = cachedEntry?.linksTotal ?? links.length;
      cost = cachedEntry?.cost;
    } else if (bodyError || !body) {
      error = bodyError ?? 'Invalid request.';
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const [summaryRes, linksRes] = await Promise.all([
        fetchSummary(q, creds.login, creds.pass),
        fetchLinks(body, creds.login, creds.pass),
      ]);

      if (summaryRes.error || linksRes.error) {
        error = summaryRes.error ?? linksRes.error ?? 'Unknown error.';
      } else {
        summary = summaryRes.result ?? null;
        links = linksRes.items;
        linksTotal = linksRes.total;
        cost = (summaryRes.cost ?? 0) + (linksRes.cost ?? 0);
        // Saved even with zero links: "nothing matches these filters" is a paid-for answer.
        saveBacklinksSearch({ id: dedupeId, ts: Date.now(), target: q.target, cost, linksTotal, params: key }, summary ?? {}, links, linksTotal);
      }
    }
  }

  const history = getBacklinksHistory();
  const hasQuery = !!historyId || !!q.target;
  const target = q.target;
  const chips = describeQuery(q);
  const advancedOpen = hasAdvancedFilters(q);
  const groupedByDomain = q.mode === 'one_per_domain';

  // Drill-down: same search with one more API filter, back to the first page.
  const drill = (o: Partial<BacklinksQuery>) => `/dashboard/backlinks?${queryToParams(q, { offset: 0, ...o }).toString()}#results`;
  const pageHref = (offset: number) => `/dashboard/backlinks?${queryToParams(q, { offset }).toString()}#results`;
  const nextOffset = q.offset + Math.max(links.length, 1);
  const canNext = linksTotal > nextOffset && nextOffset <= MAX_OFFSET;
  const canPrev = q.offset > 0;

  const spam = summary?.backlinks_spam_score ?? summary?.spam_score;
  const linkTotalForTypes = summary?.backlinks ?? 0;
  const tldEntries = topEntries(summary?.referring_links_tld);
  const countryEntries = topEntries(summary?.referring_links_countries).filter(([k]) => k !== 'WW');
  const platformEntries = topEntries(summary?.referring_links_platform_types).filter(([k]) => k !== 'unknown');
  const semanticEntries = topEntries(summary?.referring_links_semantic_locations);
  const attributeEntries = topEntries(summary?.referring_links_attributes);
  const sum = (e: [string, number][]) => e.reduce((s, [, v]) => s + v, 0);
  const fileSlug = `${target || 'backlinks'}${q.mode !== 'as_is' ? `-${q.mode}` : ''}${q.offset ? `-from-${q.offset}` : ''}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Backlinks</h1>
        <p className="text-sm text-slate-400 mt-1">Inbound link profile of a domain via DataForSEO.</p>
      </div>

      {/* Form */}
      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Analyze" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="sm:col-span-2 lg:col-span-4">
            <Field id="bl-target" label="Target domain">
              <input id="bl-target" type="text" name="target" defaultValue={target} placeholder="e.g. example.com" required className={`${inputCls} font-mono`} />
            </Field>
          </div>
          <Field id="bl-mode" label="Grouping" hint="One per domain = clearest view, with the link count per domain.">
            <select id="bl-mode" name="mode" defaultValue={q.mode} className={inputCls}>
              <option value="as_is">All links</option>
              <option value="one_per_domain">One per domain</option>
              <option value="one_per_anchor">One per anchor</option>
            </select>
          </Field>
          <Field id="bl-status" label="Status">
            <select id="bl-status" name="status" defaultValue={q.status} className={inputCls}>
              <option value="live">Live links</option>
              <option value="lost">Lost links</option>
              <option value="all">Live + lost</option>
            </select>
          </Field>
          <Field id="bl-order" label="Sort by">
            <select id="bl-order" name="order_by" defaultValue={q.orderBy} className={inputCls}>
              {ORDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field id="bl-limit" label="Number of links">
            <select id="bl-limit" name="limit" defaultValue={String(q.limit)} className={inputCls}>
              {LIMITS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
        </div>

        <details open={advancedOpen} className="group rounded-xl border border-slate-100 dark:border-slate-800">
          <summary className="cursor-pointer select-none px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 list-none flex items-center justify-between">
            <span>Advanced filters <span className="normal-case tracking-normal font-medium text-slate-400">· applied by DataForSEO across all links, max 8</span></span>
            <span className="text-slate-300 group-open:rotate-90 transition-transform">›</span>
          </summary>
          <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field id="bl-dofollow" label="Follow">
              <select id="bl-dofollow" name="dofollow" defaultValue={q.dofollow === null ? '' : String(q.dofollow)} className={inputCls}>
                <option value="">Dofollow + nofollow</option>
                <option value="true">Dofollow only</option>
                <option value="false">Nofollow only</option>
              </select>
            </Field>
            <Field id="bl-type" label="Link type">
              <select id="bl-type" name="item_type" defaultValue={q.itemType} className={inputCls}>
                <option value="">All types</option>
                {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field id="bl-min-dr" label="Min. domain rank" hint="0–100">
              <input id="bl-min-dr" type="number" name="min_dr" min={0} max={100} defaultValue={q.minDr ?? ''} placeholder="e.g. 20" className={inputCls} />
            </Field>
            <Field id="bl-min-pr" label="Min. page rank" hint="0–100">
              <input id="bl-min-pr" type="number" name="min_pr" min={0} max={100} defaultValue={q.minPageRank ?? ''} placeholder="e.g. 10" className={inputCls} />
            </Field>
            <Field id="bl-max-spam" label="Max. spam score" hint="0–100; 30 removes most junk">
              <input id="bl-max-spam" type="number" name="max_spam" min={0} max={100} defaultValue={q.maxSpam ?? ''} placeholder="e.g. 30" className={inputCls} />
            </Field>
            <Field id="bl-anchor" label="Anchor contains">
              <input id="bl-anchor" type="text" name="anchor" defaultValue={q.anchor} placeholder="e.g. brand name" className={inputCls} />
            </Field>
            <Field id="bl-domain" label="Source domain contains">
              <input id="bl-domain" type="text" name="domain_from" defaultValue={q.domainFrom} placeholder="e.g. .gouv or blog" className={`${inputCls} font-mono`} />
            </Field>
            <Field id="bl-url-to" label="Target URL contains" hint="Links to one page or section">
              <input id="bl-url-to" type="text" name="url_to" defaultValue={q.urlTo} placeholder="e.g. /blog/" className={`${inputCls} font-mono`} />
            </Field>
            <Field id="bl-country" label="Source country" hint="ISO code">
              <input id="bl-country" type="text" name="country" maxLength={2} defaultValue={q.country} placeholder="e.g. FR" className={`${inputCls} uppercase placeholder:normal-case`} />
            </Field>
            <Field id="bl-language" label="Source page language" hint="ISO 639-1">
              <input id="bl-language" type="text" name="language" maxLength={2} defaultValue={q.language} placeholder="e.g. fr" className={`${inputCls} lowercase placeholder:normal-case`} />
            </Field>
            <Field id="bl-platform" label="Source platform">
              <select id="bl-platform" name="platform" defaultValue={q.platform} className={inputCls}>
                <option value="">Any</option>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field id="bl-since" label="First seen after">
              <input id="bl-since" type="date" name="since" defaultValue={q.since} className={inputCls} />
            </Field>
            <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-x-6 gap-y-2 pt-1">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" name="new" value="1" defaultChecked={q.newOnly} className="rounded border-slate-300" /> New links only
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" name="subdomains" value="0" defaultChecked={!q.includeSubdomains} className="rounded border-slate-300" /> Exclude subdomains of the target
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" name="internal" value="1" defaultChecked={!q.excludeInternal} className="rounded border-slate-300" /> Include internal links between subdomains
              </label>
            </div>
          </div>
        </details>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {hasQuery && !error && (summary || links.length > 0) && (
        <>
          {/* Header */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Domain</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{target}</span>
              {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
            </div>
            {summary?.rank !== undefined && (
              <div className="flex items-center gap-2" title="Domain rank, 0–100">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">DR</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{summary.rank}</span>
              </div>
            )}
            {spam !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Spam</span>
                <SpamBadge score={spam} />
              </div>
            )}
            {cost !== undefined && <span className="text-[10px] font-mono text-slate-400 ml-auto">cost: ${cost.toFixed(4)}</span>}
          </div>

          {/* Summary stats */}
          {summary && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Backlinks" info={METRIC_HINTS.backlinks} value={summary.backlinks} new={summary.new_backlinks} lost={summary.lost_backlinks}
                  href={summary.lost_backlinks ? drill({ status: 'lost', orderBy: 'domain_from_rank,desc' }) : undefined} hrefLabel="See lost links" />
                <StatCard label="Referring domains" info={METRIC_HINTS.refDomains} value={summary.referring_domains} new={summary.new_referring_domains} lost={summary.lost_referring_domains}
                  href={drill({ mode: 'one_per_domain' })} hrefLabel="One link per domain" />
                <StatCard label="Referring IPs" info={METRIC_HINTS.refIps} value={summary.referring_ips} hint={summary.referring_subnets !== undefined ? `${fmt(summary.referring_subnets)} subnets` : undefined} />
                <StatCard label="Referring pages" info="Unique pages that contain at least one link to the target." value={summary.referring_pages}
                  hint={summary.referring_pages_nofollow !== undefined ? `${fmt(summary.referring_pages_nofollow)} nofollow` : undefined} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Broken backlinks" info={METRIC_HINTS.brokenBacklinks} value={summary.broken_backlinks}
                  href={summary.broken_backlinks ? `/dashboard/backlinks/broken?target=${encodeURIComponent(target)}` : undefined} hrefLabel="See broken links" />
                <StatCard label="Broken pages" info="Pages of the target that answer 4xx/5xx and still receive links." value={summary.broken_pages} />
                <StatCard label="New backlinks" info="Links DataForSEO marks as new, recently found by its crawler." value={summary.new_backlinks}
                  href={summary.new_backlinks ? drill({ newOnly: true, orderBy: 'first_seen,desc' }) : undefined} hrefLabel="See new links" />
              </div>

              <p className="text-[11px] text-slate-400 -mb-2">Click a bar to load the backlinks matching that value.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <Breakdown title="Link types" entries={topEntries(summary.referring_links_types)} total={linkTotalForTypes} color="bg-blue-500"
                  label={(k) => k.replace(/_/g, ' ')} hrefFor={(k) => ((ITEM_TYPES as readonly string[]).includes(k) ? drill({ itemType: k }) : undefined)} />
                <Breakdown title="Link attributes" entries={attributeEntries} total={linkTotalForTypes} color="bg-slate-400"
                  hrefFor={(k) => (k === 'nofollow' ? drill({ dofollow: false }) : undefined)} />
                <Breakdown title="Source platforms" entries={platformEntries} total={linkTotalForTypes} color="bg-emerald-500"
                  hrefFor={(k) => ((PLATFORMS as readonly string[]).includes(k) ? drill({ platform: k }) : undefined)} />
                <Breakdown title="Source countries" entries={countryEntries} total={linkTotalForTypes} color="bg-amber-400"
                  hrefFor={(k) => (/^[A-Z]{2}$/.test(k) ? drill({ country: k }) : undefined)} />
                <Breakdown title="Position in page" entries={semanticEntries} total={sum(semanticEntries)} color="bg-violet-400" />
                <Breakdown title="Referring TLD" entries={tldEntries} total={sum(tldEntries)} color="bg-sky-400"
                  label={(k) => `.${k}`} hrefFor={(k) => drill({ domainFrom: `.${k}` })} />
              </div>
            </>
          )}

          {/* Backlinks list */}
          <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden scroll-mt-4">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Backlinks list</h2>
                {chips.map((c) => (
                  <span key={c} className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">{c}</span>
                ))}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="font-black text-slate-400 tabular-nums">
                  {links.length > 0 ? `${fmt(q.offset + 1)}–${fmt(q.offset + links.length)}` : '0'} of {fmt(linksTotal)}
                </span>
                {canPrev && <a href={pageHref(Math.max(0, q.offset - q.limit))} className="font-bold text-blue-600 hover:underline">← Previous</a>}
                {canNext && <a href={pageHref(nextOffset)} className="font-bold text-blue-600 hover:underline" title="Runs a new paid request">Next {fmt(Math.min(q.limit, linksTotal - nextOffset))} →</a>}
              </div>
            </div>
            <BacklinksTable links={links} total={linksTotal} filename={`backlinks-${fileSlug}.csv`} groupedByDomain={groupedByDomain} />
          </div>
        </>
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
              const entryChips = entry.params ? describeQuery(parseQuery(Object.fromEntries(new URLSearchParams(entry.params)))) : [];
              return (
                <div key={entry.id} className={`flex items-center gap-2 pr-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <a href={`/dashboard/backlinks?history_id=${entry.id}#results`} className="flex flex-1 min-w-0 items-center gap-4 pl-6 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold font-mono truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.target}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {entry.linksTotal !== undefined ? `${fmt(entry.linksTotal)} backlinks` : ''}
                        {entryChips.length > 0 ? ` · ${entryChips.join(' · ')}` : ''}
                        {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                  </a>
                  <DeleteHistoryButton table="backlinks_searches" id={entry.id} path="/dashboard/backlinks" label={entry.target} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(BacklinksPage);
