import { withProjectScope } from '@/lib/db';
import {
  getCredentials,
  getSetting,
  getAiVisibilityHistory,
  saveAiVisibilitySearch,
  getAiVisibilityResult,
  type AiVisibilityEntry,
  type AiVisibilityMode,
} from '@/lib/db';
import { labsLocationLabel, toLabsCountry } from '@/lib/geo-options';
import { getBrandSettings } from '@/lib/brand-server';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import ExportExcelButton, { type ExportSheet } from '@/components/ExportExcelButton';
import ReportPdfExportButton, { type ReportMetric, type ReportSection } from '@/components/ReportPdfExportButton';
import LeaderboardTables from './LeaderboardTables';
import HistoricalTargetingFields from './HistoricalTargetingFields';
import MentionTargetingFields from './MentionTargetingFields';

// ---- Types ----

export interface AggMetric {
  key: string | number;
  mentions: number;
  ai_search_volume: number;
}

export interface AggregatedMetrics {
  location?: AggMetric[];
  language?: AggMetric[];
  platform?: AggMetric[];
  sources_domain?: AggMetric[];
  search_results_domain?: AggMetric[];
  brand_entities_title?: AggMetric[];
  brand_entities_category?: AggMetric[];
  total?: { mentions: number; ai_search_volume: number };
}

type MetricBreakdowns = Omit<AggregatedMetrics, 'total'>;
const METRIC_DIMENSIONS: ReadonlyArray<[keyof MetricBreakdowns, string]> = [
  ['location', 'Location'],
  ['language', 'Language'],
  ['platform', 'Platform'],
  ['sources_domain', 'Source domain'],
  ['search_results_domain', 'Search-result domain'],
  ['brand_entities_title', 'Brand entity'],
  ['brand_entities_category', 'Brand entity category'],
];

interface TargetMetricsResult {
  total_count: number;
  aggregated_metrics: AggregatedMetrics;
}

export interface LeaderboardItem {
  domain?: string;
  brand?: string;
  location?: AggMetric[];
  language?: AggMetric[];
  platform?: AggMetric[];
  sources_domain?: AggMetric[];
  search_results_domain?: AggMetric[];
  brand_entities_title?: AggMetric[];
  brand_entities_category?: AggMetric[];
  total: { mentions: number; ai_search_volume: number };
}

interface LeaderboardResult {
  domains: LeaderboardItem[];
  brands: LeaderboardItem[];
  domainsAggregatedMetrics?: AggregatedMetrics;
  brandsAggregatedMetrics?: AggregatedMetrics;
  domainsTotalCount?: number;
  brandsTotalCount?: number;
}

interface LeaderboardResponse {
  total_count?: number;
  aggregated_metrics?: AggregatedMetrics;
  items?: LeaderboardItem[];
}

interface HistoricalItem {
  year: number;
  month: number;
  metrics: { mentions: number; ai_search_volume: number };
}

interface HistoricalResult {
  items_count: number;
  items: HistoricalItem[];
}

interface SearchParams {
  mode?: string;
  target?: string;
  target_type?: string;
  platform?: string;
  limit?: string;
  location?: string;
  language?: string;
  date_from?: string;
  date_to?: string;
  history_id?: string;
}

// ---- API ----
// `target` must be an array of {domain|keyword, search_filter, search_scope} objects even for a
// single target. DataForSEO supports country/language targeting for Google AI; ChatGPT is fixed to
// United States / English, so we rely on its documented defaults for that platform.

function buildTargetObj(value: string, type: 'domain' | 'keyword') {
  return type === 'domain'
    ? { domain: value, search_filter: 'include', search_scope: ['any'] }
    : { keyword: value, search_filter: 'include', search_scope: ['any'], match_type: 'word_match' };
}

async function callLlmMentions<T>(
  fn: string, body: Record<string, unknown>, login: string, pass: string,
): Promise<{ result?: T; cost?: number; error?: string }> {
  return callDataForSeoFirst<T>(`ai_optimization/llm_mentions/${fn}/live`, body, { login, pass });
}

async function fetchTargetMetrics(
  value: string, type: 'domain' | 'keyword', platform: string, location: string, language: string, login: string, pass: string,
): Promise<{ result?: TargetMetricsResult; cost?: number; error?: string }> {
  const body: Record<string, unknown> = { target: [buildTargetObj(value, type)], platform };
  if (platform === 'google') {
    body.location_name = location;
    body.language_name = language;
  }
  return callLlmMentions<TargetMetricsResult>(
    'target_metrics',
    body,
    login, pass,
  );
}

