export const dynamic = 'force-dynamic';

import {
  getCredentials,
  getWebMentionsHistory,
  saveWebMentionsSearch,
  getWebMentionsItems,
  getWebMentionsSummary,
  type WebMentionsEntry,
} from '@/lib/db';
import { stableSearchId } from '@/lib/dedupe';
import SearchForm from '@/components/SearchForm';

// ---- Types ----

const PAGE_TYPES = ['ecommerce', 'news', 'blogs', 'message-boards', 'organization'] as const;
type PageType = typeof PAGE_TYPES[number];

interface SentimentConnotations { anger?: number; happiness?: number; love?: number; sadness?: number; share?: number; fun?: number; }
interface ConnotationTypes { positive?: number; negative?: number; neutral?: number; }

interface MentionItem {
  url?: string;
  domain?: string;
  main_domain?: string;
  country?: string;
  language?: string;
  fetch_time?: string;
  content_info?: {
    title?: string;
    snippet?: string;
    author?: string | null;
    date_published?: string | null;
    sentiment_connotations?: SentimentConnotations;
    connotation_types?: ConnotationTypes;
  };
}

interface SearchResult {
  total_count: number;
  items_count: number;
  items: MentionItem[];
}

interface SummaryResult {
  total_count: number;
  top_domains?: { domain: string; count: number }[];
  sentiment_connotations?: Record<string, number>;
  connotation_types?: Record<string, number>;
  countries?: Record<string, number>;
  languages?: Record<string, number>;
}

interface SearchParams {
  keyword?: string;
  page_type?: string | string[];
  limit?: string;
  history_id?: string;
}

// ---- API ----

function normalizePageTypes(value: string | string[] | undefined): PageType[] {
  const arr = Array.isArray(value) ? value : value ? [value] : [];
  return arr.filter((v): v is PageType => (PAGE_TYPES as readonly string[]).includes(v));
}

async function fetchWebMentions(
  keyword: string, pageTypes: PageType[], limit: number, login: string, pass: string,
): Promise<{ items?: SearchResult; summary?: SummaryResult; cost?: number; error?: string }> {
  const auth = btoa(`${login}:${pass}`);
  const headers = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };

  const searchBody: Record<string, unknown> = { keyword, limit };
  const summaryBody: Record<string, unknown> = { keyword, internal_list_limit: 10 };
  if (pageTypes.length > 0) {
    searchBody.page_type = pageTypes;
    summaryBody.page_type = pageTypes;
  }

  const [searchRes, summaryRes] = await Promise.all([
    fetch('https://api.dataforseo.com/v3/content_analysis/search/live', {
      method: 'POST', headers, body: JSON.stringify([searchBody]),
    }),
    fetch('https://api.dataforseo.com/v3/content_analysis/summary/live', {
      method: 'POST', headers, body: JSON.stringify([summaryBody]),
    }),
  ]);

  if (!searchRes.ok) return { error: `API error ${searchRes.status}: ${searchRes.statusText}` };
  if (!summaryRes.ok) return { error: `API error ${summaryRes.status}: ${summaryRes.statusText}` };

  type Envelope<T> = { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: T[] }> };

  const searchData = await searchRes.json() as Envelope<SearchResult>;
  const summaryData = await summaryRes.json() as Envelope<SummaryResult>;

  const searchTask = searchData?.tasks?.[0];
  const summaryTask = summaryData?.tasks?.[0];
  if (!searchTask || !summaryTask) return { error: 'Empty API response.' };
  if (searchTask.status_code && searchTask.status_code !== 20000) return { error: `DataForSEO: ${searchTask.status_message}` };
  if (summaryTask.status_code && summaryTask.status_code !== 20000) return { error: `DataForSEO: ${summaryTask.status_message}` };

  return {
    items: searchTask.result?.[0],
    summary: summaryTask.result?.[0],
    cost: (searchTask.cost ?? 0) + (summaryTask.cost ?? 0),
  };
}

// ---- UI helpers ----

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }

