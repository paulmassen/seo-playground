export const dynamic = 'force-dynamic';

import { getCredentials, getRedditHistory, saveRedditSearch, getRedditResults, type RedditSearchEntry } from '@/lib/db';
import SearchForm from '@/components/SearchForm';
import { MessageSquare, Users, ExternalLink } from 'lucide-react';

// ---- Types ----

interface RedditReview {
  title?: string;
  permalink?: string;
  author?: string;
  subreddit_name?: string;
  subreddit_member_count?: number;
}

interface RedditPageResult {
  page_url?: string;
  reddit_reviews?: RedditReview[];
}

interface SearchParams {
  targets?: string;
  history_id?: string;
}

// ---- API ----

async function fetchReddit(
  targets: string[],
  login: string,
  pass: string,
): Promise<{ items: RedditPageResult[]; cost?: number; error?: string; debug?: string }> {
  const auth = btoa(`${login}:${pass}`);
  // One task with all targets (max 10) — the API only accepts 1 task per POST call
  const res = await fetch('https://api.dataforseo.com/v3/business_data/social_media/reddit/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ targets }]),
  });

  if (!res.ok) return { items: [], error: `API error ${res.status}: ${res.statusText}` };

  const data = await res.json() as {
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      cost?: number;
      result?: RedditPageResult[];
    }>;
  };

  if (!data.tasks?.length) return { items: [], error: 'Empty API response.' };

  const task = data.tasks[0];
  const debug = `status ${task.status_code} — ${task.status_message} — ${task.result?.length ?? 0} result(s)`;

  if (task.status_code && task.status_code !== 20000) {
    return { items: [], error: `DataForSEO: ${task.status_message}`, debug };
  }

  const items = task.result ?? [];
  return { items, cost: task.cost, debug };
}

// ---- Helpers ----

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMembers(n?: number) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

// ---- Page ----

export default async function RedditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;
  const rawTargets = params.targets ?? '';

  let items: RedditPageResult[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let debug: string | undefined;
  let isFromHistory = false;
  let activeEntry: RedditSearchEntry | null = null;

  if (historyId) {
    const saved = getRedditResults<RedditPageResult>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      const history = getRedditHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
    } else {
      error = 'This search is no longer available.';
    }
  }

  const targets = rawTargets.split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 10);

  if (!historyId && targets.length > 0) {
    if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const res = await fetchReddit(targets, creds.login, creds.pass);
      items = res.items;
      cost = res.cost;
      error = res.error ?? null;
      debug = res.debug;

      if (!error && items.length > 0) {
        const totalMentions = items.reduce((s, p) => s + (p.reddit_reviews?.length ?? 0), 0);
        const entry: RedditSearchEntry = {
          id: crypto.randomUUID().slice(0, 8),
          ts: Date.now(),
          targets: targets.slice(0, 2).join(', ') + (targets.length > 2 ? ` +${targets.length - 2}` : ''),
          count: totalMentions,
          cost,
        };
        saveRedditSearch(entry, items);
      }
    }
  }

  const history = getRedditHistory();
  const hasQuery = historyId || targets.length > 0;
  const totalMentions = items.reduce((s, p) => s + (p.reddit_reviews?.length ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Reddit Mentions</h1>
        <p className="text-sm text-slate-400 mt-1">
          Discover Reddit discussions mentioning your URLs via DataForSEO.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-6">

          {/* Intro + Form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
            <p className="text-sm text-slate-500 leading-relaxed">
              Enter up to <strong className="text-slate-700">10 URLs</strong> and instantly surface every Reddit thread
              that links to or discusses those pages. For each mention you'll see the post title, the author, the
              subreddit it was shared in, and the community's member count — useful for brand monitoring, content
              distribution research, and spotting niche communities to engage with.
            </p>

            <SearchForm
              className="space-y-4"
              btnLabel="Search Reddit"
              btnClassName="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-orange-500 transition-colors"
            >
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  URLs <span className="text-slate-300 normal-case font-normal">(one per line, max 10)</span>
                </label>
                <textarea
                  name="targets"
                  defaultValue={activeEntry ? '' : rawTargets}
                  rows={4}
                  placeholder={'https://example.com/blog/post\nhttps://example.com/product'}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono resize-y"
                />
              </div>
            </SearchForm>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          {debug && (
            <div className="bg-slate-50 border border-slate-200 text-slate-500 text-[11px] font-mono rounded-xl px-4 py-2.5">
              API: {debug}
            </div>
          )}

          {/* Stats */}
          {hasQuery && !error && items.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">URLs analyzed</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{items.length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total mentions</p>
                <p className="text-2xl font-black text-orange-500 mt-1">{totalMentions}</p>
              </div>
            </div>
          )}

          {/* Results */}
          {hasQuery && !error && (
            <div className="space-y-4">
              {items.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 px-6 py-12 text-center text-sm text-slate-400 shadow-sm">
                  No Reddit mentions found for these URLs.
                </div>
              ) : (
                items.map((page, pi) => (
                  <div key={pi} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        {isFromHistory && pi === 0 && (
                          <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>
                        )}
                        <span className="text-xs font-mono text-slate-500 truncate">{page.page_url}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {cost !== undefined && pi === 0 && (
                          <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>
                        )}
                        <span className="text-xs font-black text-slate-400">
                          {page.reddit_reviews?.length ?? 0} mention{(page.reddit_reviews?.length ?? 0) !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    {!page.reddit_reviews?.length ? (
                      <div className="px-6 py-8 text-center text-sm text-slate-400">No mentions found for this URL.</div>
                    ) : (
                      <div className="divide-y divide-slate-50">
                        {page.reddit_reviews.map((review, ri) => (
                          <div key={ri} className="px-6 py-4 hover:bg-slate-50 transition-colors">
                            <div className="flex items-start gap-3">
                              <div className="shrink-0 w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center mt-0.5">
                                <MessageSquare className="w-4 h-4 text-orange-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                {review.permalink ? (
                                  <a
                                    href={`https://reddit.com${review.permalink}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-bold text-slate-900 hover:text-orange-500 transition-colors leading-snug flex items-start gap-1 group"
                                  >
                                    <span className="line-clamp-2">{review.title ?? 'Untitled'}</span>
                                    <ExternalLink className="shrink-0 w-3 h-3 mt-0.5 text-slate-300 group-hover:text-orange-400 transition-colors" />
                                  </a>
                                ) : (
                                  <p className="text-sm font-bold text-slate-900 line-clamp-2">{review.title ?? 'Untitled'}</p>
                                )}
                                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                  {review.subreddit_name && (
                                    <span className="text-[11px] font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md">
                                      r/{review.subreddit_name}
                                    </span>
                                  )}
                                  {review.author && (
                                    <span className="text-[11px] text-slate-400">u/{review.author}</span>
                                  )}
                                  {review.subreddit_member_count != null && (
                                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                      <Users className="w-3 h-3" />
                                      {formatMembers(review.subreddit_member_count)} members
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* History sidebar */}
        {history.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden self-start">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {history.map((entry) => {
                const isActive = entry.id === historyId;
                return (
                  <a
                    key={entry.id}
                    href={`/dashboard/social-media/reddit?history_id=${entry.id}`}
                    className={`block px-4 py-3 hover:bg-slate-50 transition-colors ${isActive ? 'bg-orange-50' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs font-medium truncate ${isActive ? 'text-orange-700' : 'text-slate-800'}`}>
                        {entry.targets}
                      </p>
                      <span className="shrink-0 text-[10px] text-slate-400">{formatDate(entry.ts)}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {entry.count} mention{entry.count !== 1 ? 's' : ''}
                      {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                    </p>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