async function fetchLeaderboard(
  value: string, type: 'domain' | 'keyword', platform: string, location: string, language: string, limit: number, login: string, pass: string,
): Promise<{ result?: LeaderboardResult; cost?: number; error?: string }> {
  const body: Record<string, unknown> = { target: [buildTargetObj(value, type)], platform, limit };
  if (platform === 'google') {
    body.location_name = location;
    body.language_name = language;
  }
  const [domainsRes, brandsRes] = await Promise.all([
    callLlmMentions<LeaderboardResponse>('top_mentioned_domains', body, login, pass),
    callLlmMentions<LeaderboardResponse>('top_mentioned_brands', body, login, pass),
  ]);
  if (domainsRes.error || brandsRes.error) {
    return { error: domainsRes.error ?? brandsRes.error };
  }
  return {
    result: {
      domains: domainsRes.result?.items ?? [],
      brands: brandsRes.result?.items ?? [],
      domainsAggregatedMetrics: domainsRes.result?.aggregated_metrics,
      brandsAggregatedMetrics: brandsRes.result?.aggregated_metrics,
      domainsTotalCount: domainsRes.result?.total_count,
      brandsTotalCount: brandsRes.result?.total_count,
    },
    cost: (domainsRes.cost ?? 0) + (brandsRes.cost ?? 0),
  };
}

async function fetchHistorical(
  value: string, type: 'domain' | 'keyword', platform: string, location: string, language: string,
  dateFrom: string, dateTo: string, login: string, pass: string,
): Promise<{ result?: HistoricalResult; cost?: number; error?: string }> {
  const body: Record<string, unknown> = { target: [buildTargetObj(value, type)], platform };
  // ChatGPT mentions are only tracked for United States / English, and the API rejects
  // location_name/language_name outright when platform is chat_gpt (same as the other LLM Mentions
  // endpoints) — so only send geo/language targeting for Google AI.
  if (platform === 'google') {
    body.location_name = location;
    body.language_name = language;
  }
  if (dateFrom) body.date_from = dateFrom;
  if (dateTo) body.date_to = dateTo;
  return callLlmMentions<HistoricalResult>('historical', body, login, pass);
}

// ---- UI helpers ----

const PLATFORM_LABELS: Record<string, string> = { google: 'Google AI', chat_gpt: 'ChatGPT' };

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }
function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

