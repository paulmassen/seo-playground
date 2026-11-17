import { withProjectScope } from '@/lib/db';
import {
  getCredentials,
  getCompetitorsHistory,
  saveCompetitorsSearch,
  getCompetitorsResults,
  getSetting,
  type CompetitorsSearchEntry,
} from '@/lib/db';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { toLabsCountry } from '@/lib/geo-options';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import { cleanDomain, EXTRA_PLATFORM_DOMAINS, labsCostEstimate, parseDomainList } from '@/lib/labs';
import CompetitorsTable from './CompetitorsTable';
import DeleteHistoryButton from '@/components/DeleteHistoryButton';

export const dynamic = 'force-dynamic';

// ---- Types ----

export interface DomainMetricsOrganic {
  count?: number;
  /** Estimated monthly organic visits. DataForSEO calls it `etv`; there is no `estimated_traffic` field. */
  etv?: number;
  estimated_paid_traffic_cost?: number;
  pos_1?: number;
  pos_2_3?: number;
  pos_4_10?: number;
  pos_11_20?: number;
  pos_21_30?: number;
  pos_31_40?: number;
  pos_41_50?: number;
  pos_51_60?: number;
  pos_61_70?: number;
  pos_71_80?: number;
  pos_81_90?: number;
  pos_91_100?: number;
  is_new?: number;
  is_up?: number;
  is_down?: number;
  is_lost?: number;
}

interface DomainMetrics {
  organic?: DomainMetricsOrganic;
  paid?: DomainMetricsOrganic;
}

export interface CompetitorItem {
  domain?: string;
  avg_position?: number;
  sum_position?: number;
  intersections?: number;
  /** Whole competitor site, all its keywords. */
  full_domain_metrics?: DomainMetrics;
  /** The target domain, on the keywords it shares with this competitor. */
  metrics?: DomainMetrics;
  /** The competitor, on the keywords it shares with the target. */
  competitor_metrics?: DomainMetrics;
}

interface SearchParams {
  target?: string;
  location?: string;
  language?: string;
  limit?: string;
  max_rank?: string;
  item_types?: string;
  exclude_top?: string;
  exclude_platforms?: string;
  exclude_domains?: string;
  intersecting_domains?: string;
  submitted?: string;
  prefill?: string;
  history_id?: string;
}

export interface CompetitorOptions {
  limit: number;
  maxRank: number;
  itemTypes: 'organic' | 'organic_paid';
  excludeTop: boolean;
  excludePlatforms: boolean;
  excludeDomains: string[];
  intersectingDomains: string[];
}

const LIMITS = [10, 20, 50, 100, 200];
const MAX_RANKS = [100, 50, 20, 10];

function parseOptions(p: SearchParams): CompetitorOptions {
  // Checkboxes are absent from the query when unchecked: `submitted` tells a submitted form
  // (unchecked = off) apart from a bare link (use the defaults, both on).
  const submitted = p.submitted === '1';
  const limit = Number(p.limit);
  const maxRank = Number(p.max_rank);
  return {
    limit: LIMITS.includes(limit) ? limit : 20,
    maxRank: MAX_RANKS.includes(maxRank) ? maxRank : 100,
    itemTypes: p.item_types === 'organic_paid' ? 'organic_paid' : 'organic',
    excludeTop: submitted ? p.exclude_top === '1' : true,
    excludePlatforms: submitted ? p.exclude_platforms === '1' : true,
    excludeDomains: parseDomainList(p.exclude_domains, 900),
    intersectingDomains: parseDomainList(p.intersecting_domains, 20),
  };
}

// ---- API ----

