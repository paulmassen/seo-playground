export const dynamic = 'force-dynamic';

import {
  getCredentials, getSetting,
  getReviewsTasks, getReviewsTaskResult, updateReviewsTask,
  type ReviewsTask,
} from '@/lib/db';
import { submitReviewsTaskAction } from './actions';
import PendingButton from '@/components/PendingButton';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewRating {
  value?: number;
  votes_count?: number;
  rating_max?: number;
}

interface Review {
  type?: string;
  rating?: ReviewRating;
  review_text?: string;
  original_review_text?: string;
  timestamp?: string;
  time_ago?: string;
  profile_name?: string;
  profile_url?: string;
  local_guide?: boolean;
  reviews_count?: number;
  owner_answer?: string;
  owner_time_ago?: string;
}

interface SearchParams {
  id?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function StarRow({ value, max = 5 }: { value: number; max?: number }) {
  const full = Math.round(value);
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < full ? 'text-amber-400' : 'text-slate-200'} style={{ fontSize: '0.85em' }}>★</span>
      ))}
    </span>
  );
}

// ─── Distribution chart ───────────────────────────────────────────────────────

function DistributionChart({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) return null;

  const buckets = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => {
      const v = r.rating?.value ?? 0;
      return v >= star - 0.5 && v < star + 0.5;
    }).length,
  }));
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const barColors = ['bg-emerald-500', 'bg-green-400', 'bg-amber-400', 'bg-orange-400', 'bg-red-500'];

  return (
    <div className="space-y-2.5">
      {buckets.map(({ star, count }, i) => (
        <div key={star} className="flex items-center gap-3">
          <span className="text-xs font-black text-slate-600 w-5 text-right">{star}</span>
          <span className="text-amber-400 text-sm">★</span>
          <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColors[i]}`}
              style={{ width: `${(count / maxCount) * 100}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-slate-700 font-semibold w-8 text-right">{count}</span>
          <span className="text-xs tabular-nums text-slate-400 w-9">
            {reviews.length > 0 ? `${((count / reviews.length) * 100).toFixed(0)}%` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Monthly chart ────────────────────────────────────────────────────────────

function MonthlyChart({ reviews }: { reviews: Review[] }) {
  const monthMap: Record<string, number> = {};
  for (const r of reviews) {
    if (!r.timestamp) continue;
    try {
      const d = new Date(r.timestamp);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = (monthMap[key] ?? 0) + 1;
    } catch { /* skip */ }
  }

  const entries = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length < 2) {
    return <p className="text-sm text-slate-400 py-4 text-center">Not enough data to display monthly chart.</p>;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const W = 600, H = 160;
  const PAD = { top: 12, right: 10, bottom: 36, left: 32 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...entries.map(([, v]) => v), 1);
  const n = entries.length;
  const step = chartW / n;
  const barW = Math.max(6, Math.floor(step * 0.65));
  const yTicks = [0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${H}px` }}>
      {/* Gridlines + y labels */}
      {yTicks.map((f) => {
        const y = PAD.top + chartH * (1 - f);
        return (
          <g key={f}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#f1f5f9" strokeWidth="1" />
            <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{Math.round(maxVal * f)}</text>
          </g>
        );
      })}

      {/* Bars */}
      {entries.map(([month, count], i) => {
        const barH = Math.max(2, (count / maxVal) * chartH);
        const cx = PAD.left + i * step + step / 2;
        const x = cx - barW / 2;
        const y = PAD.top + chartH - barH;
        const [year, mStr] = month.split('-');
        const label = `${MONTHS[parseInt(mStr, 10) - 1]} ${year}`;
        const shortLabel = `${MONTHS[parseInt(mStr, 10) - 1]} '${year.slice(2)}`;
        const showLabel = n <= 24;
        const rotate = n > 12;

        return (
          <g key={month}>
            {/* Native tooltip on hover */}
            <title>{label}: {count} review{count !== 1 ? 's' : ''}</title>
            {/* Invisible wider hit area so the tooltip triggers easily */}
            <rect x={PAD.left + i * step} y={PAD.top} width={step} height={chartH} fill="transparent" />
            <rect x={x} y={y} width={barW} height={barH} rx="3" fill="#3b82f6" opacity="0.8" />
            {barH > 16 && (
              <text x={cx} y={y + barH - 4} textAnchor="middle" fontSize="8" fill="white" fontWeight="700">
                {count}
              </text>
            )}
            {showLabel && (
              <text
                x={cx}
                y={H - PAD.bottom + 14}
                textAnchor={rotate ? 'end' : 'middle'}
                fontSize="9"
                fill="#94a3b8"
                transform={rotate ? `rotate(-40, ${cx}, ${H - PAD.bottom + 14})` : undefined}
              >
                {shortLabel}
              </text>
            )}
          </g>
        );
      })}

      {/* Axis line */}
      <line x1={PAD.left} y1={PAD.top + chartH} x2={W - PAD.right} y2={PAD.top + chartH} stroke="#e2e8f0" strokeWidth="1" />
    </svg>
  );
}

// ─── Average rating gauge ─────────────────────────────────────────────────────

function RatingGauge({ avg, total }: { avg: number; total: number }) {
  const R = 54, cx = 70, cy = 70;
  const startAngle = -210, endAngle = 30;
  const range = endAngle - startAngle;
  const fillAngle = startAngle + range * (avg / 5);

  function polar(cx: number, cy: number, r: number, deg: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arc(r: number, from: number, to: number) {
    const s = polar(cx, cy, r, from);
    const e = polar(cx, cy, r, to);
    const large = to - from > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  }

  const strokeColor = avg >= 4.5 ? '#10b981' : avg >= 4 ? '#3b82f6' : avg >= 3 ? '#f59e0b' : '#ef4444';

  return (
    <svg viewBox="0 0 140 90" className="w-36 h-auto">
      <path d={arc(R, startAngle, endAngle)} fill="none" stroke="#f1f5f9" strokeWidth="10" strokeLinecap="round" />
      <path d={arc(R, startAngle, fillAngle)} fill="none" stroke={strokeColor} strokeWidth="10" strokeLinecap="round" />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="22" fontWeight="900" fill="#0f172a">{avg.toFixed(1)}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fill="#94a3b8">out of 5</text>
      <text x={cx} y={cy + 25} textAnchor="middle" fontSize="9" fill="#94a3b8">{total} reviews</text>
    </svg>
  );
}

// ─── Goal calculator ──────────────────────────────────────────────────────────

function GoalCalculator({ reviews }: { reviews: Review[] }) {
  const ratings = reviews.map((r) => r.rating?.value ?? 0).filter((v) => v > 0);
  if (ratings.length < 2) return null;

  const n = ratings.length;
  const sum = ratings.reduce((a, b) => a + b, 0);
  const avg = sum / n;

  // Every 0.1 step from just above current avg up to 4.9
  // Using integer arithmetic to avoid floating-point drift
  const startStep = Math.ceil(avg * 10) + 1; // first step strictly above avg, in 0.1 units
  const targets: number[] = [];
  for (let step = startStep; step <= 49; step++) {
    targets.push(step / 10);
  }

  if (targets.length === 0) return (
    <p className="text-xs text-slate-500">Average is already at or above 4.9★.</p>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Current average: <strong className="text-slate-700">{avg.toFixed(2)}★</strong> based on{' '}
        <strong className="text-slate-700">{n}</strong> fetched reviews.
        Assumes all new reviews are <strong className="text-slate-700">5★</strong>.
      </p>

      <div className="overflow-hidden rounded-xl border border-slate-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-2.5">Target rating</th>
              <th className="text-right text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-2.5">5★ reviews needed</th>
              <th className="text-right text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-2.5 hidden sm:table-cell">Total reviews after</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {targets.map((target) => {
              const needed = Math.ceil((target * n - sum) / (5 - target));
              // Colour-code by how many are needed
              const easy = needed <= 10;
              const medium = needed <= 50;
              return (
                <tr key={target} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="font-black text-slate-800">{target.toFixed(1)}</span>
                    <span className="text-amber-400 ml-1">★</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`font-black tabular-nums text-base ${easy ? 'text-emerald-600' : medium ? 'text-blue-600' : 'text-slate-700'}`}>
                      {needed > 0 ? needed.toLocaleString() : '0'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-slate-400 tabular-nums hidden sm:table-cell">
                    {(n + needed).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Task status badge ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReviewsTask['status'] }) {
  if (status === 'ready') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg">
      <CheckCircle className="w-2.5 h-2.5" /> Ready
    </span>
  );
  if (status === 'error') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-50 border border-red-100 px-2 py-0.5 rounded-lg">
      <AlertCircle className="w-2.5 h-2.5" /> Error
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg">
      <Clock className="w-2.5 h-2.5" /> Pending
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className="text-lg font-black text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function GoogleReviewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'French';

  // Auto-poll: check tasks_ready on every load and fetch ready tasks
  if (creds) {
    try {
      const auth = btoa(`${creds.login}:${creds.pass}`);
      const readyRes = await fetch('https://api.dataforseo.com/v3/business_data/google/reviews/tasks_ready', {
        headers: { Authorization: `Basic ${auth}` },
        cache: 'no-store',
      });
      if (readyRes.ok) {
        const readyData = await readyRes.json() as {
          tasks?: Array<{ result?: Array<{ id: string }> }>;
        };
        const readyIds = new Set((readyData?.tasks?.[0]?.result ?? []).map((r) => r.id));

        const pendingTasks = getReviewsTasks().filter((t) => t.status === 'pending');
        for (const pt of pendingTasks) {
          if (!readyIds.has(pt.id)) continue;

          const getRes = await fetch(
            `https://api.dataforseo.com/v3/business_data/google/reviews/task_get/${pt.id}`,
            { headers: { Authorization: `Basic ${auth}` }, cache: 'no-store' },
          );
          if (!getRes.ok) continue;

          const getData = await getRes.json() as {
            cost?: number;
            tasks?: Array<{
              status_code?: number;
              cost?: number;
              result_count?: number;
              result?: Array<{ items?: Review[]; items_count?: number; total_count?: number }>;
            }>;
          };

          const task = getData?.tasks?.[0];
          if (!task || task.status_code !== 20000) continue;

          const items = task.result?.[0]?.items ?? [];
          const resultCount = task.result?.[0]?.total_count ?? task.result_count ?? items.length;
          const cost = task.cost ?? getData.cost;
          updateReviewsTask(pt.id, 'ready', items, cost, resultCount);
        }
      }
    } catch { /* silently ignore poll errors */ }
  }

  const tasks = getReviewsTasks();
  const activeId = params.id;
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;
  const reviews: Review[] = activeTask?.status === 'ready' ? (getReviewsTaskResult<Review>(activeTask.id) ?? []) : [];

  const ratings = reviews.map((r) => r.rating?.value ?? 0).filter((v) => v > 0);
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const fiveStarPct = ratings.length > 0 ? ((ratings.filter((v) => v >= 4.5).length / ratings.length) * 100).toFixed(0) : null;
  const positivePct = ratings.length > 0 ? ((ratings.filter((v) => v >= 4).length / ratings.length) * 100).toFixed(0) : null;

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Google Reviews</h1>
        <p className="text-sm text-slate-400 mt-1">Analyse reviews for a business — distribution, monthly trend, and rating goals.</p>
      </div>

      {!creds && (
        <div className="bg-amber-50 border border-amber-100 text-amber-700 text-sm rounded-xl px-4 py-3">
          DataForSEO credentials missing. Configure them in{' '}
          <a href="/dashboard/settings" className="underline font-semibold">settings</a>.
        </div>
      )}

      {/* Form */}
      <form action={submitReviewsTaskAction} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Business name</label>
            <input
              type="text"
              name="keyword"
              required
              placeholder="e.g. Joe's Plumbing New York"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
            <input
              type="text"
              name="location"
              defaultValue={defaultLocation}
              placeholder="e.g. France"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
            <input
              type="text"
              name="language"
              defaultValue={defaultLanguage}
              placeholder="e.g. French"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Depth</label>
            <select
              name="depth"
              defaultValue="100"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="50">50 reviews</option>
              <option value="100">100 reviews</option>
              <option value="200">200 reviews</option>
              <option value="500">500 reviews</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Sort by</label>
            <select
              name="sort_by"
              defaultValue="newest"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="newest">Newest</option>
              <option value="relevant">Most relevant</option>
              <option value="highest_rating">Highest rating</option>
              <option value="lowest_rating">Lowest rating</option>
            </select>
          </div>
        </div>
        <PendingButton
          type="submit"
          disabled={!creds}
          className="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-2.5 rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-40"
          pendingChildren="Submitting task…"
          pendingClassName="w-full bg-slate-400 text-white font-black uppercase tracking-widest text-xs py-2.5 rounded-xl cursor-not-allowed"
        >
          Fetch reviews
        </PendingButton>
      </form>

      {/* Pending indicator */}
      {pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-amber-700">
          <svg className="animate-spin w-4 h-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span>
            <strong>{pendingCount}</strong> task{pendingCount > 1 ? 's' : ''} being processed by DataForSEO.
            Reload the page to check progress.
          </span>
        </div>
      )}

      {/* Task history */}
      {tasks.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {tasks.map((t) => {
              const isActive = t.id === activeId;
              return (
                <a
                  key={t.id}
                  href={t.status === 'ready' ? `/dashboard/google-reviews?id=${t.id}` : '#'}
                  className={`flex items-center gap-4 px-6 py-3.5 transition-colors ${
                    isActive ? 'bg-blue-50' : t.status === 'ready' ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>
                      {t.business}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {t.location} · {t.language} · {t.depth} reviews · {formatDate(t.ts)}
                      {t.resultCount ? ` · ${t.resultCount} results` : ''}
                      {t.cost !== undefined ? ` · $${t.cost.toFixed(5)}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Results */}
      {activeTask && activeTask.status === 'ready' && reviews.length > 0 && (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-6 flex-wrap">
              {avgRating !== null && (
                <div className="shrink-0">
                  <RatingGauge avg={avgRating} total={reviews.length} />
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1 min-w-0">
                <StatCard label="Reviews fetched" value={reviews.length.toString()} />
                {avgRating !== null && (
                  <StatCard label="Avg rating" value={avgRating.toFixed(2)} sub="out of 5 stars" />
                )}
                {fiveStarPct !== null && (
                  <StatCard label="5★ reviews" value={`${fiveStarPct}%`} sub="4.5+ stars" />
                )}
                {positivePct !== null && (
                  <StatCard label="Positive" value={`${positivePct}%`} sub="4+ stars" />
                )}
                {activeTask.cost !== undefined && (
                  <StatCard label="API cost" value={`$${activeTask.cost.toFixed(5)}`} />
                )}
              </div>
            </div>
          </div>

          {/* Distribution */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Rating distribution</h2>
            </div>
            <div className="px-6 py-5">
              <DistributionChart reviews={reviews} />
            </div>
          </div>

          {/* Monthly chart */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Reviews per month</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Hover a bar to see the exact month and count.</p>
            </div>
            <div className="px-6 py-4">
              <MonthlyChart reviews={reviews} />
            </div>
          </div>

          {/* Goal calculator */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Rating goal</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">5★ reviews needed for each 0.1 increment.</p>
            </div>
            <div className="px-6 py-5">
              <GoalCalculator reviews={reviews} />
            </div>
          </div>

          {/* Reviews list */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Reviews</h2>
              <span className="text-xs text-slate-400">{reviews.length} fetched</span>
            </div>
            <div className="divide-y divide-slate-50">
              {reviews.slice(0, 100).map((r, i) => (
                <div key={i} className="px-6 py-4 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.rating?.value !== undefined && <StarRow value={r.rating.value} />}
                    <span className="text-xs font-semibold text-slate-700">{r.profile_name ?? 'Anonymous'}</span>
                    {r.local_guide && (
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">
                        Local Guide
                      </span>
                    )}
                    {r.timestamp && (
                      <span className="text-[11px] text-slate-400 ml-auto">{formatDateTime(r.timestamp)}</span>
                    )}
                    {!r.timestamp && r.time_ago && (
                      <span className="text-[11px] text-slate-400 ml-auto">{r.time_ago}</span>
                    )}
                  </div>
                  {r.review_text && (
                    <p className="text-sm text-slate-600 leading-relaxed">{r.review_text}</p>
                  )}
                  {r.owner_answer && (
                    <div className="mt-2 ml-4 pl-3 border-l-2 border-blue-100">
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-0.5">Owner response</p>
                      <p className="text-xs text-slate-500 leading-relaxed">{r.owner_answer}</p>
                    </div>
                  )}
                </div>
              ))}
              {reviews.length > 100 && (
                <div className="px-6 py-4 text-center text-xs text-slate-400">
                  {reviews.length - 100} more reviews not shown.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTask && activeTask.status === 'pending' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-10 text-center text-sm text-slate-400">
          Task is being processed by DataForSEO. Reload the page in a few seconds.
        </div>
      )}
    </div>
  );
}
