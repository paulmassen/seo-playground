import { METRIC_HINTS } from '@/lib/metric-glossary';
import { withProjectScope } from '@/lib/db';
import {
  getCredentials,
  getDomainWhoisHistory,
  saveDomainWhoisSearch,
  getDomainWhoisResult,
  getWhoisFindHistory,
  getWhoisFindResults,
  saveWhoisFindSearch,
  type DomainWhoisEntry,
  type WhoisFindEntry,
} from '@/lib/db';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { ranksTo100 } from '@/lib/dfs-rank';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import { andFilters, cleanDomain, positiveInt, type LabsCondition } from '@/lib/labs';
import DeleteHistoryButton from '@/components/DeleteHistoryButton';
import WhoisFindTable from './WhoisFindTable';
import { ageYears, daysUntil, fmtDate, whoisCost, WHOIS_PRICE_PER_ITEM, WHOIS_PRICE_PER_TASK, type WhoisResult } from './whois-shared';

export const dynamic = 'force-dynamic';

// ---- Types ----

interface SearchParams {
  mode?: string;
  domain?: string;
  history_id?: string;
  find_history_id?: string;
  prefill?: string;
  // Find mode
  tld?: string;
  registrar?: string;
  name_contains?: string;
  expires_within?: string;
  created_before?: string;
  created_after?: string;
  min_keywords?: string;
  min_etv?: string;
  paid?: string;
  status?: string;
  order?: string;
  limit?: string;
  offset?: string;
}

// ---- Find mode query ----

const LIMITS = [20, 50, 100, 200];
const ORDERS: Record<string, { label: string; rule: string }> = {
  etv: { label: 'Organic traffic (highest)', rule: 'metrics.organic.etv,desc' },
  keywords: { label: 'Ranked keywords (most)', rule: 'metrics.organic.count,desc' },
  expires: { label: 'Expiry date (soonest)', rule: 'expiration_datetime,asc' },
  oldest: { label: 'Creation date (oldest)', rule: 'created_datetime,asc' },
  newest: { label: 'Creation date (newest)', rule: 'created_datetime,desc' },
};
const STATUSES: Record<string, string> = {
  any: 'Any',
  registered: 'Registered only',
  expired: 'Registration lapsed',
};

interface FindQuery {
  tld: string;
  registrar: string;
  nameContains: string;
  expiresWithin: number | null;
  createdBefore: string;
  createdAfter: string;
  minKeywords: number | null;
  minEtv: number | null;
  paid: boolean;
  status: 'any' | 'registered' | 'expired';
  order: string;
  limit: number;
  offset: number;
}

function isoDay(v?: string) { return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }

function toFindQuery(p: SearchParams): FindQuery {
  const limit = Number(p.limit);
  return {
    tld: (p.tld ?? '').trim().toLowerCase().replace(/^\./, ''),
    registrar: (p.registrar ?? '').trim(),
    nameContains: (p.name_contains ?? '').trim().toLowerCase().replace(/[^a-z0-9.-]/g, ''),
    expiresWithin: positiveInt(p.expires_within),
    createdBefore: isoDay(p.created_before),
    createdAfter: isoDay(p.created_after),
    minKeywords: positiveInt(p.min_keywords),
    minEtv: positiveInt(p.min_etv),
    paid: p.paid === '1',
    status: p.status === 'registered' || p.status === 'expired' ? p.status : 'any',
    order: p.order && ORDERS[p.order] ? p.order : 'etv',
    limit: LIMITS.includes(limit) ? limit : 50,
    offset: positiveInt(p.offset) ?? 0,
  };
}

function findToParams(q: FindQuery): Record<string, string> {
  const out: Record<string, string> = { mode: 'find', order: q.order, limit: String(q.limit) };
  if (q.tld) out.tld = q.tld;
  if (q.registrar) out.registrar = q.registrar;
  if (q.nameContains) out.name_contains = q.nameContains;
  if (q.expiresWithin) out.expires_within = String(q.expiresWithin);
  if (q.createdBefore) out.created_before = q.createdBefore;
  if (q.createdAfter) out.created_after = q.createdAfter;
  if (q.minKeywords) out.min_keywords = String(q.minKeywords);
  if (q.minEtv) out.min_etv = String(q.minEtv);
  if (q.paid) out.paid = '1';
  if (q.status !== 'any') out.status = q.status;
  if (q.offset) out.offset = String(q.offset);
  return out;
}

