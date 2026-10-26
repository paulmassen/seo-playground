import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ArrowRight, Activity, Grid3X3, Radar, Star, History, Settings2 } from 'lucide-react';
import {
  getCredentials, getCurrentProject, getGridHistory, getPendingRankTasks,
  getTrackedPrompts, getLatestPromptChecks, getPromptCheckTotals, getSpendByTool,
  type GridSearchEntry,
} from '@/lib/db';
import { listBenchmarks, getBenchmarkListings, countReviewsSince } from '@/lib/review-velocity-db';
import { getRankSummary, getRecentSavedResults, type RankSummary } from '@/lib/project-overview';
import { checkStatus, STATUS_LABEL } from '@/lib/prompt-report';
import { PLATFORM_LABELS } from '@/lib/llm-options';
import { totalSpend, formatUsd } from '@/lib/spend';
import ProjectFavicon from '@/components/ProjectFavicon';
import StatusDot from './prompt-tracker/StatusDot';
import { saveCredentialsAction } from './actions';

const DAY = 86_400_000;

// ─── Formatting ───────────────────────────────────────────────────────────────

function startOfDay(ts: number) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function ago(ts: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dayToTs(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function plural(n: number, word: string, many = `${word}s`) {
  return `${n.toLocaleString('en-US')} ${n === 1 ? word : many}`;
}

// ─── Building blocks ──────────────────────────────────────────────────────────

const ROW_LINK = 'transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800/50';

function Panel({ title, icon: Icon, href, meta, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <Icon className="h-4 w-4 shrink-0 translate-y-0.5 text-slate-400" />
          <h2 className="shrink-0 text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
          {meta && <span className="truncate text-xs text-slate-400">{meta}</span>}
        </div>
        {href && (
          <Link href={href} className="group flex shrink-0 items-center gap-1 rounded-md text-xs font-semibold text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">
            Open
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function EmptyState({ text, cta, href }: { text: string; cta: string; href: string }) {
  return (
    <div className="px-5 py-5">
      <p className="max-w-prose text-sm leading-relaxed text-slate-500 dark:text-slate-400">{text}</p>
      <Link href={href} className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
        {cta} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function Fact({ label, value, detail, href }: { label: string; value: string; detail: string; href: string }) {
  return (
    <Link href={href} className={`block bg-white px-5 py-4 dark:bg-slate-900 ${ROW_LINK}`}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">{value}</p>
      <p className="mt-0.5 truncate text-xs text-slate-400">{detail}</p>
    </Link>
  );
}

function Change({ value, unit = '' }: { value: number | null; unit?: string }) {
  if (value === null || value === 0) return null;
  return (
    <span className={`ml-1 text-xs font-bold tabular-nums ${value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
      {value > 0 ? '+' : '−'}{Math.abs(value)}{unit}
    </span>
  );
}

function PositionLabel({ position }: { position: number | null }) {
  return position === null ? <>not found</> : <span className="tabular-nums">#{position}</span>;
}

// ─── Rankings ─────────────────────────────────────────────────────────────────

// Same bands as the Rank Tracker position badges.
const DISTRIBUTION = [
  { key: 'top3', label: '1–3', bar: 'bg-emerald-500' },
  { key: 'top4to10', label: '4–10', bar: 'bg-blue-500' },
  { key: 'top11to30', label: '11–30', bar: 'bg-yellow-400' },
  { key: 'beyond30', label: '31+', bar: 'bg-slate-400' },
  { key: 'notRanked', label: 'Not found', bar: 'bg-slate-200 dark:bg-slate-700' },
] as const;

function RankingsPanel({ ranks, queued, now }: { ranks: RankSummary; queued: number; now: number }) {
  const meta = ranks.tracked > 0
    ? `${plural(ranks.tracked, 'keyword')}${ranks.domains.length > 1 ? ` · ${ranks.domains.length} domains` : ''}`
    : undefined;
  return (
    <Panel title="Rankings" icon={Activity} href="/dashboard/rank-tracker" meta={meta}>
      {ranks.tracked === 0 ? (
        <EmptyState text="No keywords tracked in this project yet. Add the queries that matter and follow their Google position over time." cta="Track keywords" href="/dashboard/rank-tracker" />
      ) : ranks.checked === 0 ? (
        <EmptyState text={`${plural(ranks.tracked, 'keyword is', 'keywords are')} tracked, but none has been checked yet.`} cta="Run a first check" href="/dashboard/rank-tracker" />
      ) : (
        <div className="px-5 py-4">
          <dl className="grid grid-cols-3 gap-4">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Average position</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 dark:text-white">{ranks.avgPosition === null ? '—' : `#${ranks.avgPosition}`}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">On page 1</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 dark:text-white">{ranks.top10}<span className="text-sm font-medium text-slate-400"> / {ranks.checked}</span></dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Since previous check</dt>
              <dd className="mt-1 flex gap-3 text-sm font-bold tabular-nums">
                <span className="text-emerald-600 dark:text-emerald-400" title="Keywords that moved up">↑ {ranks.improved}</span>
                <span className="text-red-500 dark:text-red-400" title="Keywords that moved down">↓ {ranks.declined}</span>
              </dd>
            </div>
          </dl>

          <div className="mt-5">
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img"
              aria-label={`Position distribution: ${DISTRIBUTION.map((d) => `${d.label} ${ranks[d.key]}`).join(', ')}`}>
              {DISTRIBUTION.map((d) => ranks[d.key] > 0 && (
                <div key={d.key} className={d.bar} style={{ width: `${(ranks[d.key] / ranks.checked) * 100}%` }} />
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
              {DISTRIBUTION.map((d) => (
                <span key={d.key} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className={`h-2 w-2 rounded-full ${d.bar}`} />
                  {d.label} <span className="font-bold tabular-nums text-slate-700 dark:text-slate-200">{ranks[d.key]}</span>
                </span>
              ))}
            </div>
          </div>

          {ranks.movers.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">Biggest moves since the previous check</h3>
              <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
                {ranks.movers.map((m) => (
                  <li key={`${m.domain}-${m.keyword}`}>
                    <Link href={`/dashboard/rank-tracker?domain=${encodeURIComponent(m.domain)}`} className={`-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-sm ${ROW_LINK}`}>
                      <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200">{m.keyword}</span>
                      <span className="shrink-0 text-xs text-slate-400"><PositionLabel position={m.previousPosition} /> →</span>
                      <span className="w-16 shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200"><PositionLabel position={m.position} /></span>
                      <span className={`w-9 shrink-0 text-right text-xs font-bold tabular-nums ${m.change > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                        {m.change > 0 ? '↑' : '↓'}{m.position !== null && m.previousPosition !== null ? Math.abs(m.change) : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-400">
            Last check {ranks.lastCheck ? ago(dayToTs(ranks.lastCheck), now) : '—'}
            {ranks.aiOverviewSeen > 0 && ` · cited in ${ranks.aiOverviewCited} of ${plural(ranks.aiOverviewSeen, 'AI Overview')}`}
            {queued > 0 && <span className="text-amber-600 dark:text-amber-400"> · {plural(queued, 'check')} queued</span>}
          </p>
        </div>
      )}
    </Panel>
  );
}

// ─── Geo-grid ─────────────────────────────────────────────────────────────────

interface Monitor { latest: GridSearchEntry; previous: GridSearchEntry | null; pending: boolean }

/** One row per monitor: its latest finished run, compared with the run before it. */
function gridMonitors(history: GridSearchEntry[]): Monitor[] {
  const bySeries = new Map<string, GridSearchEntry[]>();
  for (const entry of history) bySeries.set(entry.series_id, [...(bySeries.get(entry.series_id) ?? []), entry]);
  return [...bySeries.values()].flatMap((runs): Monitor[] => {
    const done = runs.filter((r) => r.status === 'done' && r.summary);
    const pending = runs.some((r) => r.status === 'pending');
    if (done.length === 0) return pending ? [{ latest: runs[0], previous: null, pending }] : [];
    return [{ latest: done[0], previous: done[1] ?? null, pending }];
  });
}

function GridPanel({ monitors, now }: { monitors: Monitor[]; now: number }) {
  return (
    <Panel title="Local visibility" icon={Grid3X3} href="/dashboard/geo-grid" meta={monitors.length > 0 ? plural(monitors.length, 'Geo-grid monitor') : undefined}>
      {monitors.length === 0 ? (
        <EmptyState text="No Geo-grid monitor yet. Map how the business ranks in Google Maps across its area, point by point." cta="Create a monitor" href="/dashboard/geo-grid" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {monitors.slice(0, 5).map(({ latest, previous, pending }) => {
            const s = latest.summary;
            return (
              <li key={latest.series_id}>
                <Link href={`/dashboard/geo-grid?grid_history_id=${encodeURIComponent(latest.id)}#results`} className={`flex items-center gap-4 px-5 py-3 ${ROW_LINK}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{latest.keyword}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {latest.target} · {latest.grid_size}×{latest.grid_size} · {ago(latest.ts, now)}
                      {pending && s && <span className="text-amber-600 dark:text-amber-400"> · new run in progress</span>}
                    </p>
                  </div>
                  {s ? (
                    <>
                      <div className="hidden w-16 shrink-0 text-right sm:block">
                        <p className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{s.avgRank === null ? '—' : `#${s.avgRank}`}</p>
                        <p className="text-[11px] text-slate-400">avg rank</p>
                      </div>
                      <div className="w-24 shrink-0 text-right">
                        <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                          {s.ato}%<Change value={previous?.summary ? s.ato - previous.summary.ato : null} unit=" pt" />
                        </p>
                        <p className="text-[11px] text-slate-400">visibility</p>
                      </div>
                    </>
                  ) : (
                    <span className="shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400">Processing</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ─── AI answers ───────────────────────────────────────────────────────────────

function PromptsPanel() {
  const prompts = getTrackedPrompts();
  const latest = getLatestPromptChecks();
  const totals = getPromptCheckTotals();
  const checked = prompts.filter((p) => latest.has(p.id));
  const cited = checked.filter((p) => {
    const c = latest.get(p.id);
    return c && checkStatus(c) === 'cited';
  }).length;

  return (
    <Panel title="AI answers" icon={Radar} href="/dashboard/prompt-tracker"
      meta={checked.length > 0 ? `${cited} of ${plural(checked.length, 'prompt')} cite you` : undefined}>
      {prompts.length === 0 ? (
        <EmptyState text="No prompts tracked. Save the questions customers ask ChatGPT or Gemini, and see whether the answer names you." cta="Track a prompt" href="/dashboard/prompt-tracker" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {prompts.slice(0, 5).map((p) => {
            const check = latest.get(p.id);
            const t = totals.get(p.id);
            const status = check ? checkStatus(check) : null;
            return (
              <li key={p.id}>
                <Link href={`/dashboard/prompt-tracker?prompt=${p.id}`} className={`flex items-start gap-3 px-5 py-3 ${ROW_LINK}`}>
                  <span className="mt-1"><StatusDot status={status} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-slate-800 dark:text-slate-200">{p.prompt}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {PLATFORM_LABELS[p.platform] ?? p.platform} · {status ? STATUS_LABEL[status] : 'Not checked yet'}
                      {t && t.total > 0 && ` · cited in ${t.mentioned} of ${plural(t.total, 'check')}`}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

function ReviewsPanel({ now }: { now: number }) {
  const benchmarks = listBenchmarks();
  const rows = benchmarks.slice(0, 3).map((b) => {
    const listings = getBenchmarkListings(b.id);
    const self = listings.find((l) => l.isSelf) ?? null;
    const recent = self ? countReviewsSince(self.id, now - 90 * DAY) : null;
    return { b, self, recent, competitors: listings.length - (self ? 1 : 0) };
  });

  return (
    <Panel title="Google reviews" icon={Star} href="/dashboard/review-velocity" meta={benchmarks.length > 0 ? plural(benchmarks.length, 'analysis', 'analyses') : undefined}>
      {rows.length === 0 ? (
        <EmptyState text="No Review Velocity analysis yet. Compare how fast the business and its local competitors gain reviews." cta="Start an analysis" href="/dashboard/review-velocity" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(({ b, self, recent, competitors }) => (
            <li key={b.id}>
              <Link href={`/dashboard/review-velocity?id=${encodeURIComponent(b.id)}`} className={`block px-5 py-3 ${ROW_LINK}`}>
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{b.name}</p>
                {self ? (
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {self.rating !== null && (
                      <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span className="tabular-nums">{self.rating.toFixed(1)}</span>
                      </span>
                    )}
                    {self.totalReviews !== null && <span className="tabular-nums">{plural(self.totalReviews, 'review')}</span>}
                    {recent !== null && <span className="tabular-nums">+{recent} in 90 days</span>}
                    <span>vs {plural(competitors, 'competitor')}</span>
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-400">{plural(b.listingCount, 'listing')} · mark your own listing to compare</p>
                )}
                {b.pendingTasks > 0 && <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">{plural(b.pendingTasks, 'fetch', 'fetches')} pending</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ─── Saved results ────────────────────────────────────────────────────────────

function RecentResultsPanel({ items, total, now }: { items: ReturnType<typeof getRecentSavedResults>['items']; total: number; now: number }) {
  return (
    <Panel title="Recent results" icon={History} meta={total > 0 ? `${plural(total, 'saved search', 'saved searches')}` : undefined}>
      {items.length === 0 ? (
        <EmptyState text="Every search you run is saved in this project, so you can reopen it later without paying for a new call." cta="Research a keyword" href="/dashboard/keyword-overview" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={`flex items-center gap-3 px-5 py-2.5 ${ROW_LINK}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800 dark:text-slate-200">{item.label}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">{item.tool} · {ago(item.ts, now)}</p>
                </div>
                {item.cost !== null && <span className="shrink-0 text-xs tabular-nums text-slate-400" title="What this call cost when it was made">{formatUsd(item.cost)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function DashboardPage() {
  const creds = getCredentials();

  if (!creds) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-10 max-w-lg mx-auto mt-10">
        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">DataForSEO Login</h2>
        <p className="text-slate-500 text-sm mb-6">Enter your DataForSEO API credentials to get started. Stored locally only.</p>
        <aside className="mb-8 border-l-2 border-blue-500 bg-blue-50/70 px-4 py-3.5 dark:border-blue-400 dark:bg-blue-950/25">
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">New to DataForSEO?</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            You can choose to <a href="https://try.dataforseo.com/nrjev32kinaz" target="_blank" rel="noreferrer" className="font-bold text-blue-700 underline decoration-blue-300 underline-offset-2 transition-colors hover:text-blue-900 dark:text-blue-300 dark:decoration-blue-700 dark:hover:text-blue-100">create a DataForSEO account through this affiliate link ↗</a>{' '}to support SEO Playground&apos;s development, at no extra cost to you.
          </p>
          <p className="mt-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">Affiliate link for new customers only — I may earn a commission if you become a customer.</p>
        </aside>
        <form action={saveCredentialsAction} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">API Login</label>
            <input type="text" name="login" required className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">API Password</label>
            <input type="password" name="password" required className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white font-black uppercase text-xs tracking-widest py-3.5 rounded-xl hover:bg-blue-700 transition-colors">
            Save
          </button>
        </form>
      </div>
    );
  }

  const now = Date.now();
  const project = getCurrentProject();
  const ranks = getRankSummary();
  const queued = getPendingRankTasks().length;
  const monitors = gridMonitors(getGridHistory());
  const spend = totalSpend(getSpendByTool(startOfDay(now) - 29 * DAY, startOfDay(now) + DAY));
  const saved = getRecentSavedResults(8);
  const locale = [project.defaultLocation, project.defaultLanguage].filter(Boolean).join(' · ');
  const bestMonitor = monitors
    .filter((m) => m.latest.summary)
    .sort((a, b) => b.latest.summary!.ato - a.latest.summary!.ato)[0];
  const hasUnknown = spend.unknownCalls > 0;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <ProjectFavicon domain={project.domain} className="h-11 w-11" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{project.name}</h1>
            <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
              {project.domain && (
                <a href={`https://${project.domain}`} target="_blank" rel="noreferrer" className="font-medium text-slate-600 underline-offset-2 hover:text-blue-600 hover:underline dark:text-slate-300 dark:hover:text-blue-400">{project.domain}</a>
              )}
              {project.domain && locale && ' · '}
              {locale}
            </p>
          </div>
        </div>
        <Link href={`/dashboard/projects?edit=${encodeURIComponent(project.id)}`} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white">
          <Settings2 className="h-3.5 w-3.5" /> Project settings
        </Link>
      </div>

      {/* One ledger row; each figure opens the tool it comes from. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800 lg:grid-cols-4">
        <Fact label="Keywords on page 1" href="/dashboard/rank-tracker"
          value={ranks.checked > 0 ? `${ranks.top10} / ${ranks.checked}` : '—'}
          detail={ranks.tracked === 0 ? 'No keywords tracked' : ranks.checked === 0 ? 'Not checked yet' : `${ranks.top3} in the top 3`} />
        <Fact label="Best local visibility" href={bestMonitor ? `/dashboard/geo-grid?grid_history_id=${encodeURIComponent(bestMonitor.latest.id)}#results` : '/dashboard/geo-grid'}
          value={bestMonitor ? `${bestMonitor.latest.summary!.ato}%` : '—'}
          detail={bestMonitor ? bestMonitor.latest.keyword : 'No Geo-grid monitor'} />
        <Fact label="Spend, last 30 days" href={`/dashboard/spending?preset=30d&project=${encodeURIComponent(project.id)}`}
          value={hasUnknown ? `~${formatUsd(spend.estimatedCost)}` : formatUsd(spend.knownCost)}
          detail={spend.calls > 0 ? `${plural(spend.calls, 'call')}${hasUnknown ? ', partly estimated' : ''}` : 'No calls in 30 days'} />
        <Fact label="Saved results" href="#recent-results"
          value={saved.total.toLocaleString('en-US')}
          detail="Reopen any of them at no cost" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <div className="min-w-0 space-y-6 lg:col-span-3">
          <RankingsPanel ranks={ranks} queued={queued} now={now} />
          <GridPanel monitors={monitors} now={now} />
        </div>
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <PromptsPanel />
          <ReviewsPanel now={now} />
          <div id="recent-results" className="scroll-mt-6">
            <RecentResultsPanel items={saved.items} total={saved.total} now={now} />
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400">Built from data already saved in this project. Opening this page makes no DataForSEO call.</p>
    </div>
  );
}

export default withProjectScope(DashboardPage);