function BreakdownList({ title, items, formatKey = String }: {
  title: string;
  items?: AggMetric[];
  formatKey?: (key: AggMetric['key']) => string;
}) {
  if (!items || items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.mentions), 1);
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
      <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">{title}</h2>
      <div className="space-y-2">
        {items.map((item, i) => {
          const pct = Math.round((item.mentions / max) * 100);
          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">{formatKey(item.key)}</span>
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                  {fmt(item.mentions)} mentions · {fmt(item.ai_search_volume)} volume
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-violet-400 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

function MonthlyTrendChart({ title, items, metric }: { title: string; items: HistoricalItem[]; metric: 'mentions' | 'ai_search_volume' }) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => (a.year - b.year) || (a.month - b.month));
  const values = sorted.map((i) => i.metrics[metric]);
  const max = Math.max(...values, 1);
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  const trendLabel = delta > 0 ? 'increasing' : delta < 0 ? 'declining' : 'flat';
  const trendColor = delta > 0
    ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 border-emerald-100 dark:border-emerald-900'
    : delta < 0
      ? 'text-red-600 bg-red-50 dark:bg-red-950 border-red-100 dark:border-red-900'
      : 'text-slate-500 bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">{title}</h2>
        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${trendColor}`}>
          {trendLabel}{sorted.length > 1 ? ` (${delta > 0 ? '+' : ''}${fmt(delta)})` : ''}
        </span>
      </div>
      <div className="flex items-end gap-1.5 h-36">
        {sorted.map((item, i) => {
          const val = item.metrics[metric];
          const h = Math.max(3, Math.round((val / max) * 128));
          return (
            <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-1.5 group relative h-full">
              <span className="absolute -top-4 text-[10px] font-mono text-slate-500 dark:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {fmt(val)}
              </span>
              <div className="w-full bg-violet-300 dark:bg-violet-500/60 group-hover:bg-violet-500 rounded-t-md transition-colors" style={{ height: `${h}px` }} />
              <span className="text-[9px] text-slate-400 whitespace-nowrap shrink-0">{monthLabel(item.year, item.month)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Page ----

async function AiVisibilityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const mode: AiVisibilityMode =
    params.mode === 'leaderboard' ? 'leaderboard' : params.mode === 'historical' ? 'historical' : 'target';
  const targetValue = (params.target ?? '').trim();
  const targetType = (params.target_type === 'domain' ? 'domain' : 'keyword') as 'keyword' | 'domain';
  const platform = ['google', 'chat_gpt'].includes(params.platform ?? '') ? params.platform! : 'chat_gpt';
  const limit = Math.min(Math.max(parseInt(params.limit ?? '10', 10) || 10, 1), 50);
  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'France');
  const defaultLanguage = getSetting('default_language') ?? 'French';
  const brand = getBrandSettings();
  const brandName = brand.name;
  const brandLogoUrl = brand.logo ?? undefined;
  const location = platform === 'chat_gpt' ? 'United States' : (params.location ?? defaultLocation);
  const language = platform === 'chat_gpt' ? 'English' : (params.language ?? defaultLanguage);
  const dateFrom = params.date_from ?? '';
  const dateTo = params.date_to ?? '';

  let targetResult: TargetMetricsResult | null = null;
  let leaderboardResult: LeaderboardResult | null = null;
  let historicalResult: HistoricalResult | null = null;
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: AiVisibilityEntry | null = null;

  if (historyId) {
    if (mode === 'target') targetResult = getAiVisibilityResult<TargetMetricsResult>(historyId);
    else if (mode === 'leaderboard') leaderboardResult = getAiVisibilityResult<LeaderboardResult>(historyId);
    else historicalResult = getAiVisibilityResult<HistoricalResult>(historyId);
    if (targetResult || leaderboardResult || historicalResult) {
      isFromHistory = true;
      activeEntry = getAiVisibilityHistory().find((e) => e.id === historyId) ?? null;
    } else {
      error = 'This search is no longer available.';
    }
  } else if (targetValue) {
    if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const dedupeId = mode === 'historical'
        ? stableSearchId(['ai-visibility', mode, targetValue, targetType, platform, location, language, dateFrom, dateTo])
        : stableSearchId(['ai-visibility', mode, targetValue, targetType, platform, location, language, limit]);
      const cached = getAiVisibilityResult<TargetMetricsResult | LeaderboardResult | HistoricalResult>(dedupeId);

      if (cached) {
        if (mode === 'target') targetResult = cached as TargetMetricsResult;
        else if (mode === 'leaderboard') leaderboardResult = cached as LeaderboardResult;
        else historicalResult = cached as HistoricalResult;
        cost = getAiVisibilityHistory().find((e) => e.id === dedupeId)?.cost;
      } else {
        const res = mode === 'target'
          ? await fetchTargetMetrics(targetValue, targetType, platform, location, language, creds.login, creds.pass)
          : mode === 'leaderboard'
            ? await fetchLeaderboard(targetValue, targetType, platform, location, language, limit, creds.login, creds.pass)
            : await fetchHistorical(targetValue, targetType, platform, location, language, dateFrom, dateTo, creds.login, creds.pass);

        error = res.error ?? null;
        cost = res.cost;

        if (!error && res.result) {
          if (mode === 'target') targetResult = res.result as TargetMetricsResult;
          else if (mode === 'leaderboard') leaderboardResult = res.result as LeaderboardResult;
          else historicalResult = res.result as HistoricalResult;

          const entry: AiVisibilityEntry = { id: dedupeId, ts: Date.now(), mode, target: targetValue, platform, cost };
          saveAiVisibilitySearch(entry, res.result);
        }
      }
    }
  }

  const history = getAiVisibilityHistory();
  const hasQuery = !!(historyId || targetValue);
  const displayTarget = activeEntry?.target ?? targetValue;
  const agg = targetResult?.aggregated_metrics;
  const formatBreakdownKey = (dimension: string, key: AggMetric['key']) =>
    dimension === 'Location' ? labsLocationLabel(key) : String(key);
  const reportDate = activeEntry?.ts ?? Date.now();
  const reportSlug = displayTarget.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48) || 'report';
  let reportMetrics: ReportMetric[] = [];
  let reportSections: ReportSection[] = [];
  let reportSheets: ExportSheet[] = [];
  let reportCsvData: Record<string, unknown>[] = [];
  let reportCsvColumns: Array<{ key: string; label: string }> = [];

  if (mode === 'target' && targetResult) {
    const breakdowns: Array<[string, AggMetric[] | undefined]> = [
      ['Platform', agg?.platform], ['Location', agg?.location], ['Language', agg?.language], ['Source domain', agg?.sources_domain],
      ['Search-result domain', agg?.search_results_domain], ['Brand entity', agg?.brand_entities_title], ['Brand entity category', agg?.brand_entities_category],
    ];
    reportMetrics = [
      { label: 'Platform', value: PLATFORM_LABELS[platform] ?? platform },
      { label: 'Mentions', value: fmt(agg?.total?.mentions) },
      { label: 'AI search volume', value: fmt(agg?.total?.ai_search_volume) },
    ];
    reportSections = breakdowns.map(([title, items]) => ({
      title: `Mentions by ${title.toLowerCase()}`,
      rows: (items ?? []).slice(0, 12).map((item) => [formatBreakdownKey(title, item.key), `${fmt(item.mentions)} mentions`]),
    }));
    reportSheets = [
      { name: 'Overview', columns: [{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value' }], data: reportMetrics.map((metric) => ({ metric: metric.label, value: metric.value })) },
      ...breakdowns.map(([name, items]) => ({
        name: name.slice(0, 31),
        columns: [{ key: 'name', label: name }, { key: 'mentions', label: 'Mentions' }, { key: 'volume', label: 'AI Search Volume' }],
        data: (items ?? []).map((item) => ({ name: formatBreakdownKey(name, item.key), mentions: item.mentions, volume: item.ai_search_volume })),
      })),
    ];
    reportCsvColumns = [{ key: 'dimension', label: 'Dimension' }, { key: 'name', label: 'Name' }, { key: 'mentions', label: 'Mentions' }, { key: 'volume', label: 'AI Search Volume' }];
    reportCsvData = breakdowns.flatMap(([dimension, items]) => (items ?? []).map((item) => ({ dimension, name: formatBreakdownKey(dimension, item.key), mentions: item.mentions, volume: item.ai_search_volume })));
  } else if (mode === 'leaderboard' && leaderboardResult) {
    const toRows = (items: LeaderboardItem[], field: 'domain' | 'brand') => items.map((item) => ({
      name: item[field] ?? '', mentions: item.total?.mentions ?? 0, volume: item.total?.ai_search_volume ?? 0,
    }));
    const domains = toRows(leaderboardResult.domains, 'domain');
    const brands = toRows(leaderboardResult.brands, 'brand');
    const detailedRows = (scope: string, name: string, metrics?: MetricBreakdowns) =>
      METRIC_DIMENSIONS.flatMap(([dimension, label]) => (metrics?.[dimension] ?? []).map((item) => ({
        scope, name, dimension: label, key: formatBreakdownKey(label, item.key), mentions: item.mentions, volume: item.ai_search_volume,
      })));
    const metricDetails = [
      ...detailedRows('Domain leaderboard', 'All domains', leaderboardResult.domainsAggregatedMetrics),
      ...detailedRows('Brand leaderboard', 'All brands', leaderboardResult.brandsAggregatedMetrics),
      ...leaderboardResult.domains.flatMap((item) => detailedRows('Domain', item.domain ?? '—', item)),
      ...leaderboardResult.brands.flatMap((item) => detailedRows('Brand', item.brand ?? '—', item)),
    ];
    reportMetrics = [
      { label: 'Platform', value: PLATFORM_LABELS[platform] ?? platform },
      { label: 'Domains ranked', value: String(domains.length) },
      { label: 'Brands ranked', value: String(brands.length) },
    ];
    reportSections = [
      { title: 'Top mentioned domains', rows: domains.slice(0, 12).map((row) => [String(row.name), `${fmt(Number(row.mentions))} mentions`]) },
      { title: 'Top mentioned brands', rows: brands.slice(0, 12).map((row) => [String(row.name), `${fmt(Number(row.mentions))} mentions`]) },
    ];
    reportSheets = [
      { name: 'Domains', columns: [{ key: 'name', label: 'Domain' }, { key: 'mentions', label: 'Mentions' }, { key: 'volume', label: 'AI Search Volume' }], data: domains },
      { name: 'Brands', columns: [{ key: 'name', label: 'Brand' }, { key: 'mentions', label: 'Mentions' }, { key: 'volume', label: 'AI Search Volume' }], data: brands },
      { name: 'Metric details', columns: [{ key: 'scope', label: 'Scope' }, { key: 'name', label: 'Name' }, { key: 'dimension', label: 'Dimension' }, { key: 'key', label: 'Value' }, { key: 'mentions', label: 'Mentions' }, { key: 'volume', label: 'AI Search Volume' }], data: metricDetails },
    ];
    reportCsvColumns = [{ key: 'scope', label: 'Scope' }, { key: 'name', label: 'Name' }, { key: 'dimension', label: 'Dimension' }, { key: 'key', label: 'Value' }, { key: 'mentions', label: 'Mentions' }, { key: 'volume', label: 'AI Search Volume' }];
    reportCsvData = [
      ...domains.map((row) => ({ scope: 'Domain', name: row.name, dimension: 'Total', key: '', mentions: row.mentions, volume: row.volume })),
      ...brands.map((row) => ({ scope: 'Brand', name: row.name, dimension: 'Total', key: '', mentions: row.mentions, volume: row.volume })),
      ...metricDetails,
    ];
  } else if (mode === 'historical' && historicalResult) {
    const months = [...historicalResult.items].sort((a, b) => (a.year - b.year) || (a.month - b.month)).map((item) => ({
      month: `${item.year}-${String(item.month).padStart(2, '0')}`, mentions: item.metrics.mentions, volume: item.metrics.ai_search_volume,
    }));
    reportMetrics = [
      { label: 'Platform', value: PLATFORM_LABELS[platform] ?? platform },
      { label: 'Months tracked', value: String(months.length) },
      { label: 'Latest mentions', value: fmt(months.at(-1)?.mentions) },
      { label: 'Latest AI volume', value: fmt(months.at(-1)?.volume) },
    ];
    reportSections = [{ title: 'Monthly history', rows: months.slice(-18).reverse().map((row) => [row.month, `${fmt(row.mentions)} mentions · ${fmt(row.volume)} volume`]) }];
    reportSheets = [{ name: 'Monthly history', columns: [{ key: 'month', label: 'Month' }, { key: 'mentions', label: 'Mentions' }, { key: 'volume', label: 'AI Search Volume' }], data: months }];
    reportCsvColumns = [{ key: 'month', label: 'Month' }, { key: 'mentions', label: 'Mentions' }, { key: 'volume', label: 'AI Search Volume' }];
    reportCsvData = months;
  }
  const canExportReport = reportMetrics.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">AI Visibility</h1>
        <p className="text-sm text-slate-400 mt-1">How often a domain/brand is mentioned by LLMs, and who dominates a topic — via DataForSEO LLM Mentions.</p>
      </div>

      <SearchForm
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4"
        btnLabel={mode === 'target' ? 'Analyze' : mode === 'leaderboard' ? 'Get leaderboard' : 'Show trend'}
        btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-violet-600 transition-colors"
      >
        <div className="flex gap-2 mb-2 flex-wrap">
          {(['target', 'leaderboard', 'historical'] as const).map((m) => (
            <a
              key={m}
              href={`/dashboard/ai-visibility?mode=${m}`}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${
                mode === m ? 'bg-violet-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {m === 'target' ? 'My domain/brand' : m === 'leaderboard' ? 'Topic leaderboard' : 'Trend over time'}
            </a>
          ))}
        </div>
        <input type="hidden" name="mode" value={mode} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 flex gap-2">
            <div className="shrink-0">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Type</label>
              <select name="target_type" defaultValue={targetType}
                className="h-[42px] px-3 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800">
                <option value="domain">Domain</option>
                <option value="keyword">Keyword</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
                {mode === 'leaderboard' ? 'Topic' : 'Target'}
              </label>
              <input
                name="target"
                type="text"
                defaultValue={displayTarget}
                placeholder={targetType === 'domain' ? 'example.com' : mode === 'leaderboard' ? 'best plumber' : 'your brand name'}
                required
                className="w-full h-[42px] px-4 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          {mode === 'historical' ? (
            <HistoricalTargetingFields
              defaultPlatform={platform}
              defaultLocation={location}
              defaultLanguage={language}
              defaultDateFrom={dateFrom}
              defaultDateTo={dateTo}
            />
          ) : (
            <>
              <MentionTargetingFields defaultPlatform={platform} defaultLocation={location} defaultLanguage={language} />

              {mode === 'leaderboard' && (
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Results per list</label>
                  <select name="limit" defaultValue={String(limit)}
                    className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800">
                    {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {canExportReport && (
        <div className="flex items-center justify-between gap-4 border-y border-slate-100 dark:border-slate-800 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Export current report</p>
          <div className="flex items-center gap-3">
            <ReportPdfExportButton brandName={brandName} brandLogoUrl={brandLogoUrl} brandColor={brand.color} brandFooter={brand.footer} brandStyle={brand} filename={`ai-visibility-${reportSlug}.pdf`}
              title="AI visibility report" subject={displayTarget} generatedAt={reportDate} metrics={reportMetrics} sections={reportSections} />
            <ExportExcelButton sheets={reportSheets} filename={`ai-visibility-${reportSlug}.xls`} />
            <ExportCSVButton data={reportCsvData} columns={reportCsvColumns} filename={`ai-visibility-${reportSlug}.csv`} />
          </div>
        </div>
      )}

      {hasQuery && !error && mode === 'target' && targetResult && (
        <div id="results" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Target</span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{displayTarget}</span>
            {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
            {cost !== undefined && <span className="text-[10px] font-mono text-slate-400 ml-auto">cost: ${cost.toFixed(4)}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total mentions</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{fmt(agg?.total?.mentions)}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">AI search volume</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{fmt(agg?.total?.ai_search_volume)}</p>
            </div>
          </div>

          {(!agg?.total || agg.total.mentions === 0) ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-6 py-12 text-center text-sm text-slate-400">
              No LLM mentions found for this target on {PLATFORM_LABELS[platform]}.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BreakdownList title="By platform" items={agg?.platform} />
              <BreakdownList title="By location" items={agg?.location} formatKey={labsLocationLabel} />
              <BreakdownList title="By language" items={agg?.language} />
              <BreakdownList title="Top referring source domains" items={agg?.sources_domain} />
              <BreakdownList title="Top search-result domains" items={agg?.search_results_domain} />
              <BreakdownList title="Brand entities mentioned alongside" items={agg?.brand_entities_title} />
              <BreakdownList title="Brand entity categories" items={agg?.brand_entities_category} />
            </div>
          )}
        </div>
      )}

      {hasQuery && !error && mode === 'leaderboard' && leaderboardResult && (
        <div id="results">
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Topic</span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{displayTarget}</span>
            {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
            {cost !== undefined && <span className="text-[10px] font-mono text-slate-400 ml-auto">cost: ${cost.toFixed(4)}</span>}
          </div>
          <LeaderboardTables
            domains={leaderboardResult.domains}
            brands={leaderboardResult.brands}
            domainAggregates={leaderboardResult.domainsAggregatedMetrics}
            brandAggregates={leaderboardResult.brandsAggregatedMetrics}
            domainsTotalCount={leaderboardResult.domainsTotalCount}
            brandsTotalCount={leaderboardResult.brandsTotalCount}
            topic={displayTarget}
          />
        </div>
      )}

      {hasQuery && !error && mode === 'historical' && historicalResult && (
        <div id="results" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Target</span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{displayTarget}</span>
            {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
            {cost !== undefined && <span className="text-[10px] font-mono text-slate-400 ml-auto">cost: ${cost.toFixed(4)}</span>}
          </div>

          {historicalResult.items.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-6 py-12 text-center text-sm text-slate-400">
              No historical LLM mentions found for this target on {PLATFORM_LABELS[platform]}.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Months tracked</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{historicalResult.items.length}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total mentions</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                    {fmt(historicalResult.items.reduce((s, i) => s + i.metrics.mentions, 0))}
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total AI search volume</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                    {fmt(historicalResult.items.reduce((s, i) => s + i.metrics.ai_search_volume, 0))}
                  </p>
                </div>
              </div>

              <MonthlyTrendChart title="Mentions per month" items={historicalResult.items} metric="mentions" />
              <MonthlyTrendChart title="AI search volume per month" items={historicalResult.items} metric="ai_search_volume" />
            </>
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
              return (
                <a key={entry.id} href={`/dashboard/ai-visibility?history_id=${entry.id}&mode=${entry.mode}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.target}</p>
                      <span className="text-[10px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                        {entry.mode === 'target' ? 'Overview' : entry.mode === 'leaderboard' ? 'Leaderboard' : 'Trend'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {PLATFORM_LABELS[entry.platform] ?? entry.platform}
                      {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(AiVisibilityPage);
