import { withProjectScope } from '@/lib/db';
import { getCredentials, getSetting, getPageIntersectionHistory, savePageIntersectionSearch, getPageIntersectionResults, type PageIntersectionEntry } from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import { labsCostEstimate } from '@/lib/labs';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import PageIntersectionTable from './PageIntersectionTable';
import { pagePosition, type PageIntersectionItem } from './items';
import DeleteHistoryButton from '@/components/DeleteHistoryButton';

export const dynamic = 'force-dynamic';

interface SearchParams { pages?: string; exclude_pages?: string; mode?: string; location?: string; language?: string; limit?: string; history_id?: string; }

/** Stored in the history `pages` column: a plain array (old saves) or this object. */
interface SavedPages { pages: string[]; exclude?: string[]; mode?: 'intersect' | 'union' }

const MAX_PAGES = 20;

function parseUrls(raw: string | undefined, max: number): string[] {
  return (raw ?? '').split('\n').map((p) => p.trim()).filter(Boolean).slice(0, max);
}

function readSaved(json: string): SavedPages {
  try {
    const v = JSON.parse(json) as string[] | SavedPages;
    return Array.isArray(v) ? { pages: v } : v;
  } catch { return { pages: [] }; }
}

async function fetchIntersection(s: SavedPages, location: string, language: string, limit: number, login: string, pass: string): Promise<{ items: PageIntersectionItem[]; total?: number; cost?: number; error?: string }> {
  // `pages` is an object keyed "1".."20"; results come back under intersection_result with the same keys.
  const body: Record<string, unknown> = {
    pages: Object.fromEntries(s.pages.map((url, i) => [String(i + 1), url])),
    location_name: location,
    language_name: language,
    limit,
    intersection_mode: s.mode ?? 'intersect',
    item_types: ['organic'],
    order_by: ['keyword_data.keyword_info.search_volume,desc'],
  };
  if (s.exclude?.length) body.exclude_pages = s.exclude;
  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: PageIntersectionItem[] }>(
    'dataforseo_labs/google/page_intersection/live', body, { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], total: result?.total_count, cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

const inputCls = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800';
const labelCls = 'block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5';

async function PageIntersectionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'France');
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const rawPages = params.pages?.trim() ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const limit = Math.min(parseInt(params.limit ?? '100', 10) || 100, 1000);
  const historyId = params.history_id;

  let items: PageIntersectionItem[] = [];
  let total: number | undefined;
  let cost: number | undefined;
  let error: string | null = null;
  let query: SavedPages = {
    pages: parseUrls(rawPages, MAX_PAGES),
    exclude: parseUrls(params.exclude_pages, 20),
    mode: params.mode === 'union' ? 'union' : 'intersect',
  };
  let activeEntry: PageIntersectionEntry | null = null;

  if (historyId) {
    const saved = getPageIntersectionResults<PageIntersectionItem>(historyId);
    if (saved) {
      items = saved;
      activeEntry = getPageIntersectionHistory().find((e) => e.id === historyId) ?? null;
      query = readSaved(activeEntry?.pages ?? '[]');
    } else error = 'Search no longer available.';
  } else if (rawPages) {
    const bad = query.pages.find((p) => !/^https?:\/\//i.test(p));
    if (query.pages.length < 1) error = 'Enter at least one URL.';
    else if (query.mode === 'intersect' && query.pages.length < 2) error = 'Enter at least 2 URLs to intersect (or switch to “Union”).';
    else if (bad) error = `URLs must be absolute (https://…): ${bad}`;
    else {
      const dedupeId = stableSearchId(['page-intersection-v2', JSON.stringify(query), location, language, limit]);
      const cached = getPageIntersectionResults<PageIntersectionItem>(dedupeId);

      if (cached) {
        items = cached;
        cost = getPageIntersectionHistory().find((e) => e.id === dedupeId)?.cost;
      } else if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
      else {
        const result = await fetchIntersection(query, location, language, limit, creds.login, creds.pass);
        items = result.items; total = result.total; cost = result.cost; error = result.error ?? null;
        if (!error && items.length > 0) {
          const entry: PageIntersectionEntry = { id: dedupeId, ts: Date.now(), pages: JSON.stringify(query), location, language, count: items.length, cost };
          savePageIntersectionSearch(entry, items);
        }
      }
    }
  }

  const pageList = query.pages;
  const history = getPageIntersectionHistory();
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;

  const csvData = items.map((item) => ({
    keyword: item.keyword_data?.keyword ?? '',
    search_volume: item.keyword_data?.keyword_info?.search_volume ?? '',
    kd: item.keyword_data?.keyword_properties?.keyword_difficulty ?? item.keyword_difficulty ?? '',
    ...Object.fromEntries(pageList.map((_, i) => [`pos_${i + 1}`, pagePosition(item, i) ?? ''])),
  }));
  const csvColumns = [{ key: 'keyword', label: 'Keyword' }, { key: 'search_volume', label: 'Volume' }, { key: 'kd', label: 'KD' }, ...pageList.map((p, i) => ({ key: `pos_${i + 1}`, label: `Pos. ${p}` }))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Page Intersection</h1>
        <p className="text-sm text-slate-400 mt-1">
          Keywords several pages rank for in the same Google results. Use it to spot cannibalisation between your own pages, or to see what a set of competitor pages all rank for.
        </p>
      </div>

      <SearchForm
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4"
        btnLabel={<>Find keywords<span className="font-mono text-[10px] opacity-50 ml-1.5">≤ ${labsCostEstimate(limit).toFixed(3)}</span></>}
        btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Page URLs <span className="normal-case font-normal tracking-normal text-slate-300">(up to {MAX_PAGES}, one per line; end with * to match a whole section, e.g. https://site.com/blog/*)</span></label>
            <textarea name="pages" rows={4} defaultValue={pageList.join('\n')} placeholder={'https://example.com/page-a\nhttps://competitor.com/blog/*'} required
              className={`${inputCls} font-mono resize-y`} />
          </div>
          <div>
            <label className={labelCls}>Mode</label>
            <select name="mode" defaultValue={query.mode ?? 'intersect'} className={inputCls}>
              <option value="intersect">Intersect: keywords all pages rank for</option>
              <option value="union">Union: keywords any page ranks for</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Exclude pages <span className="normal-case font-normal tracking-normal text-slate-300">(optional)</span></label>
            <textarea name="exclude_pages" rows={2} defaultValue={(query.exclude ?? []).join('\n')} placeholder="https://example.com/*"
              className={`${inputCls} font-mono resize-y text-xs`} />
            <p className="text-[11px] text-slate-400 mt-1">Drop keywords these URLs also rank for: e.g. your own site, to keep only what competitors have and you don&apos;t.</p>
          </div>
          <LabsLocationLanguageFields defaultLocation={displayLocation} defaultLanguage={displayLanguage} className={inputCls} labelClassName={labelCls} />
          <div>
            <label className={labelCls}>Max results</label>
            <select name="limit" defaultValue={String(limit)} className={inputCls}>
              {['50', '100', '200', '500', '1000'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {(historyId || rawPages) && !error && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">
              {items.length}{total !== undefined && total > items.length ? ` of ${total.toLocaleString('en-GB')}` : ''} {query.mode === 'union' ? 'keywords' : 'shared keywords'}
              {query.exclude?.length ? <span className="normal-case tracking-normal font-medium"> · {query.exclude.length} excluded</span> : null}
            </span>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton data={csvData} columns={csvColumns} />
                  <ExportCSVButton data={csvData} filename="page-intersection.csv" columns={csvColumns} />
                </div>
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No common keywords found. Try “Union”, a wildcard (/*) or fewer pages.</div>
          ) : (
            <PageIntersectionTable items={items} pageList={pageList} />
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
              const s = readSaved(entry.pages);
              return (
                <div key={entry.id} className={`flex items-center gap-2 pr-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <a href={`/dashboard/page-intersection?history_id=${entry.id}#results`} className="flex flex-1 min-w-0 items-center gap-4 pl-6 py-3.5">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{s.pages[0]}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{s.pages.length} pages · {s.mode ?? 'intersect'} · {entry.count} keywords{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                  </a>
                  <DeleteHistoryButton table="page_intersection_searches" id={entry.id} path="/dashboard/page-intersection" label={s.pages[0] ?? ''} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(PageIntersectionPage);