function apiDate(d: Date) {
  return `${d.toISOString().slice(0, 10)} 00:00:00 +00:00`;
}

function findConditions(q: FindQuery): LabsCondition[] {
  const c: LabsCondition[] = [];
  if (q.tld) c.push(['tld', '=', q.tld]);
  if (q.registrar) c.push(['registrar', 'like', `%${q.registrar}%`]);
  if (q.nameContains) c.push(['domain', 'like', `%${q.nameContains}%`]);
  if (q.expiresWithin) {
    const now = new Date();
    c.push(['expiration_datetime', '>', apiDate(now)]);
    c.push(['expiration_datetime', '<', apiDate(new Date(now.getTime() + q.expiresWithin * 86_400_000))]);
  }
  if (q.createdBefore) c.push(['created_datetime', '<', `${q.createdBefore} 00:00:00 +00:00`]);
  if (q.createdAfter) c.push(['created_datetime', '>', `${q.createdAfter} 00:00:00 +00:00`]);
  if (q.minKeywords) c.push(['metrics.organic.count', '>=', q.minKeywords]);
  if (q.minEtv) c.push(['metrics.organic.etv', '>=', q.minEtv]);
  if (q.paid) c.push(['metrics.paid.count', '>', 0]);
  if (q.status !== 'any') c.push(['registered', '=', q.status === 'registered']);
  return c;
}

function findLabel(q: FindQuery): string {
  const parts: string[] = [];
  if (q.tld) parts.push(`.${q.tld}`);
  if (q.nameContains) parts.push(`“${q.nameContains}”`);
  if (q.expiresWithin) parts.push(`expires ≤ ${q.expiresWithin}d`);
  if (q.createdBefore) parts.push(`created < ${q.createdBefore}`);
  if (q.createdAfter) parts.push(`created > ${q.createdAfter}`);
  if (q.minKeywords) parts.push(`≥ ${q.minKeywords} kw`);
  if (q.minEtv) parts.push(`ETV ≥ ${q.minEtv}`);
  if (q.paid) parts.push('runs ads');
  if (q.registrar) parts.push(`registrar ~ ${q.registrar}`);
  if (q.status !== 'any') parts.push(STATUSES[q.status].toLowerCase());
  return parts.join(' · ') || 'All domains';
}

// ---- API ----

function rescale(item: WhoisResult): WhoisResult {
  // Whois has no rank_scale option: any rank it returns is on 0–1000, the app shows 0–100.
  return item.backlinks_info ? { ...item, backlinks_info: ranksTo100(item.backlinks_info) } : item;
}

async function fetchWhois(body: Record<string, unknown>, login: string, pass: string): Promise<{ items: WhoisResult[]; total?: number; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: WhoisResult[] }>(
    'domain_analytics/whois/overview/live', body, { login, pass }, 30_000,
  );
  if (error) return { items: [], error };
  return { items: (result?.items ?? []).map(rescale), total: result?.total_count, cost };
}

/** A lookup already contained in a saved "Find domains" result: reused for free. */
function findInSavedSearches(domain: string): WhoisResult | null {
  for (const e of getWhoisFindHistory()) {
    const hit = getWhoisFindResults<WhoisResult>(e.id)?.find((i) => i.domain === domain);
    if (hit) return hit;
  }
  return null;
}

// ---- UI helpers ----

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return Math.round(n).toLocaleString('en-GB');
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatCard({ label, value, info }: { label: string; value: string | number | undefined; info?: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 px-5 py-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400"><span title={info} className={info ? 'underline decoration-dotted decoration-slate-300 dark:decoration-slate-600 underline-offset-[3px] cursor-help' : undefined}>{label}</span></p>
      <p className="text-xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{value ?? '—'}</p>
    </div>
  );
}