function formatDate(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dominantSentiment(c?: ConnotationTypes): 'positive' | 'negative' | 'neutral' | null {
  if (!c) return null;
  const entries: Array<['positive' | 'negative' | 'neutral', number]> = [
    ['positive', c.positive ?? 0], ['negative', c.negative ?? 0], ['neutral', c.neutral ?? 0],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][1] > 0 ? entries[0][0] : null;
}

const SENTIMENT_STYLE: Record<string, string> = {
  positive: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 border-emerald-100 dark:border-emerald-900',
  negative: 'text-red-600 bg-red-50 dark:bg-red-950 border-red-100 dark:border-red-900',
  neutral: 'text-slate-500 bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700',
};

function SentimentBadge({ connotations }: { connotations?: ConnotationTypes }) {
  const dom = dominantSentiment(connotations);
  if (!dom) return null;
  return (
    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${SENTIMENT_STYLE[dom]}`}>
      {dom}
    </span>
  );
}

function DistributionBars({ title, data, total }: { title: string; data?: Record<string, number>; total: number }) {
  const entries = Object.entries(data ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
      <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">{title}</h2>
      <div className="space-y-2">
        {entries.slice(0, 8).map(([key, value]) => {
          const pct = Math.round((value / max) * 100);
          const share = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate capitalize">{key}</span>
                <span className="text-xs font-mono text-slate-500 shrink-0">{fmt(value)} ({share}%)</span>
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

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// ---- Page ----

export default async function WebMentionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const keyword = (params.keyword ?? '').trim();
  const pageTypes = normalizePageTypes(params.page_type);
  const limit = Math.min(Math.max(parseInt(params.limit ?? '20', 10) || 20, 1), 100);

  let searchResult: SearchResult | null = null;
  let summaryResult: SummaryResult | null = null;
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: WebMentionsEntry | null = null;

  if (historyId) {
    searchResult = getWebMentionsItems<SearchResult>(historyId);
    summaryResult = getWebMentionsSummary<SummaryResult>(historyId);
    if (searchResult && summaryResult) {
      isFromHistory = true;
      activeEntry = getWebMentionsHistory().find((e) => e.id === historyId) ?? null;
    } else {
      error = 'This search is no longer available.';
    }
  } else if (keyword) {
    if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const dedupeId = stableSearchId(['web-mentions', keyword, pageTypes.join(','), limit]);
      const cachedItems = getWebMentionsItems<SearchResult>(dedupeId);
      const cachedSummary = getWebMentionsSummary<SummaryResult>(dedupeId);

      if (cachedItems && cachedSummary) {
        searchResult = cachedItems;
        summaryResult = cachedSummary;
        cost = getWebMentionsHistory().find((e) => e.id === dedupeId)?.cost;
      } else {
        const res = await fetchWebMentions(keyword, pageTypes, limit, creds.login, creds.pass);
        error = res.error ?? null;
        cost = res.cost;

        if (!error && res.items && res.summary) {
          searchResult = res.items;
          summaryResult = res.summary;

          const entry: WebMentionsEntry = {
            id: dedupeId, ts: Date.now(), keyword, pageTypes: pageTypes.join(','), limit,
            totalCount: res.items.total_count, cost,
          };
          saveWebMentionsSearch(entry, res.items, res.summary);
        }
      }
    }
  }

  const history = getWebMentionsHistory();
  const hasQuery = !!(historyId || keyword);
  const displayKeyword = activeEntry?.keyword ?? keyword;
  const items = searchResult?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Web Mentions</h1>
        <p className="text-sm text-slate-400 mt-1">Brand sentiment across the web — mentions, sentiment split, and geo/domain breakdown via DataForSEO Content Analysis.</p>
      </div>

      <SearchForm
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4"
        btnLabel="Analyze"
        btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-violet-600 transition-colors"
        loadingLabel="Scanning the web…"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Keyword or brand</label>
            <input
              name="keyword"
              type="text"
              defaultValue={displayKeyword}
              placeholder="your brand name"
              required
              className="w-full h-[42px] px-4 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Results limit</label>
            <select name="limit" defaultValue={String(limit)}
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800">
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Page types</label>
            <div className="flex flex-wrap gap-3">
              {PAGE_TYPES.map((pt) => (
                <label key={pt} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <input type="checkbox" name="page_type" value={pt} defaultChecked={pageTypes.includes(pt)}
                    className="rounded border-slate-300 dark:border-slate-600 text-violet-600 focus:ring-violet-500" />
                  {pt}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Leave all unchecked to search every page type.</p>
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {hasQuery && !error && searchResult && summaryResult && (
        <div id="results" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Keyword</span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{displayKeyword}</span>
            {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
            {cost !== undefined && <span className="text-[10px] font-mono text-slate-400 ml-auto">cost: ${cost.toFixed(4)}</span>}
          </div>

          {summaryResult.total_count === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-6 py-12 text-center text-sm text-slate-400">
              No web mentions found for this keyword.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total mentions</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{fmt(summaryResult.total_count)}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Positive share</p>
                  <p className="text-2xl font-black text-emerald-600 mt-1 tabular-nums">
                    {summaryResult.total_count > 0 ? Math.round(((summaryResult.connotation_types?.positive ?? 0) / summaryResult.total_count) * 100) : 0}%
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Negative share</p>
                  <p className="text-2xl font-black text-red-600 mt-1 tabular-nums">
                    {summaryResult.total_count > 0 ? Math.round(((summaryResult.connotation_types?.negative ?? 0) / summaryResult.total_count) * 100) : 0}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DistributionBars title="Sentiment polarity" data={summaryResult.connotation_types} total={summaryResult.total_count} />
                <DistributionBars title="Emotional reactions" data={summaryResult.sentiment_connotations} total={summaryResult.total_count} />
                <DistributionBars title="Top domains" data={Object.fromEntries((summaryResult.top_domains ?? []).map((d) => [d.domain, d.count]))} total={summaryResult.total_count} />
                <DistributionBars title="Countries" data={summaryResult.countries} total={summaryResult.total_count} />
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Mentions</h2>
                  <span className="text-xs font-black text-slate-400">{items.length} shown</span>
                </div>
                {items.length === 0 ? (
                  <div className="px-6 py-12 text-center text-sm text-slate-400">No individual mentions returned.</div>
                ) : (
                  <div className="divide-y divide-slate-50 dark:divide-slate-800">
                    {items.map((item, i) => (
                      <div key={i} className="px-6 py-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <SentimentBadge connotations={item.content_info?.connotation_types} />
                            {item.domain && (
                              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{item.domain}</span>
                            )}
                            {item.country && (
                              <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{item.country}</span>
                            )}
                          </div>
                          {(item.content_info?.date_published || item.fetch_time) && (
                            <span className="shrink-0 text-[11px] text-slate-400">
                              {formatDate(item.content_info?.date_published ?? item.fetch_time)}
                            </span>
                          )}
                        </div>

                        {item.content_info?.title && (
                          <a href={item.url} target="_blank" rel="noopener noreferrer"
                            className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-violet-600 mb-1 block">
                            {item.content_info.title}
                          </a>
                        )}
                        {item.content_info?.snippet && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                            {truncate(item.content_info.snippet, 300)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                <a key={entry.id} href={`/dashboard/web-mentions?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.keyword}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {fmt(entry.totalCount)} mentions
                      {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">{formatDate(new Date(entry.ts).toISOString())}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
