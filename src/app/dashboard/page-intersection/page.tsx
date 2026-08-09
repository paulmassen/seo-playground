import { getCredentials, getSetting, getPageIntersectionHistory, savePageIntersectionSearch, getPageIntersectionResults, type PageIntersectionEntry } from '@/lib/db';
import { LANGUAGES } from '@/lib/geo-options';
import { stableSearchId } from '@/lib/dedupe';
import LocationPicker from '@/components/LocationPicker';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import PageIntersectionTable from './PageIntersectionTable';

interface RankedItem { url?: string; rank_absolute?: number; }
interface IntersectionItem {
  keyword_data?: { keyword?: string; keyword_info?: { search_volume?: number; cpc?: number } };
  ranked_serp_element?: { items?: RankedItem[] };
  keyword_difficulty?: number;
}

interface SearchParams { pages?: string; location?: string; language?: string; limit?: string; history_id?: string; }

async function fetchIntersection(pages: string[], location: string, language: string, limit: number, login: string, pass: string): Promise<{ items: IntersectionItem[]; cost?: number; error?: string }> {
  const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/page_intersection/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${login}:${pass}`)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ pages: pages.map((url) => ({ url, type: 'url' })), location_name: location, language_name: language, limit, intersections: true }]),
  });
  if (!res.ok) return { items: [], error: `HTTP ${res.status}` };
  const data = await res.json() as { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: IntersectionItem[] }> }> };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

export default async function PageIntersectionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const rawPages = params.pages?.trim() ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const limit = Math.min(parseInt(params.limit ?? '100', 10) || 100, 1000);
  const historyId = params.history_id;

  let items: IntersectionItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let pageList: string[] = [];
  let activeEntry: PageIntersectionEntry | null = null;

  if (historyId) {
    const saved = getPageIntersectionResults<IntersectionItem>(historyId);
    if (saved) {
      items = saved;
      activeEntry = getPageIntersectionHistory().find((e) => e.id === historyId) ?? null;
      pageList = JSON.parse(activeEntry?.pages ?? '[]') as string[];
    } else error = 'Search no longer available.';
  } else if (rawPages) {
    pageList = rawPages.split('\n').map((p) => p.trim()).filter(Boolean).slice(0, 5);
    if (pageList.length < 2) { error = 'Enter at least 2 URLs (one per line).'; }
    else {
      const dedupeId = stableSearchId(['page-intersection', ...pageList, location, language, limit]);
      const cached = getPageIntersectionResults<IntersectionItem>(dedupeId);

      if (cached) {
        items = cached;
        const cachedEntry = getPageIntersectionHistory().find((e) => e.id === dedupeId);
        cost = cachedEntry?.cost;
      } else if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
      else {
        const result = await fetchIntersection(pageList, location, language, limit, creds.login, creds.pass);
        items = result.items; cost = result.cost; error = result.error ?? null;
        if (!error && items.length > 0) {
          const entry: PageIntersectionEntry = { id: dedupeId, ts: Date.now(), pages: JSON.stringify(pageList), location, language, count: items.length, cost };
          savePageIntersectionSearch(entry, items);
        }
      }
    }
  }

  const history = getPageIntersectionHistory();
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;

  const csvData = items.map((item) => {
    const ranked = item.ranked_serp_element?.items ?? [];
    return {
      keyword: item.keyword_data?.keyword ?? '',
      search_volume: item.keyword_data?.keyword_info?.search_volume ?? '',
      kd: item.keyword_difficulty ?? '',
      ...Object.fromEntries(pageList.map((p, i) => [`pos_${i + 1}`, ranked[i]?.rank_absolute ?? ''])),
    };
  });
  const csvColumns = [{ key: 'keyword', label: 'Keyword' }, { key: 'search_volume', label: 'Volume' }, { key: 'kd', label: 'KD' }, ...pageList.map((_, i) => ({ key: `pos_${i + 1}`, label: `Pos. Page ${i + 1}` }))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Page Intersection</h1>
        <p className="text-sm text-slate-400 mt-1">Find keywords that multiple pages rank for simultaneously.</p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Find intersection" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Page URLs <span className="normal-case font-normal tracking-normal text-slate-300">(2–5 URLs, one per line)</span></label>
            <textarea name="pages" rows={4} defaultValue={activeEntry ? pageList.join('\n') : rawPages} placeholder={"https://example.com/page-a\nhttps://example.com/page-b"} required
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-y bg-white dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
            <LocationPicker name="location" defaultValue={displayLocation} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800" scope="labs" />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
            <select name="language" defaultValue={displayLanguage} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800">
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Max results</label>
            <select name="limit" defaultValue={String(limit)} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800">
              {['50','100','200','500'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {(historyId || rawPages) && !error && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">{items.length} shared keywords</span>
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
            <div className="px-6 py-12 text-center text-sm text-slate-400">No common keywords found.</div>
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
              const urls = JSON.parse(entry.pages) as string[];
              return (
                <a key={entry.id} href={`/dashboard/page-intersection?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{urls[0]}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{urls.length} pages · {entry.count} keywords{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
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