function buildBody(target: string, location: string, language: string, o: CompetitorOptions) {
  const exclude = new Set(o.excludeDomains);
  if (o.excludePlatforms) EXTRA_PLATFORM_DOMAINS.forEach((d) => exclude.add(d));
  exclude.delete(target);
  const body: Record<string, unknown> = {
    target,
    location_name: location,
    language_name: language,
    limit: o.limit,
    item_types: o.itemTypes === 'organic_paid' ? ['organic', 'paid'] : ['organic'],
    exclude_top_domains: o.excludeTop,
  };
  if (o.maxRank !== 100) body.max_rank_group = o.maxRank;
  if (exclude.size > 0) body.exclude_domains = [...exclude].slice(0, 1000);
  if (o.intersectingDomains.length > 0) body.intersecting_domains = o.intersectingDomains;
  return body;
}

async function fetchCompetitors(
  body: Record<string, unknown>,
  login: string,
  pass: string,
): Promise<{ items: CompetitorItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: CompetitorItem[] }>(
    'dataforseo_labs/google/competitors_domain/live', body, { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

// ---- UI helpers ----

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const inputCls = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all';
const labelCls = 'block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5';

function optionsSummary(o: CompetitorOptions): string {
  const parts = [`top ${o.maxRank}`];
  if (o.itemTypes === 'organic_paid') parts.push('organic + paid');
  if (o.excludeTop || o.excludePlatforms) parts.push('platforms excluded');
  if (o.excludeDomains.length) parts.push(`${o.excludeDomains.length} excluded`);
  if (o.intersectingDomains.length) parts.push(`${o.intersectingDomains.length} seed competitors`);
  return parts.join(' · ');
}

// ---- Page ----

async function CompetitorsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;
  const prefill = params.prefill === '1';

  let activeEntry: CompetitorsSearchEntry | null = null;
  let effective: SearchParams = params;
  if (historyId) {
    activeEntry = getCompetitorsHistory().find((e) => e.id === historyId) ?? null;
    if (activeEntry) {
      const saved = activeEntry.params ? (JSON.parse(activeEntry.params) as SearchParams) : { submitted: '1' };
      effective = { ...saved, target: activeEntry.target, location: activeEntry.location, language: activeEntry.language };
    }
  }

  const target = cleanDomain(effective.target ?? '');
  const location = effective.location ?? toLabsCountry(getSetting('default_location') ?? 'France');
  const language = effective.language ?? getSetting('default_language') ?? 'French';
  const opts = parseOptions(effective);

  let items: CompetitorItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;

  if (historyId) {
    const saved = getCompetitorsResults<CompetitorItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      cost = activeEntry?.cost;
    } else {
      error = 'This search is no longer available.';
    }
  } else if (target && !prefill) {
    const body = buildBody(target, location, language, opts);
    const dedupeId = stableSearchId(['competitors-v2', JSON.stringify(body)]);
    const cached = getCompetitorsResults<CompetitorItem>(dedupeId);

    if (cached) {
      items = cached;
      cost = getCompetitorsHistory().find((e) => e.id === dedupeId)?.cost;
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const res = await fetchCompetitors(body, creds.login, creds.pass);
      items = res.items;
      cost = res.cost;
      error = res.error ?? null;

      if (!error && items.length > 0) {
        const savedParams: SearchParams = {
          submitted: '1',
          limit: String(opts.limit),
          max_rank: String(opts.maxRank),
          item_types: opts.itemTypes,
          exclude_top: opts.excludeTop ? '1' : undefined,
          exclude_platforms: opts.excludePlatforms ? '1' : undefined,
          exclude_domains: opts.excludeDomains.join('\n') || undefined,
          intersecting_domains: opts.intersectingDomains.join('\n') || undefined,
        };
        saveCompetitorsSearch({
          id: dedupeId, ts: Date.now(), target, location, language,
          count: items.length, cost, params: JSON.stringify(savedParams),
        }, items);
      }
    }
  }

  // DataForSEO lists the target itself first (it "shares" every keyword with itself): keep it apart as the baseline.
  const self = items.find((i) => i.domain === target);
  const competitors = items.filter((i) => i.domain !== target);

  const history = getCompetitorsHistory();
  const hasResults = (historyId || (target && !prefill)) && !error;

  const exportRows = competitors.map((item) => ({
    domain: item.domain ?? '',
    intersections: item.intersections ?? '',
    avg_position: item.avg_position != null ? item.avg_position.toFixed(1) : '',
    shared_etv: item.competitor_metrics?.organic?.etv != null ? Math.round(item.competitor_metrics.organic.etv) : '',
    shared_top3: (item.competitor_metrics?.organic?.pos_1 ?? 0) + (item.competitor_metrics?.organic?.pos_2_3 ?? 0),
    shared_top10: (item.competitor_metrics?.organic?.pos_1 ?? 0) + (item.competitor_metrics?.organic?.pos_2_3 ?? 0) + (item.competitor_metrics?.organic?.pos_4_10 ?? 0),
    site_etv: item.full_domain_metrics?.organic?.etv != null ? Math.round(item.full_domain_metrics.organic.etv) : '',
    total_kw: item.full_domain_metrics?.organic?.count ?? '',
  }));
  const exportColumns = [
    { key: 'domain', label: 'Domain' },
    { key: 'intersections', label: 'Common KWs' },
    { key: 'avg_position', label: 'Avg Position' },
    { key: 'shared_etv', label: 'Traffic on common KWs' },
    { key: 'shared_top3', label: 'Common KWs in top 3' },
    { key: 'shared_top10', label: 'Common KWs in top 10' },
    { key: 'site_etv', label: 'Whole-site traffic' },
    { key: 'total_kw', label: 'Total KWs' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Competitors</h1>
        <p className="text-sm text-slate-400 mt-1">
          Domains that rank in the same Google results as your target, ranked by how many keywords you share.
        </p>
      </div>

      {/* Form */}
      <SearchForm
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4"
        btnLabel={<>Find competitors<span className="font-mono text-[10px] opacity-50 ml-1.5">≤ ${labsCostEstimate(opts.limit + 1).toFixed(3)}</span></>}
        btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors"
      >
        <input type="hidden" name="submitted" value="1" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Target domain</label>
            <input type="text" name="target" defaultValue={target} placeholder="e.g. example.com" required className={`${inputCls} font-mono`} />
          </div>
          <LabsLocationLanguageFields defaultLocation={location} defaultLanguage={language} className={inputCls} labelClassName={labelCls} />
          <div>
            <label className={labelCls}>Number of competitors</label>
            <select name="limit" defaultValue={String(opts.limit)} className={inputCls}>
              {LIMITS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} title="Only count a shared keyword when the competitor ranks within this position. Top 10 = page-one competitors only.">
              <span className="underline decoration-dotted underline-offset-[3px] cursor-help">Competing within</span>
            </label>
            <select name="max_rank" defaultValue={String(opts.maxRank)} className={inputCls}>
              <option value="100">Top 100 (all rankings)</option>
              <option value="50">Top 50</option>
              <option value="20">Top 20 (pages 1–2)</option>
              <option value="10">Top 10 (page one only)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" name="exclude_top" value="1" defaultChecked={opts.excludeTop} className="rounded" />
            Exclude the world&apos;s largest sites
            <span className="text-[11px] text-slate-400" title="DataForSEO's exclude_top_domains: wikipedia, youtube, facebook, instagram, amazon.com, reddit, pinterest, quora, linkedin…">(DataForSEO list)</span>
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" name="exclude_platforms" value="1" defaultChecked={opts.excludePlatforms} className="rounded" />
            Exclude other platforms
            <span className="text-[11px] text-slate-400" title={EXTRA_PLATFORM_DOMAINS.join(', ')}>(tiktok, local Amazon/eBay, Tripadvisor, directories…)</span>
          </label>
        </div>

        <details className="group" open={opts.excludeDomains.length > 0 || opts.intersectingDomains.length > 0 || opts.itemTypes !== 'organic'}>
          <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 select-none">Advanced options</summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className={labelCls}>Exclude domains</label>
              <textarea name="exclude_domains" rows={3} defaultValue={opts.excludeDomains.join('\n')} placeholder={'one domain per line\nmarketplace.com'} className={`${inputCls} font-mono text-xs`} />
              <p className="text-[11px] text-slate-400 mt-1">Hidden from the results (up to 900).</p>
            </div>
            <div>
              <label className={labelCls}>Known competitors (seed)</label>
              <textarea name="intersecting_domains" rows={3} defaultValue={opts.intersectingDomains.join('\n')} placeholder={'competitor-a.com\ncompetitor-b.com'} className={`${inputCls} font-mono text-xs`} />
              <p className="text-[11px] text-slate-400 mt-1">Up to 20. Only SERPs where the target <em>and</em> these domains appear are used: sharper niche, fewer results.</p>
            </div>
            <div>
              <label className={labelCls}>Search results counted</label>
              <select name="item_types" defaultValue={opts.itemTypes} className={inputCls}>
                <option value="organic">Organic only</option>
                <option value="organic_paid">Organic + Google Ads</option>
              </select>
            </div>
          </div>
        </details>
      </SearchForm>

      {prefill && target && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-sm rounded-xl px-4 py-3">
          Form prefilled for <span className="font-mono font-bold">{target}</span>. Review the options, then run the search.
        </div>
      )}

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {/* Results */}
      {hasResults && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
                <span className="text-slate-900 dark:text-white">{target}</span> — competitors
              </h2>
              {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
              <span className="text-[11px] text-slate-400">{location} · {language} · {optionsSummary(opts)}</span>
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              <span className="text-xs font-black text-slate-400">{competitors.length} competitor{competitors.length !== 1 ? 's' : ''}</span>
              {competitors.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton data={exportRows} columns={exportColumns} />
                  <ExportCSVButton data={exportRows} filename={`competitors-${target}.csv`} columns={exportColumns} />
                </div>
              )}
            </div>
          </div>

          {competitors.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">
              No competitors found. Try “Top 100”, fewer exclusions, or another location.
            </div>
          ) : (
            <CompetitorsTable items={competitors} self={self} target={target} location={location} language={language} />
          )}
        </div>
      )}

      {/* How to read */}
      {hasResults && competitors.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-sm text-slate-600 dark:text-slate-400 space-y-1.5">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">How to read this</h2>
          <p><strong className="text-slate-800 dark:text-slate-200">Common keywords</strong> is the overlap: the number of keywords for which both sites appear in the same Google results. It measures topical closeness, not size.</p>
          <p><strong className="text-slate-800 dark:text-slate-200">Wins on common</strong> compares top-10 rankings on those shared keywords: theirs against yours. A competitor with many top-10s where you are absent is the first one to study.</p>
          <p><strong className="text-slate-800 dark:text-slate-200">Traffic on common</strong> is the competitor&apos;s estimated visits from the shared keywords only; <strong className="text-slate-800 dark:text-slate-200">Site traffic</strong> covers its whole site. A big site with a small overlap is a generalist; a small site with a big overlap is a direct niche rival.</p>
          <p>Next steps per row: <em>Shared</em> and <em>Gap</em> open Domain Intersection (gap = keywords they rank for and you don&apos;t), plus Ranked keywords, Backlinks and Tech stack. Links only prefill the form; nothing is charged until you run it.</p>
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
              const entryOpts = entry.params ? parseOptions(JSON.parse(entry.params) as SearchParams) : null;
              return (
                <div key={entry.id} className={`flex items-center gap-2 pr-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <a href={`/dashboard/competitors?history_id=${entry.id}#results`} className="flex flex-1 min-w-0 items-center gap-4 pl-6 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold font-mono truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.target}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {entry.location} · {entry.count} result{entry.count !== 1 ? 's' : ''}
                        {entryOpts ? ` · ${optionsSummary(entryOpts)}` : ' · no exclusions'}
                        {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                  </a>
                  <DeleteHistoryButton table="competitors_searches" id={entry.id} path="/dashboard/competitors" label={entry.target} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(CompetitorsPage);
