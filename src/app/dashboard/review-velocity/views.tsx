// Presentational server components for the three tabs. They only render props (no data access),
// so they are safe as child components of the project-scoped page.
import { AlertTriangle, Star } from 'lucide-react';
import {
  CRITERIA, CRITERION_GROUPS, formatCriterion, rankColor, rgbCss,
  type ComparisonReport, type CriterionId, type ListingResult,
} from '@/lib/review-report';
import type { BenchmarkListing, ReviewTask } from '@/lib/review-velocity-db';
import VelocityChart, { type ChartSeries } from './VelocityChart';
import { setSelfListingAction } from './actions';

const card = 'bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm';
const th = 'text-[10px] font-black uppercase tracking-widest text-slate-400 px-3 py-2.5 whitespace-nowrap';
const td = 'px-3 py-2.5 text-sm tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap';

export function formatDay(ms: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(ms));
}

function SectionHeader({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">{title}</h2>
        {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ListingName({ listing }: { listing: Pick<ListingResult, 'title' | 'isSelf' | 'partial'> }) {
  return (
    <span className="inline-flex items-center gap-1.5 max-w-[260px]">
      <span className={`truncate ${listing.isSelf ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-800 dark:text-slate-200'}`}>{listing.title}</span>
      {listing.isSelf && <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-blue-700 bg-blue-100 dark:bg-blue-950 dark:text-blue-300 px-1.5 py-0.5 rounded">You</span>}
      {listing.partial && <span title="The data does not reach back to the start of the period" className="shrink-0 text-amber-500"><AlertTriangle className="w-3.5 h-3.5" /></span>}
    </span>
  );
}

function RankChip({ rank, count }: { rank: number | null; count: number }) {
  if (rank === null) return <span className="text-[10px] text-slate-300 dark:text-slate-600">n/a</span>;
  return (
    <span className="inline-flex items-center justify-center min-w-6 h-6 px-1 rounded-md text-[11px] font-black text-white tabular-nums" style={{ background: rgbCss(rankColor(rank, count)) }}>
      {rank}
    </span>
  );
}

function Value({ listing, id }: { listing: ListingResult; id: CriterionId }) {
  const value = listing.metrics[id];
  return <span className={value === null ? 'text-slate-300 dark:text-slate-600' : ''}>{formatCriterion(id, value)}</span>;
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export function KpiStrip({ report }: { report: ComparisonReport }) {
  return (
    <div className={`${card} grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-100 dark:divide-slate-800`}>
      {report.kpis.map((kpi) => (
        <div key={kpi.label} className="px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{kpi.label}</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums mt-1">{kpi.value}</p>
          {kpi.detail && <p className="text-[11px] text-slate-400 mt-0.5 truncate" title={kpi.detail}>{kpi.detail}</p>}
        </div>
      ))}
    </div>
  );
}

export function OverviewView({ report, series }: { report: ComparisonReport; series: ChartSeries[] }) {
  const n = report.listings.length;
  const completeWeeks = report.weeks.slice(0, -1);
  const heatMax = Math.max(1, ...report.listings.flatMap((l) => l.weekly.slice(0, -1).filter((v): v is number => v !== null)));
  return (
    <div className="space-y-6">
      <KpiStrip report={report} />

      <section className={`${card} overflow-hidden`}>
        <SectionHeader title="Review pace" hint="Sorted by overall score. Click the Report tab for every criterion." />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr className="text-left">
                <th className={th}>#</th><th className={th}>Listing</th>
                <th className={`${th} text-right`}>Google</th>
                <th className={`${th} text-right`}>Per week</th>
                <th className={`${th} text-right`}>Per month</th>
                <th className={`${th} text-right`}>Momentum</th>
                <th className={`${th} text-right`}>Regularity</th>
                <th className={`${th} text-right`}>Last review</th>
                <th className={`${th} text-right`}>Reply rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {report.listings.map((l) => (
                <tr key={l.id} className={l.isSelf ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''}>
                  <td className={td}><RankChip rank={l.overallRank} count={n} /></td>
                  <td className={td}><ListingName listing={l} /></td>
                  <td className={`${td} text-right`}>
                    {l.googleRating !== null ? <span className="font-semibold">{l.googleRating.toFixed(1)}★</span> : '—'}
                    <span className="text-slate-400"> · {l.googleTotal ?? '—'}</span>
                  </td>
                  <td className={`${td} text-right font-black text-slate-900 dark:text-white`}><Value listing={l} id="perWeek4" /></td>
                  <td className={`${td} text-right`}><Value listing={l} id="perMonth" /></td>
                  <td className={`${td} text-right ${l.metrics.momentum !== null ? (l.metrics.momentum > 0 ? 'text-emerald-600' : l.metrics.momentum < 0 ? 'text-red-500' : '') : ''}`}><Value listing={l} id="momentum" /></td>
                  <td className={`${td} text-right`}><Value listing={l} id="regularity" /></td>
                  <td className={`${td} text-right`}><Value listing={l} id="freshness" /></td>
                  <td className={`${td} text-right`}><Value listing={l} id="replyRate" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <SectionHeader title="New reviews over time" />
        <div className="px-6 py-5">
          <VelocityChart weekLabels={completeWeeks.map((w) => w.label)} monthLabels={report.months.slice(0, -1).map((m) => m.label)} series={series} />
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <SectionHeader title="Weekly heatmap" hint="New reviews per complete ISO week. Hatched = not covered by the data." />
        <div className="overflow-x-auto px-6 py-5">
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>
                <th />
                {completeWeeks.map((w) => <th key={w.key} className="text-[9px] font-bold text-slate-400 px-0.5 whitespace-nowrap">{w.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {report.listings.map((l) => (
                <tr key={l.id}>
                  <td className="pr-3 text-xs whitespace-nowrap"><ListingName listing={l} /></td>
                  {l.weekly.slice(0, -1).map((v, i) => (
                    <td key={completeWeeks[i].key} title={`${l.title} · week of ${completeWeeks[i].label}: ${v ?? 'not covered'}`}
                      className="w-9 h-8 rounded-md text-center text-[11px] font-bold tabular-nums"
                      style={v === null
                        ? { background: 'repeating-linear-gradient(45deg, rgb(241 245 249), rgb(241 245 249) 3px, rgb(226 232 240) 3px, rgb(226 232 240) 6px)' }
                        : { background: `rgba(37, 99, 235, ${v === 0 ? 0.04 : 0.15 + 0.85 * (v / heatMax)})`, color: v / heatMax > 0.5 ? 'white' : 'rgb(30 41 59)' }}>
                      {v ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ─── Report ───────────────────────────────────────────────────────────────────

export function ReportView({ report, context, exportBar }: { report: ComparisonReport; context: { keyword: string; area: string }; exportBar: React.ReactNode }) {
  const n = report.listings.length;
  const self = report.listings.find((l) => l.isSelf) ?? null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-slate-100 dark:border-slate-800 py-3">
        <p className="text-[11px] text-slate-500">
          <span className="font-black uppercase tracking-widest text-slate-400 text-[10px]">Period</span>{' '}
          {formatDay(report.periodStart, report.timeZone)} – {formatDay(report.periodEnd, report.timeZone)} · {n} listings · {context.keyword}, {context.area}
        </p>
        <div className="flex items-center gap-4">{exportBar}</div>
      </div>

      <KpiStrip report={report} />

      <section className={`${card} p-6 space-y-5`}>
        <div className="space-y-1.5">
          {report.summary.headline.map((line) => <p key={line} className="text-base text-slate-800 dark:text-slate-100 leading-relaxed">{line}</p>)}
        </div>
        {report.summary.targets.length > 0 && (
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Targets and gaps</h3>
            <ul className="space-y-1.5">
              {report.summary.targets.map((t) => <li key={t} className="text-sm text-slate-700 dark:text-slate-300 pl-4 relative before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-blue-500">{t}</li>)}
            </ul>
          </div>
        )}
        {self && (report.summary.strengths.length > 0 || report.summary.weaknesses.length > 0) && (
          <div className="grid sm:grid-cols-2 gap-6 pt-1">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2">Strengths · top third</h3>
              {report.summary.strengths.length ? (
                <ul className="space-y-1">{report.summary.strengths.map((s) => <li key={s} className="text-sm text-slate-700 dark:text-slate-300">{s}</li>)}</ul>
              ) : <p className="text-sm text-slate-400">None yet.</p>}
            </div>
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-2">Weaknesses · bottom third</h3>
              {report.summary.weaknesses.length ? (
                <ul className="space-y-1">{report.summary.weaknesses.map((s) => <li key={s} className="text-sm text-slate-700 dark:text-slate-300">{s}</li>)}</ul>
              ) : <p className="text-sm text-slate-400">None.</p>}
            </div>
          </div>
        )}
      </section>

      <section className={`${card} overflow-hidden`}>
        <SectionHeader title="Rank matrix" hint="Rank on each criterion, 1 = best. Weighted criteria make up the overall score." />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60">
                <th className={`${th} text-left sticky left-0 bg-slate-50 dark:bg-slate-800`} rowSpan={2}>Listing</th>
                <th className={`${th} text-center`} rowSpan={2}>Overall</th>
                {CRITERION_GROUPS.map((g) => (
                  <th key={g} colSpan={CRITERIA.filter((c) => c.group === g).length} className={`${th} text-center border-l border-slate-200 dark:border-slate-700`}>{g}</th>
                ))}
              </tr>
              <tr className="bg-slate-50 dark:bg-slate-800/60">
                {CRITERIA.map((c, i) => (
                  <th key={c.id} title={`${c.label}: ${c.description}${c.weight ? ` Weight ${c.weight}%.` : ''}`}
                    className={`text-[9px] leading-tight font-bold text-slate-500 px-1 pb-2 text-center align-bottom min-w-9 ${i === 0 || CRITERIA[i - 1].group !== c.group ? 'border-l border-slate-200 dark:border-slate-700' : ''}`}>
                    {c.short}{c.weight > 0 && <span className="text-blue-500">*</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {report.listings.map((l) => (
                <tr key={l.id} className={l.isSelf ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''}>
                  <td className={`${td} sticky left-0 ${l.isSelf ? 'bg-blue-50 dark:bg-slate-900' : 'bg-white dark:bg-slate-900'}`}><ListingName listing={l} /></td>
                  <td className={`${td} text-center`}>
                    <span className="font-black text-slate-900 dark:text-white">{l.score !== null ? Math.round(l.score) : '—'}</span>
                    <span className="text-[10px] text-slate-400"> · #{l.overallRank ?? '—'}</span>
                  </td>
                  {CRITERIA.map((c, i) => (
                    <td key={c.id} title={`${c.label}: ${formatCriterion(c.id, l.metrics[c.id])}`}
                      className={`px-1 py-2 text-center ${i === 0 || CRITERIA[i - 1].group !== c.group ? 'border-l border-slate-100 dark:border-slate-800' : ''}`}>
                      <RankChip rank={l.ranks[c.id]} count={n} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-6 py-3 text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
          <span className="text-blue-500">*</span> In the score: {CRITERIA.filter((c) => c.weight > 0).map((c) => `${c.short} ${c.weight}%`).join(' · ')}. n/a = fewer than 5 reviews in the period (3 negative reviews for negative replies); its weight is redistributed.
        </p>
      </section>

      {CRITERION_GROUPS.map((group) => {
        const criteria = CRITERIA.filter((c) => c.group === group);
        return (
          <section key={group} className={`${card} overflow-hidden`}>
            <SectionHeader title={group} />
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className={`${th} text-left`}>Listing</th>
                    {criteria.map((c) => <th key={c.id} className={`${th} text-right`} title={c.description}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {[...report.listings].sort((a, b) => (a.ranks[criteria[0].id] ?? Infinity) - (b.ranks[criteria[0].id] ?? Infinity)).map((l) => (
                    <tr key={l.id} className={l.isSelf ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''}>
                      <td className={td}><ListingName listing={l} /></td>
                      {criteria.map((c) => (
                        <td key={c.id} className={`${td} text-right`}>
                          <Value listing={l} id={c.id} />
                          {l.ranks[c.id] !== null && c.id !== 'mapsRank' && <span className={`ml-1.5 text-[10px] font-black ${l.ranks[c.id] === 1 ? 'text-emerald-600' : 'text-slate-400'}`}>#{l.ranks[c.id]}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-6 py-2.5 text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
              {criteria.map((c) => `${c.label}: ${c.description}`).join(' ')}
            </p>
          </section>
        );
      })}

      <section className="text-[11px] text-slate-400 space-y-1 px-1">
        <p><span className="font-black uppercase tracking-widest text-[10px]">Method</span> Google reviews via DataForSEO, fetched newest first and dated by publication time. ISO weeks (Monday to Sunday) in {report.timeZone}; the current week and month are excluded from averages.</p>
        <p>Reply rate only counts reviews older than 7 days. Reviews analysed: {report.listings.map((l) => `${l.title} ${l.reviewsInPeriod}`).join(' · ')}.</p>
      </section>
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

function coverageLabel(listing: BenchmarkListing, timeZone: string): string {
  if (listing.lastFetchAt === null) return 'Not fetched yet';
  if (listing.coverage.complete) return 'Full history';
  return listing.coverage.from !== null ? `Since ${formatDay(listing.coverage.from, timeZone)}` : 'Unknown';
}

export function DataView({ benchmarkId, listings, tasks, report, timeZone }: {
  benchmarkId: string; listings: BenchmarkListing[]; tasks: ReviewTask[]; report: ComparisonReport | null; timeZone: string;
}) {
  const titles = new Map(listings.map((l) => [l.id, l.title]));
  const partial = new Set(report?.listings.filter((l) => l.partial).map((l) => l.id) ?? []);
  const inPeriod = new Map(report?.listings.map((l) => [l.id, l.reviewsInPeriod]) ?? []);
  const self = listings.find((l) => l.isSelf);
  const totalCost = tasks.reduce((sum, t) => sum + (t.cost ?? 0), 0);
  return (
    <div className="space-y-6">
      <section className={`${card} overflow-hidden`}>
        <SectionHeader title="Listings">
          <form action={setSelfListingAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={benchmarkId} />
            <label htmlFor="rv-self" className="text-[10px] font-black uppercase tracking-widest text-slate-400 inline-flex items-center gap-1"><Star className="w-3 h-3" /> My listing</label>
            <select id="rv-self" name="listing_id" defaultValue={self ? String(self.id) : ''} className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 max-w-56">
              <option value="">None</option>
              {listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
            <button type="submit" className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800">Save</button>
          </form>
        </SectionHeader>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr className="text-left">
                <th className={th}>Listing</th><th className={th}>Address</th><th className={`${th} text-right`}>Maps pos.</th>
                <th className={`${th} text-right`}>Google</th><th className={th}>Coverage</th><th className={`${th} text-right`}>Reviews in period</th><th className={th}>Last fetch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {listings.map((l) => (
                <tr key={l.id} className={l.isSelf ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''}>
                  <td className={td}><ListingName listing={{ title: l.title, isSelf: l.isSelf, partial: partial.has(l.id) }} /></td>
                  <td className={`${td} text-xs text-slate-500 max-w-64 truncate`} title={l.address ?? ''}>{l.address ?? '—'}</td>
                  <td className={`${td} text-right`}>{l.mapsRank ? `#${l.mapsRank}` : '—'}</td>
                  <td className={`${td} text-right`}>{l.rating !== null ? `${l.rating.toFixed(1)}★` : '—'} <span className="text-slate-400">· {l.totalReviews ?? '—'}</span></td>
                  <td className={`${td} ${partial.has(l.id) ? 'text-amber-600' : ''}`}>{coverageLabel(l, timeZone)}</td>
                  <td className={`${td} text-right`}>{inPeriod.get(l.id) ?? '—'}</td>
                  <td className={`${td} text-xs text-slate-500`}>{l.lastFetchAt ? formatDay(l.lastFetchAt, timeZone) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <SectionHeader title="DataForSEO tasks" hint={`${tasks.length} tasks · $${totalCost.toFixed(4)} in total`} />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr className="text-left">
                <th className={th}>Created</th><th className={th}>Listing</th><th className={th}>Kind</th>
                <th className={`${th} text-right`}>Depth</th><th className={th}>Status</th><th className={`${th} text-right`}>Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {tasks.map((t) => (
                <tr key={t.taskId}>
                  <td className={`${td} text-xs text-slate-500`}>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(t.createdAt))}</td>
                  <td className={td}>{titles.get(t.listingId) ?? '—'}</td>
                  <td className={`${td} capitalize`}>{t.kind}</td>
                  <td className={`${td} text-right`}>{t.depth}</td>
                  <td className={td}>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${
                      t.status === 'ready' ? 'text-emerald-700 bg-emerald-50' : t.status === 'error' ? 'text-red-600 bg-red-50' : 'text-amber-700 bg-amber-50'
                    }`} title={t.errorMessage ?? undefined}>{t.status}</span>
                    {t.errorMessage && <span className="ml-2 text-xs text-red-500">{t.errorMessage}</span>}
                  </td>
                  <td className={`${td} text-right`}>{t.cost !== null ? `$${t.cost.toFixed(5)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