const EPP_HINTS: Record<string, string> = {
  clienttransferprohibited: 'Transfer to another registrar is locked (normal protection).',
  clientupdateprohibited: 'Changes to the record are locked by the registrar.',
  clientdeleteprohibited: 'Deletion is locked by the registrar.',
  clienthold: 'Domain is suspended by the registrar: it does not resolve.',
  serverhold: 'Domain is suspended by the registry: it does not resolve.',
  redemptionperiod: 'Expired and deleted: the owner can still restore it for a fee.',
  pendingdelete: 'About to be released: it can be registered again within days.',
  autorenewperiod: 'Just auto-renewed by the registry.',
  ok: 'No restriction.',
  active: 'No restriction.',
};

function eppHint(code: string) {
  return EPP_HINTS[code.toLowerCase().replace(/[^a-z]/g, '')] ?? 'EPP status code set by the registrar or registry.';
}

const inputCls = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 transition-all';
const labelCls = 'block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5';
const BASE = '/dashboard/domain-analytics/whois';

// ---- Page ----

async function WhoisPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const mode = params.mode === 'find' || params.find_history_id ? 'find' : 'lookup';
  const prefill = params.prefill === '1';

  // ======== Lookup mode ========
  const historyId = params.history_id;
  const domain = cleanDomain(params.domain ?? '');
  let result: WhoisResult | null = null;
  let cost: number | undefined;
  let error: string | null = null;
  let source: 'history' | 'cache' | 'find' | 'api' | null = null;
  let activeEntry: DomainWhoisEntry | null = null;

  if (mode === 'lookup') {
    if (historyId) {
      result = getDomainWhoisResult<WhoisResult>(historyId);
      if (result) {
        source = 'history';
        activeEntry = getDomainWhoisHistory().find((e) => e.id === historyId) ?? null;
        cost = activeEntry?.cost;
      } else {
        error = 'This search is no longer available.';
      }
    } else if (domain) {
      const dedupeId = stableSearchId(['domain-whois', domain]);
      const cachedResult = getDomainWhoisResult<WhoisResult>(dedupeId);
      const fromFind = cachedResult ? null : findInSavedSearches(domain);
      if (cachedResult) {
        result = cachedResult;
        source = 'cache';
        cost = getDomainWhoisHistory().find((e) => e.id === dedupeId)?.cost;
      } else if (fromFind) {
        result = fromFind;
        source = 'find';
      } else if (prefill) {
        // Form only: never spend on a link from another tool.
      } else if (!creds) {
        error = 'DataForSEO credentials missing. Configure them in Settings.';
      } else {
        const res = await fetchWhois({ filters: ['domain', '=', domain], limit: 1 }, creds.login, creds.pass);
        if (res.error) {
          error = res.error;
        } else if (res.items[0]) {
          result = res.items[0];
          cost = res.cost;
          source = 'api';
          saveDomainWhoisSearch({ id: dedupeId, ts: Date.now(), domain, cost }, result);
        } else {
          error = `No Whois data for ${domain}. DataForSEO only covers domains its crawler has seen ranking or linked; try the root domain.`;
        }
      }
    }
  }

  // ======== Find mode ========
  const findHistoryId = params.find_history_id;
  let findEntry: WhoisFindEntry | null = null;
  let fq = toFindQuery(params);
  let findItems: WhoisResult[] = [];
  let findTotal: number | undefined;
  let findCost: number | undefined;
  let findError: string | null = null;
  let findRan = false;

  if (mode === 'find') {
    if (findHistoryId) {
      findEntry = getWhoisFindHistory().find((e) => e.id === findHistoryId) ?? null;
      const saved = getWhoisFindResults<WhoisResult>(findHistoryId);
      if (findEntry && saved) {
        fq = toFindQuery(JSON.parse(findEntry.params) as SearchParams);
        findItems = saved;
        findTotal = findEntry.totalCount;
        findCost = findEntry.cost;
        findRan = true;
      } else {
        findError = 'This search is no longer available.';
      }
    } else if (params.order && !prefill) {
      // `order` is always present in a submitted find form; a bare ?mode=find shows the empty form.
      const conditions = findConditions(fq);
      if (conditions.length === 0) {
        findError = 'Set at least one filter: an unfiltered query would just list the biggest sites on the web.';
      } else if (conditions.length > 8) {
        findError = 'DataForSEO accepts 8 conditions at most (the expiry window counts as 2). Remove a filter.';
      } else if (!creds) {
        findError = 'DataForSEO credentials missing. Configure them in Settings.';
      } else {
        const body: Record<string, unknown> = {
          filters: andFilters(conditions),
          order_by: [ORDERS[fq.order].rule],
          limit: fq.limit,
        };
        if (fq.offset) body.offset = fq.offset;
        // The expiry window is relative to today, so the day is part of the cache key.
        const dedupeId = stableSearchId(['whois-find', JSON.stringify(findToParams(fq)), fq.expiresWithin ? new Date().toISOString().slice(0, 10) : '']);
        const cached = getWhoisFindResults<WhoisResult>(dedupeId);
        findRan = true;
        if (cached) {
          findItems = cached;
          const e = getWhoisFindHistory().find((x) => x.id === dedupeId);
          findTotal = e?.totalCount;
          findCost = e?.cost;
        } else {
          const res = await fetchWhois(body, creds.login, creds.pass);
          if (res.error) {
            findError = res.error;
          } else {
            findItems = res.items;
            findTotal = res.total;
            findCost = res.cost;
            saveWhoisFindSearch({
              id: dedupeId, ts: Date.now(), label: findLabel(fq), params: JSON.stringify(findToParams(fq)),
              count: findItems.length, totalCount: findTotal, cost: findCost,
            }, findItems);
          }
        }
      }
    }
  }

  const history = getDomainWhoisHistory();
  const findHistory = getWhoisFindHistory();
  const displayDomain = activeEntry?.domain ?? domain;

  const expiresIn = daysUntil(result?.expiration_datetime);
  const expiresColor = expiresIn !== null
    ? expiresIn < 30 ? 'text-red-600' : expiresIn < 90 ? 'text-amber-600' : 'text-emerald-600'
    : '';
  const age = ageYears(result?.created_datetime);

  const org = result?.metrics?.organic;
  const paid = result?.metrics?.paid;
  const bl = result?.backlinks_info;
  const resultDomain = result?.domain ?? displayDomain;
  const pageHref = (offset: number) => `${BASE}?${new URLSearchParams(findToParams({ ...fq, offset })).toString()}#results`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Whois</h1>
        <p className="text-sm text-slate-400 mt-1">
          Registration data (registrar, creation and expiry dates, status) combined with SEO metrics. Look up one domain, or find domains by extension, age, expiry date and traffic.
        </p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {([
          { label: 'Lookup', value: 'lookup' },
          { label: 'Find domains', value: 'find' },
        ] as const).map((tab) => (
          <a key={tab.value} href={`${BASE}?mode=${tab.value}`}
            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${mode === tab.value
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            {tab.label}
          </a>
        ))}
      </div>

      {/* ---------------- Lookup ---------------- */}
      {mode === 'lookup' && (
        <>
          <SearchForm
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-4"
            btnLabel={<>Lookup<span className="font-mono text-[10px] opacity-50 ml-1.5">~${whoisCost(1).toFixed(3)}</span></>}
            btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors"
          >
            <div>
              <label className={labelCls}>Domain</label>
              <input type="text" name="domain" defaultValue={displayDomain} placeholder="e.g. example.com" required className={`${inputCls} font-mono`} />
              <p className="text-[11px] text-slate-400 mt-1">Already looked-up domains, and domains listed in a saved “Find domains” search, are shown again for free.</p>
            </div>
          </SearchForm>

          {prefill && domain && !result && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-sm rounded-xl px-4 py-3">
              Form prefilled for <span className="font-mono font-bold">{domain}</span>. Nothing has been charged: run the lookup when ready.
            </div>
          )}

          {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

          {result && (
            <div id="results" className="space-y-6">
              {/* Header */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono font-bold text-slate-900 dark:text-white">{resultDomain}</span>
                {source === 'history' && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>}
                {source === 'find' && <span className="text-[10px] font-black uppercase tracking-widest text-violet-600 bg-violet-50 px-2 py-0.5 rounded-md" title="Taken from a saved Find domains result: no charge.">From a Find search · free</span>}
                {result.registered !== undefined && (
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${result.registered ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                    {result.registered ? 'Registered' : 'Registration lapsed'}
                  </span>
                )}
                {result.tld && <span className="text-[10px] font-mono text-slate-400">.{result.tld}</span>}
                {cost !== undefined && <span className="text-[10px] font-mono text-slate-400 ml-auto">cost: ${cost.toFixed(4)}</span>}
              </div>

              {/* Registration info */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 space-y-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Registration</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Registrar</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">{result.registrar ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Created</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">{fmtDate(result.created_datetime)}</p>
                    {age !== null && <p className="text-[10px] font-black text-slate-400 mt-0.5">{age.toFixed(1)} years old</p>}
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Updated</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">{fmtDate(result.updated_datetime ?? result.changed_datetime)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Expires</p>
                    <p className={`text-sm font-bold mt-0.5 ${expiresColor}`}>{fmtDate(result.expiration_datetime)}</p>
                    {expiresIn !== null && (
                      <p className={`text-[10px] font-black mt-0.5 ${expiresColor}`}>
                        {expiresIn > 0 ? `${expiresIn}d remaining` : `Expired ${Math.abs(expiresIn)}d ago`}
                      </p>
                    )}
                  </div>
                </div>
                {result.epp_status_codes && result.epp_status_codes.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">EPP status <span className="normal-case tracking-normal font-medium">(hover for meaning)</span></p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.epp_status_codes.map((s, i) => (
                        <span key={i} title={eppHint(s)} className="cursor-help text-[10px] font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-md">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {result.nameservers && result.nameservers.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Nameservers</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.nameservers.map((ns, i) => (
                        <span key={i} className="text-[10px] font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-md">{ns}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Backlinks */}
              {bl && (
                <div>
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Backlinks{bl.time_update ? <span className="normal-case tracking-normal font-medium"> · updated {fmtDate(bl.time_update)}</span> : null}</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <StatCard label="Backlinks" value={fmt(bl.backlinks)} info={METRIC_HINTS.backlinks} />
                    <StatCard label="Referring Domains" value={fmt(bl.referring_domains)} info={METRIC_HINTS.refDomains} />
                    <StatCard label="Referring Main Domains" value={fmt(bl.referring_main_domains)} info={METRIC_HINTS.refMainDomains} />
                    <StatCard label="Referring Pages" value={fmt(bl.referring_pages)} info="Unique pages that contain at least one link to the domain." />
                    {bl.dofollow !== undefined && <StatCard label="Dofollow links" value={fmt(bl.dofollow)} info={METRIC_HINTS.dofollow} />}
                    {bl.rank !== undefined && <StatCard label="Domain Rank" value={fmt(bl.rank)} info={METRIC_HINTS.domainRank} />}
                  </div>
                </div>
              )}

              {/* Organic traffic */}
              {org && (
                <div>
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Organic Search <span className="normal-case tracking-normal font-medium">(all countries combined)</span></h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Keywords" value={fmt(org.count)} info={METRIC_HINTS.rankedKeywords} />
                    <StatCard label="Traffic (ETV)" value={fmt(org.etv)} info={METRIC_HINTS.etv} />
                    <StatCard label="Traffic Value" value={org.estimated_paid_traffic_cost !== undefined ? `$${fmt(org.estimated_paid_traffic_cost)}` : '—'} info={METRIC_HINTS.trafficValue} />
                    <StatCard label="Top 3" value={fmt((org.pos_1 ?? 0) + (org.pos_2_3 ?? 0))} info={METRIC_HINTS.top3} />
                  </div>
                  {(() => {
                    const bands = [
                      { label: '#1', value: org.pos_1 },
                      { label: '#2–3', value: org.pos_2_3 },
                      { label: '#4–10', value: org.pos_4_10 },
                      { label: '#11–20', value: org.pos_11_20 },
                      { label: '#21–30', value: org.pos_21_30 },
                      { label: '#31–100', value: (org.pos_31_40 ?? 0) + (org.pos_41_50 ?? 0) + (org.pos_51_60 ?? 0) + (org.pos_61_70 ?? 0) + (org.pos_71_80 ?? 0) + (org.pos_81_90 ?? 0) + (org.pos_91_100 ?? 0) },
                    ];
                    if (!bands.some(({ value }) => value)) return null;
                    const total = org.count || 1;
                    return (
                      <div className="mt-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Position Distribution</h3>
                        <div className="space-y-2">
                          {bands.map(({ label, value }) => {
                            const pct = Math.round(((value ?? 0) / total) * 100);
                            return (
                              <div key={label}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300 w-12">{label}</span>
                                  <span className="text-xs font-mono text-slate-500">{fmt(value)} <span className="text-slate-300">({pct}%)</span></span>
                                </div>
                                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Paid */}
              {paid && (paid.count ?? 0) > 0 && (
                <div>
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Paid Search</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <StatCard label="Paid Keywords" value={fmt(paid.count)} info={METRIC_HINTS.paidKeywords} />
                    <StatCard label="Paid Traffic (ETV)" value={fmt(paid.etv)} info={METRIC_HINTS.paidEtv} />
                    <StatCard label="Top Position" value={fmt(paid.pos_1)} info="Keywords where the domain's ad shows in the first ad slot." />
                  </div>
                </div>
              )}

              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 text-sm text-slate-600 dark:text-slate-400 space-y-1.5">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">How to read this</h2>
                <p>Registration dates come from the registry&apos;s Whois record; the SEO metrics are DataForSEO estimates for all countries combined, so they won&apos;t match a single-country tool exactly.</p>
                <p>An expiry under 30 days on a domain you don&apos;t own can be an opportunity (it may drop) or, for your own sites, a renewal risk. Domain age is a weak ranking signal on its own; backlinks and traffic matter more.</p>
                <p className="pt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold">
                  <span className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Next for {resultDomain}</span>
                  <a className="text-blue-600 hover:underline" href={`/dashboard/backlinks?${new URLSearchParams({ target: resultDomain, prefill: '1' })}`}>Backlinks</a>
                  <a className="text-blue-600 hover:underline" href={`/dashboard/ranked-keywords?${new URLSearchParams({ target: resultDomain, prefill: '1' })}`}>Ranked keywords</a>
                  <a className="text-blue-600 hover:underline" href={`/dashboard/historical-rank?${new URLSearchParams({ target: resultDomain, prefill: '1' })}`}>Traffic history</a>
                  <a className="text-blue-600 hover:underline" href={`/dashboard/domain-analytics/technologies?${new URLSearchParams({ mode: 'domain', target: resultDomain, prefill: '1' })}`}>Tech stack</a>
                </p>
              </div>
            </div>
          )}

          {/* Lookup history */}
          {history.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
              </div>
              <div className="divide-y divide-slate-50 dark:divide-slate-700">
                {history.map((entry) => {
                  const isActive = entry.id === historyId;
                  return (
                    <div key={entry.id} className={`flex items-center gap-2 pr-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                      <a href={`${BASE}?history_id=${entry.id}#results`} className="flex flex-1 min-w-0 items-center gap-4 pl-6 py-3.5">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold font-mono truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.domain}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{entry.cost !== undefined ? `$${entry.cost.toFixed(4)}` : ''}</p>
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                      </a>
                      <DeleteHistoryButton table="domain_whois_searches" id={entry.id} path={BASE} label={entry.domain} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------------- Find domains ---------------- */}
      {mode === 'find' && (
        <>
          <SearchForm
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm space-y-4"
            btnLabel={<>Find domains<span className="font-mono text-[10px] opacity-50 ml-1.5">≤ ${whoisCost(fq.limit).toFixed(3)}</span></>}
            btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors"
          >
            <input type="hidden" name="mode" value="find" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Search DataForSEO&apos;s Whois database (domains it has seen in Google results). Typical uses: expiring domains that still get traffic, old domains in a niche, or sites on a given extension that run Google Ads.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Extension</label>
                <input name="tld" defaultValue={fq.tld} placeholder="fr, com, co.uk…" className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className={labelCls}>Name contains</label>
                <input name="name_contains" defaultValue={fq.nameContains} placeholder="e.g. plomb" className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className={labelCls}>Expires within</label>
                <select name="expires_within" defaultValue={String(fq.expiresWithin ?? '')} className={inputCls}>
                  <option value="">Any time</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                  <option value="180">6 months</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select name="status" defaultValue={fq.status} className={inputCls}>
                  {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Created after</label>
                <input type="date" name="created_after" defaultValue={fq.createdAfter} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Created before</label>
                <input type="date" name="created_before" defaultValue={fq.createdBefore} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Min. keywords</label>
                <input type="number" min={0} name="min_keywords" defaultValue={fq.minKeywords ?? ''} placeholder="e.g. 50" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Min. traffic (ETV)</label>
                <input type="number" min={0} name="min_etv" defaultValue={fq.minEtv ?? ''} placeholder="e.g. 500" className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Registrar contains</label>
                <input name="registrar" defaultValue={fq.registrar} placeholder="e.g. OVH, GoDaddy" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Sort by</label>
                <select name="order" defaultValue={fq.order} className={inputCls}>
                  {Object.entries(ORDERS).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Results</label>
                <select name="limit" defaultValue={String(fq.limit)} className={inputCls}>
                  {LIMITS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" name="paid" value="1" defaultChecked={fq.paid} /> Only domains running Google Ads
            </label>
            <p className="text-[11px] text-slate-400">
              Cost: about ${WHOIS_PRICE_PER_TASK.toFixed(2)} per search + ${WHOIS_PRICE_PER_ITEM.toFixed(4)} per domain returned. Backlink counts are shown but can&apos;t be filtered on (DataForSEO limitation); traffic metrics are worldwide.
            </p>
          </SearchForm>

          {findError && <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{findError}</div>}

          {findRan && !findError && (
            <div id="results" className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                    {findItems.length > 0 ? `${fq.offset + 1}–${fq.offset + findItems.length}` : 0}
                    {findTotal !== undefined ? ` of ${findTotal.toLocaleString('en-GB')}` : ''} domains
                  </span>
                  <span className="text-[11px] text-slate-500">{findLabel(fq)} · sorted by {ORDERS[fq.order].label.toLowerCase()}</span>
                  {findHistoryId && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>}
                </div>
                {findCost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${findCost.toFixed(4)}</span>}
              </div>
              {findItems.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-slate-400">No domain matches these filters. Loosen the traffic or date conditions.</div>
              ) : (
                <WhoisFindTable items={findItems} />
              )}
              {!findHistoryId && findTotal !== undefined && (fq.offset > 0 || fq.offset + findItems.length < findTotal) && (
                <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  {fq.offset > 0 ? <a href={pageHref(Math.max(0, fq.offset - fq.limit))} className="text-xs font-bold text-blue-600 hover:underline">← Previous {fq.limit}</a> : <span />}
                  {fq.offset + findItems.length < findTotal && (
                    <a href={pageHref(fq.offset + fq.limit)} className="text-xs font-bold text-blue-600 hover:underline">
                      Next {fq.limit} <span className="font-mono text-slate-400 font-normal">(≤ ${whoisCost(fq.limit).toFixed(3)})</span> →
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {findHistory.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
              </div>
              <div className="divide-y divide-slate-50 dark:divide-slate-700">
                {findHistory.map((entry) => {
                  const isActive = entry.id === findHistoryId;
                  return (
                    <div key={entry.id} className={`flex items-center gap-2 pr-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                      <a href={`${BASE}?mode=find&find_history_id=${entry.id}#results`} className="flex flex-1 min-w-0 items-center gap-4 pl-6 py-3.5">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.label}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {entry.count} shown{entry.totalCount !== undefined ? ` / ${entry.totalCount.toLocaleString('en-GB')} total` : ''}
                            {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                      </a>
                      <DeleteHistoryButton table="whois_find_searches" id={entry.id} path={BASE} label={entry.label} />
                    </div>
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

export default withProjectScope(WhoisPage);
