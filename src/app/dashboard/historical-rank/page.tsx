import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import { getCredentials, getHistRankHistory, saveHistRankSearch, getHistRankResults, getSetting, type HistRankSearchEntry } from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import { cleanDomain, parseDomainList } from '@/lib/labs';
import RankDistributionChart from './RankDistributionChart';
import TrendChart from './TrendChart';
import MonthlyTable from './MonthlyTable';
import DeleteHistoryButton from '@/components/DeleteHistoryButton';
import {
  HISTORICAL_RANK_START, formatMonth, histCost, pctChange, sortSeries, top10,
  type DomainSeries, type HistRankItem,
} from './hist-shared';

interface SearchParams {
  target?: string;
  compare?: string;
  location?: string;
  language?: string;
  date_from?: string;
  date_to?: string;
  ignore_synonyms?: string;
  submitted?: string;
  prefill?: string;
  history_id?: string;
}

interface Query {
  targets: string[];
  location: string;
  language: string;
  dateFrom: string;
  dateTo: string;
  ignoreSynonyms: boolean;
}

/** Saved in the history `params` column. */
interface SavedParams { ignore_synonyms?: boolean; compare?: string[] }

const MAX_COMPARE = 2;

async function fetchHistRank(target: string, q: Query, login: string, pass: string): Promise<{ items: HistRankItem[]; cost: number; error?: string }> {
  const body: Record<string, unknown> = {
    target,
    location_name: q.location,
    language_name: q.language,
    date_from: q.dateFrom,
    date_to: q.dateTo,
    correlate: true,
  };
  if (q.ignoreSynonyms) body.ignore_synonyms = true;
  const { result, cost, error } = await callDataForSeoFirst<{ items?: HistRankItem[] }>(
    'dataforseo_labs/google/historical_rank_overview/live', body, { login, pass },
  );
  if (error) return { items: [], cost: 0, error };
  return { items: result?.items ?? [], cost: cost ?? 0 };
}

function dedupeIdFor(target: string, q: Query) {
  // Keep the legacy key for default options so old history entries are reused.
  const base = ['historical-rank', target, q.location, q.language, q.dateFrom, q.dateTo];
  return stableSearchId(q.ignoreSynonyms ? [...base, 'core-only'] : base);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value: string | undefined, fallback: string, max: string) {
  const date = value?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fallback;
  if (date < HISTORICAL_RANK_START) return HISTORICAL_RANK_START;
  if (date > max) return max;
  return date;
}

function parseSaved(entry?: HistRankSearchEntry): SavedParams {
  if (!entry?.params) return {};
  try { return JSON.parse(entry.params) as SavedParams; } catch { return {}; }
}

function fmt(v?: number) { return Math.round(v ?? 0).toLocaleString('en-GB'); }

