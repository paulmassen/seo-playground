import type { BrandStyle } from '@/lib/brand';
import type { GridPoint, GridSchedule, GridSearchEntry } from '@/lib/db';
import { formatDistance, type DistanceUnit } from '@/lib/grid-preferences';
import { computeGridSummary } from './grid-insights';
import { GridSnapshotSelectionProvider, GridSelectedSnapshotExportButton } from './GridSnapshotSelection';
import GridScheduleControl from './GridScheduleControl';
import GridAnalysisPanel from './GridAnalysisPanel';
import DeleteMonitorButton from './DeleteMonitorButton';
import { type GridMapSnapshot } from './GridSnapshotMapPanel';
import { type GridPositionTrendPoint } from './GridPositionTrend';

type Props = {
  entry: GridSearchEntry;
  results: GridPoint[];
  previousResults: GridPoint[] | null;
  snapshots: GridMapSnapshot[];
  schedule: GridSchedule | null;
  brandName: string;
  brandLogoUrl?: string;
  brandColor?: string;
  brandFooter?: string;
  brandStyle?: Partial<BrandStyle>;
  trend: GridPositionTrendPoint[];
  distanceUnit: DistanceUnit;
};

function metricDelta(current: number | null, previous: number | null, inverse = false) {
  if (current === null || previous === null) return null;
  const raw = inverse ? previous - current : current - previous;
  // Round to 1 decimal to avoid floating-point artifacts (e.g. 9.3 - 9.5 = -0.19999999999999929).
  const value = Math.round(raw * 10) / 10;
  if (value === 0) return 'No change';
  return `${value > 0 ? '+' : ''}${value}`;
}

export default function GridTimeline({ entry, results, previousResults, snapshots, schedule, brandName, brandLogoUrl, brandColor, brandFooter, brandStyle, trend, distanceUnit }: Props) {
  const current = computeGridSummary(results);
  const previous = previousResults ? computeGridSummary(previousResults) : null;
  const mapId = `geo-grid-report-map-${entry.id}`;
  const metrics = [
    { label: 'Visibility', value: `${current.ato}%`, delta: metricDelta(current.ato, previous?.ato ?? null), good: (current.ato - (previous?.ato ?? current.ato)) >= 0 },
    { label: 'Average rank', value: current.avgRank == null ? '—' : `#${current.avgRank}`, delta: metricDelta(current.avgRank, previous?.avgRank ?? null, true), good: (previous?.avgRank ?? current.avgRank ?? 0) - (current.avgRank ?? 0) >= 0 },
    { label: 'Top 3', value: String(current.top3Count), delta: metricDelta(current.top3Count, previous?.top3Count ?? null), good: (current.top3Count - (previous?.top3Count ?? current.top3Count)) >= 0 },
    { label: 'Found', value: `${current.foundCount}/${current.totalPoints}`, delta: metricDelta(current.foundCount, previous?.foundCount ?? null), good: (current.foundCount - (previous?.foundCount ?? current.foundCount)) >= 0 },
  ];

  return (
    <GridSnapshotSelectionProvider selectedId={entry.id}>
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Ranking monitor</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white">{entry.keyword}</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{entry.target} · {entry.grid_size}×{entry.grid_size} points · {formatDistance(entry.spacing_km, distanceUnit)} spacing</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/dashboard/geo-grid?keyword=${encodeURIComponent(entry.keyword)}&location_coordinate=${encodeURIComponent(entry.center)}&grid_size=${entry.grid_size}&spacing_km=${entry.spacing_km}&grid_target=${encodeURIComponent(entry.target)}&language=${encodeURIComponent(entry.language)}&queue_mode=${entry.queue_mode}&mode=grid`} className="inline-flex items-center rounded-xl border border-blue-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-900 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950">
              Run now
            </a>
            <GridSelectedSnapshotExportButton snapshots={snapshots} fallbackResults={results} fallbackTs={entry.ts} gridSize={entry.grid_size} spacingKm={entry.spacing_km} keyword={entry.keyword} target={entry.target} language={entry.language} brandName={brandName} brandLogoUrl={brandLogoUrl} brandColor={brandColor} brandFooter={brandFooter} brandStyle={brandStyle} mapElementId={mapId} />
            <DeleteMonitorButton runId={entry.id} />
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-100 pb-5 dark:border-slate-800 sm:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{metric.label}</p>
              <div className="mt-1 flex items-baseline gap-2"><span className="text-xl font-black tabular-nums text-slate-900 dark:text-white">{metric.value}</span>{metric.delta && <span className={`text-[10px] font-bold ${metric.delta === 'No change' ? 'text-slate-400' : metric.good ? 'text-emerald-600' : 'text-red-500'}`}>{metric.delta}</span>}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/50 px-5 dark:border-slate-800 dark:bg-slate-950/20">
          <GridScheduleControl runId={entry.id} schedule={schedule} />
        </div>

        <div className="mt-6">
          <GridAnalysisPanel
            snapshots={snapshots}
            selectedId={entry.id}
            gridSize={entry.grid_size}
            spacingKm={entry.spacing_km}
            keyword={entry.keyword}
            target={entry.target}
            language={entry.language}
            brandName={brandName}
            brandLogoUrl={brandLogoUrl}
            brandColor={brandColor}
            brandFooter={brandFooter} brandStyle={brandStyle}
            captureId={mapId}
            trend={trend}
          />
        </div>
      </div>
    </section>
    </GridSnapshotSelectionProvider>
  );
}
