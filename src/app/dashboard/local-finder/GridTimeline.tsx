import type { BrandStyle } from '@/lib/brand';
import type { GridSchedule, GridSearchEntry } from '@/lib/db';
import { formatDistance, type DistanceUnit } from '@/lib/grid-preferences';
import { gridTimeZone } from '@/lib/grid-timezone';
import { DEFAULT_GRID_LAYOUT, describeGridLayout, gridPointCount } from '@/lib/grid-layout';
import { GridSnapshotSelectionProvider, GridSelectedSnapshotExportButton } from './GridSnapshotSelection';
import GridScheduleControl from './GridScheduleControl';
import GridAnalysisPanel from './GridAnalysisPanel';
import GridRunButton from './GridRunButton';
import DeleteMonitorButton from './DeleteMonitorButton';
import { type GridMapSnapshot } from './GridSnapshotMapPanel';
import { type GridPositionTrendPoint } from './GridPositionTrend';

type Props = {
  entry: GridSearchEntry;
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

/** One monitor: header and actions, then the single map driven by the selected snapshot, then its schedule. */
export default function GridTimeline({ entry, snapshots, schedule, brandName, brandLogoUrl, brandColor, brandFooter, brandStyle, trend, distanceUnit }: Props) {
  const mapId = `geo-grid-report-map-${entry.id}`;
  const layout = entry.layout ?? DEFAULT_GRID_LAYOUT;
  const pointCount = gridPointCount(entry.grid_size, layout);

  return (
    <GridSnapshotSelectionProvider selectedId={entry.id}>
    <article aria-labelledby="monitor-title" className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 id="monitor-title" className="text-xl font-black tracking-tight text-slate-900 [overflow-wrap:anywhere] dark:text-white">{entry.keyword}</h2>
          <p className="mt-1 text-sm text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">
            <span className="font-bold">{entry.target}</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            {describeGridLayout(entry.grid_size, layout)} · top {entry.depth ?? 20} results · {formatDistance(entry.spacing_km, distanceUnit)} spacing · {entry.language} results · centered on {entry.center}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <GridRunButton runId={entry.id} keyword={entry.keyword} pointCount={pointCount} lastMode={entry.queue_mode} depth={entry.depth} />
          <GridSelectedSnapshotExportButton snapshots={snapshots} fallbackResults={snapshots[0]?.results ?? []} fallbackTs={entry.ts} gridSize={entry.grid_size} layout={layout} spacingKm={entry.spacing_km} keyword={entry.keyword} target={entry.target} language={entry.language} brandName={brandName} brandLogoUrl={brandLogoUrl} brandColor={brandColor} brandFooter={brandFooter} brandStyle={brandStyle} mapElementId={mapId} />
          <DeleteMonitorButton runId={entry.id} keyword={entry.keyword} snapshotCount={snapshots.length} />
        </div>
      </header>

      <div className="px-5 py-6 sm:px-6">
        <GridAnalysisPanel
          snapshots={snapshots}
          selectedId={entry.id}
          gridSize={entry.grid_size}
          layout={layout}
          spacingKm={entry.spacing_km}
          target={entry.target}
          captureId={mapId}
          trend={trend}
          depth={entry.depth}
          center={entry.center}
          language={entry.language}
        />
      </div>

      <details className="group border-t border-slate-200 dark:border-slate-800" open={!!schedule}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 dark:text-white dark:hover:bg-slate-800/50 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span>Schedule</span>
          <span className="text-xs font-normal text-slate-600 dark:text-slate-400">
            {schedule ? `${schedule.frequency === 'daily' ? 'Every day' : 'Every week'} at ${schedule.time_of_day}` : 'Not scheduled'}
            <span aria-hidden="true" className="ml-2 inline-block transition-transform group-open:rotate-180">▾</span>
          </span>
        </summary>
        <div className="px-5 pb-5 sm:px-6">
          <GridScheduleControl runId={entry.id} schedule={schedule} pointCount={pointCount} depth={entry.depth} locationTimeZone={gridTimeZone(entry.center)} />
        </div>
      </details>
    </article>
    </GridSnapshotSelectionProvider>
  );
}