function KpiCard({ label, value, from, to, hint, money }: { label: string; value?: number; from?: number; to?: number; hint?: string; money?: boolean }) {
  const pct = pctChange(from, to);
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest" title={hint}>
        <span className={hint ? 'underline decoration-dotted underline-offset-[3px] cursor-help' : undefined}>{label}</span>
      </p>
      <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums mt-0.5">{money ? '$' : ''}{fmt(value)}</p>
      {pct !== null && (
        <p className={`text-[11px] font-bold ${pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(1)}% <span className="font-normal text-slate-400">over the period</span>
        </p>
      )}
    </div>
  );
}

const inputCls = 'w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-medium text-slate-900 dark:text-white transition-all';
const labelCls = 'text-[10px] font-black text-slate-400 uppercase tracking-widest';

async function HistoricalRankPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  let history = getHistRankHistory();
  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'France');
  const defaultLanguage = getSetting('default_language') ?? 'French';
  const defaultDomain = getSetting('default_domain') ?? '';

  const params = await searchParams;
  const historyId = params.history_id;
  const prefill = params.prefill === '1';
  const selected = historyId ? history.find((entry) => entry.id === historyId) : undefined;
  const saved = parseSaved(selected);
  const maxDate = todayIso();

  const q: Query = selected
    ? {
      targets: [selected.target, ...(saved.compare ?? [])],
      location: selected.location,
      language: selected.language,
      dateFrom: selected.dateFrom ?? HISTORICAL_RANK_START,
      dateTo: selected.dateTo ?? maxDate,
      ignoreSynonyms: saved.ignore_synonyms === true,
    }
    : {
      targets: [
        ...new Set([
          cleanDomain(params.target ?? ''),
          ...parseDomainList(params.compare, MAX_COMPARE),
        ].filter(Boolean)),
      ].slice(0, MAX_COMPARE + 1),
      location: params.location ?? defaultLocation,
      language: params.language ?? defaultLanguage,
      dateFrom: normalizeDate(params.date_from, HISTORICAL_RANK_START, maxDate),
      dateTo: normalizeDate(params.date_to, maxDate, maxDate),
      ignoreSynonyms: params.ignore_synonyms === '1',
    };
  const mainTarget = q.targets[0] ?? '';

  const series: DomainSeries[] = [];
  const errors: string[] = [];
  let cost = 0;
  let paidCalls = 0;
  let ran = false;

  if (q.dateFrom > q.dateTo) {
    errors.push('Choose a start date on or before the end date.');
  } else if (selected) {
    ran = true;
    // The main series is the history entry itself; compared domains come from their own cached entries.
    for (const [i, t] of q.targets.entries()) {
      const id = i === 0 ? selected.id : dedupeIdFor(t, q);
      const items = getHistRankResults<HistRankItem>(id);
      if (items) series.push({ target: t, items: sortSeries(items) });
      else errors.push(`No saved data for ${t} with these settings.`);
    }
    cost = selected.cost ?? 0;
  } else if (mainTarget && !prefill) {
    if (!creds) {
      errors.push('DataForSEO credentials missing. Configure them in Settings.');
    } else {
      ran = true;
      // One call per domain; each is cached and saved on its own so it can be reused in other comparisons.
      const results = await Promise.all(q.targets.map(async (t, i) => {
        const id = dedupeIdFor(t, q);
        const cached = getHistRankResults<HistRankItem>(id);
        if (cached) return { t, items: cached, cost: 0 };
        try {
          const r = await fetchHistRank(t, q, creds.login, creds.pass);
          if (r.error) return { t, error: r.error };
          const savedParams: SavedParams = { ignore_synonyms: q.ignoreSynonyms || undefined, compare: i === 0 && q.targets.length > 1 ? q.targets.slice(1) : undefined };
          saveHistRankSearch({
            id, ts: Date.now(), target: t, location: q.location, language: q.language,
            dateFrom: q.dateFrom, dateTo: q.dateTo, cost: r.cost, params: JSON.stringify(savedParams),
          }, r.items);
          return { t, items: r.items, cost: r.cost, paid: true };
        } catch (e) {
          return { t, error: String(e) };
        }
      }));
      for (const r of results) {
        if ('error' in r && r.error) errors.push(`${r.t}: ${r.error}`);
        else if (r.items) {
          series.push({ target: r.t, items: sortSeries(r.items) });
          cost += r.cost ?? 0;
          if ('paid' in r && r.paid) paidCalls += 1;
        }
      }
      history = getHistRankHistory();
    }
  }

  const main = series.find((s) => s.target === mainTarget)?.items ?? [];
  const first = main[0];
  const last = main[main.length - 1];
  const uncachedCount = q.targets.filter((t) => !getHistRankResults(dedupeIdFor(t, q))).length;
  const geo = { location: q.location, language: q.language, prefill: '1' };
  const link = (path: string, p: Record<string, string>) => `${path}?${new URLSearchParams(p).toString()}`;

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Historical Rank Overview</h1>
        <p className="text-slate-500 text-sm mt-1 font-medium dark:text-slate-400">
          Month-by-month organic and paid visibility of a domain since October 2020: traffic, ranked keywords, position mix and keyword movements. Compare up to 3 domains.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          <SearchForm
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-4"
            btnLabel={<>Analyze<span className="font-mono text-[10px] opacity-60 ml-1.5">{uncachedCount === 0 && mainTarget ? 'cached' : `≈ $${(histCost(q.dateFrom, q.dateTo) * Math.max(uncachedCount, 1)).toFixed(3)}`}</span></>}
            btnClassName="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-none transition-all disabled:opacity-40"
            disabled={!creds}
          >
            <input type="hidden" name="submitted" value="1" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={labelCls}>Target domain</label>
                <input name="target" type="text" required defaultValue={mainTarget || defaultDomain} placeholder="example.com" className={`${inputCls} font-mono`} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Compare with <span className="normal-case tracking-normal font-medium">(optional, up to {MAX_COMPARE})</span></label>
                <input name="compare" type="text" defaultValue={q.targets.slice(1).join(', ')} placeholder="competitor-a.com, competitor-b.com" className={`${inputCls} font-mono`} />
              </div>
              <LabsLocationLanguageFields defaultLocation={q.location} defaultLanguage={q.language} className={inputCls} wrapperClassName="space-y-1.5" labelClassName={labelCls} />
              <div className="space-y-1.5">
                <label className={labelCls}>From</label>
                <input name="date_from" type="date" defaultValue={q.dateFrom} min={HISTORICAL_RANK_START} max={maxDate} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>To</label>
                <input name="date_to" type="date" defaultValue={q.dateTo} min={HISTORICAL_RANK_START} max={maxDate} className={inputCls} />
              </div>
            </div>
            <label className="inline-flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" name="ignore_synonyms" value="1" defaultChecked={q.ignoreSynonyms} className="mt-1" />
              <span>
                Core keywords only
                <span className="block text-[11px] text-slate-400">Drops near-duplicate keyword variants (DataForSEO&apos;s ignore_synonyms), so counts reflect distinct topics.</span>
              </span>
            </label>
            <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              Data is available from October 2020. This endpoint is priced well above other Labs tools: about $0.12 per domain plus $0.0012 per month returned
              (≈ ${histCost(q.dateFrom, q.dateTo).toFixed(3)} per domain for this range). Domains already fetched with the same settings are reused for free.
            </p>
            {!creds && <p className="text-xs text-amber-600 font-medium">Configure API credentials in Settings first.</p>}
          </SearchForm>

          {prefill && mainTarget && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-sm rounded-2xl px-5 py-3">
              Form prefilled for <span className="font-mono font-bold">{mainTarget}</span>. Nothing has been charged: check the date range (it drives the price), then run the analysis.
            </div>
          )}

          {errors.map((e, i) => <div key={i} className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-2xl px-5 py-3 text-sm">{e}</div>)}

          {ran && main.length === 0 && errors.length === 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl px-6 py-12 text-center text-sm text-slate-400">
              No history for this domain in {q.location} / {q.language}. Try another location or a wider date range.
            </div>
          )}

          {main.length > 0 && first && last && (
            <div id="results" className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap text-xs">
                <span className="font-mono font-black text-slate-900 dark:text-white">{mainTarget}</span>
                <span className="text-slate-400">{q.location} · {q.language} · {formatMonth(first.year, first.month)} → {formatMonth(last.year, last.month)}{q.ignoreSynonyms ? ' · core keywords only' : ''}</span>
                {historyId && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
                <span className="ml-auto text-[10px] font-mono text-slate-400">
                  {historyId ? `cost: $${cost.toFixed(4)}` : paidCalls > 0 ? `cost: $${cost.toFixed(4)} (${paidCalls} call${paidCalls > 1 ? 's' : ''})` : 'from cache · $0'}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Organic traffic" value={last.metrics.organic?.etv} from={first.metrics.organic?.etv} to={last.metrics.organic?.etv} hint="Estimated organic visits per month (ETV), latest month." />
                <KpiCard label="Ranked keywords" value={last.metrics.organic?.count} from={first.metrics.organic?.count} to={last.metrics.organic?.count} hint="Keywords in the organic top 100, latest month." />
                <KpiCard label="Top 10 keywords" value={top10(last.metrics.organic)} from={top10(first.metrics.organic)} to={top10(last.metrics.organic)} hint="Keywords on page one, latest month." />
                <KpiCard label="Traffic value" money value={last.metrics.organic?.estimated_paid_traffic_cost} from={first.metrics.organic?.estimated_paid_traffic_cost} to={last.metrics.organic?.estimated_paid_traffic_cost} hint="What the organic traffic would cost in Google Ads, latest month." />
              </div>

              <TrendChart series={series} />
              <RankDistributionChart points={main} />
              <MonthlyTable items={main} target={mainTarget} />

              <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">How to read this</h2>
                <p>Each month is a snapshot of DataForSEO&apos;s keyword database for {q.location}. <strong className="text-slate-700 dark:text-slate-200">ETV</strong> is modelled traffic (search volume × expected click-through at each position), not analytics data: compare trends, not absolute numbers.</p>
                <p>A traffic drop with a stable keyword count usually means lost top positions (check Top 10 and the position mix); a drop in both points to de-indexed pages, a migration or an algorithm update. <strong className="text-slate-700 dark:text-slate-200">New · Up · Down · Lost</strong> counts keyword movements against the previous month.</p>
                <p>Paid columns show Google Ads activity seen by DataForSEO; 0 means no ads detected, not necessarily no ads running.</p>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold">
                <span className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Next for {mainTarget}</span>
                <a className="text-blue-600 hover:underline" href={link('/dashboard/ranked-keywords', { target: mainTarget, ...geo })}>Current keywords</a>
                <a className="text-blue-600 hover:underline" href={link('/dashboard/competitors', { target: mainTarget, ...geo })}>Competitors</a>
                <a className="text-blue-600 hover:underline" href={link('/dashboard/subdomains', { target: mainTarget, ...geo })}>Subdomains</a>
                <a className="text-blue-600 hover:underline" href={link('/dashboard/backlinks', { target: mainTarget, prefill: '1' })}>Backlinks</a>
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
                  const hp = parseSaved(h);
                  const isActive = h.id === historyId;
                  return (
                    <div key={h.id} className={`flex items-center gap-1 rounded-xl pr-2 transition-colors border ${isActive ? 'border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-900' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-200'}`}>
                      <a href={`?history_id=${h.id}#results`} className="block flex-1 min-w-0 pl-3 py-2.5">
                        <div className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate">
                          {h.target}{hp.compare?.length ? <span className="text-slate-400 font-medium"> vs {hp.compare.join(', ')}</span> : null}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {h.location} · {h.dateFrom && h.dateTo ? `${h.dateFrom.slice(0, 7)} → ${h.dateTo.slice(0, 7)}` : new Date(h.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          {hp.ignore_synonyms ? ' · core' : ''}
                          {h.cost !== undefined ? ` · $${h.cost.toFixed(3)}` : ''}
                        </div>
                      </a>
                      <DeleteHistoryButton table="hist_rank_searches" id={h.id} path="/dashboard/historical-rank" label={h.target} />
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

export default withProjectScope(HistoricalRankPage);
