import { withProjectScope } from '@/lib/db';
import { getCredentials, getSetting, getTrafficEstimationHistory, saveTrafficEstimationSearch, getTrafficEstimationResults, type TrafficEstimationEntry } from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import { cleanDomain, labsCostEstimate } from '@/lib/labs';
import TrafficEstimationTable, { type TrafficItem } from './TrafficEstimationTable';
import DeleteHistoryButton from '@/components/DeleteHistoryButton';

export const dynamic = 'force-dynamic';

interface SearchParams { targets?: string; location?: string; language?: string; ignore_synonyms?: string; history_id?: string; prefill?: string; }

const MAX_TARGETS = 1000;

/** Domains are cleaned (no scheme, no www); full URLs are kept as-is so a single page can be estimated. */
function parseTargets(raw: string): string[] {
  const seen = new Set<string>();
  for (const line of raw.split(/[\n,;]+/)) {
    const t = line.trim();
    if (!t) continue;
    let isPage = false;
    try { isPage = /^https?:\/\//i.test(t) && new URL(t).pathname.length > 1; } catch { isPage = false; }
    const v = isPage ? t : cleanDomain(t);
    if (v) seen.add(v);
    if (seen.size >= MAX_TARGETS) break;
  }
  return [...seen];
}

async function fetchTraffic(targets: string[], location: string, language: string, ignoreSynonyms: boolean, login: string, pass: string): Promise<{ items: TrafficItem[]; cost?: number; error?: string }> {
  const body: Record<string, unknown> = {
    targets,
    location_name: location,
    language_name: language,
    item_types: ['organic', 'paid', 'featured_snippet', 'local_pack'],
  };
  if (ignoreSynonyms) body.ignore_synonyms = true;
  const { result, cost, error } = await callDataForSeoFirst<{ items?: TrafficItem[] }>(
    'dataforseo_labs/google/bulk_traffic_estimation/live', body, { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

const inputCls = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800';

async function TrafficEstimationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'France');
  const defaultLanguage = getSetting('default_language') ?? 'French';
  const historyId = params.history_id;
  const prefill = params.prefill === '1';

  let activeEntry: TrafficEstimationEntry | null = historyId ? getTrafficEstimationHistory().find((e) => e.id === historyId) ?? null : null;
  const saved = activeEntry?.params ? (JSON.parse(activeEntry.params) as SearchParams) : null;

  let targetList: string[] = activeEntry ? activeEntry.targets.split(', ').filter(Boolean) : parseTargets(params.targets ?? '');
  const location = activeEntry?.location ?? params.location ?? defaultLocation;
  const language = activeEntry?.language ?? params.language ?? defaultLanguage;
  const ignoreSynonyms = (saved ?? params).ignore_synonyms === '1';

  let items: TrafficItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let ran = false;

  if (historyId) {
    const savedItems = getTrafficEstimationResults<TrafficItem>(historyId);
    if (savedItems && activeEntry) { items = savedItems; cost = activeEntry.cost; ran = true; }
    else error = 'Search no longer available.';
  } else if (targetList.length > 0 && !prefill) {
    const dedupeId = stableSearchId(['traffic-estimation-v2', location, language, ignoreSynonyms, ...targetList]);
    const cached = getTrafficEstimationResults<TrafficItem>(dedupeId);
    ran = true;

    if (cached) {
      items = cached;
      activeEntry = getTrafficEstimationHistory().find((e) => e.id === dedupeId) ?? null;
      cost = activeEntry?.cost;
    } else if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
    else {
      const result = await fetchTraffic(targetList, location, language, ignoreSynonyms, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        saveTrafficEstimationSearch({
          id: dedupeId, ts: Date.now(), targets: targetList.join(', '), location, language, count: items.length, cost,
          params: JSON.stringify({ ignore_synonyms: ignoreSynonyms ? '1' : undefined }),
        }, items);
      }
    }
  }

  if (activeEntry && targetList.length === 0) targetList = activeEntry.targets.split(', ');
  const history = getTrafficEstimationHistory();
  const estimate = labsCostEstimate(Math.max(targetList.length, 1));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Traffic Estimation</h1>
        <p className="text-sm text-slate-400 mt-1">
          Compare up to {MAX_TARGETS.toLocaleString('en-GB')} domains, subdomains or pages in one call: estimated organic traffic, Google Ads, featured snippets and local pack, side by side.
        </p>
      </div>

      <SearchForm
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4"
        btnLabel={<>Estimate<span className="font-mono text-[10px] opacity-50 ml-1.5">~${estimate.toFixed(3)}{targetList.length ? ` for ${targetList.length}` : ''}</span></>}
        btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Targets <span className="normal-case font-normal tracking-normal text-slate-300">(one per line: domain, subdomain, or full page URL)</span></label>
            <textarea name="targets" rows={6} defaultValue={targetList.join('\n')} placeholder={'example.com\nblog.competitor.com\nhttps://www.another.fr/pricing/'} required
              className={`${inputCls} font-mono resize-y`} />
            <p className="text-[11px] text-slate-400 mt-1">Cost: $0.012 per call + $0.00012 per target. Pasting your Competitors export here is a cheap way to size a whole market.</p>
          </div>
          <LabsLocationLanguageFields defaultLocation={location} defaultLanguage={language} className={inputCls} />
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer sm:col-span-2" title="Count one keyword per group of near-identical variants.">
            <input type="checkbox" name="ignore_synonyms" value="1" defaultChecked={ignoreSynonyms} /> Skip near-duplicate keywords
          </label>
        </div>
      </SearchForm>

      {prefill && targetList.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 text-blue-700 dark:text-blue-300 text-sm rounded-xl px-4 py-3">
          Form prefilled with {targetList.length} target{targetList.length > 1 ? 's' : ''}. Nothing has been charged: run the estimate when ready.
        </div>
      )}

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {ran && !error && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No results found.</div>
          ) : (
            <TrafficEstimationTable items={items} cost={cost} fromHistory={!!historyId} location={location} language={language} />
          )}
        </div>
      )}

      {ran && !error && items.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 text-sm text-slate-600 dark:text-slate-400 space-y-1.5">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">How to read this</h2>
          <p><strong className="text-slate-800 dark:text-slate-200">Organic traffic (ETV)</strong> is a model: search volume × expected click-through rate at each ranking, summed. Compare sites with it; don&apos;t read it as analytics data.</p>
          <p><strong className="text-slate-800 dark:text-slate-200">Share</strong> is each target&apos;s part of the organic traffic of the whole list: a rough share of voice when the list is a set of competitors.</p>
          <p><strong className="text-slate-800 dark:text-slate-200">Local pack</strong> and <strong className="text-slate-800 dark:text-slate-200">featured snippets</strong> are counted apart from organic: a high local-pack figure means Google Maps visibility matters for this site.</p>
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
                <div key={entry.id} className={`flex items-center gap-2 pr-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <a href={`/dashboard/traffic-estimation?history_id=${entry.id}#results`} className="flex flex-1 min-w-0 items-center gap-4 pl-6 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.targets}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{entry.count} targets · {entry.location}{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                  </a>
                  <DeleteHistoryButton table="traffic_estimation_searches" id={entry.id} path="/dashboard/traffic-estimation" label={entry.targets} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(TrafficEstimationPage);
