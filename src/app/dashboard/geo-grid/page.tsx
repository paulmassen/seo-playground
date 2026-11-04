import { withProjectScope } from '@/lib/db';
import { getBrandSettings } from '@/lib/brand-server';
import { getGridPreferences } from '@/lib/grid-preferences-server';
import { unitToKm } from '@/lib/grid-preferences';
import { DEFAULT_GRID_LAYOUT, gridLayoutFromParams, gridPointCount, type GridLayout } from '@/lib/grid-layout';
import {
  getCurrentProject, getCredentials, getSetting, getGridHistory, getGridEntry,
  getGridResults, getGridSeriesHistory, getGridSchedule, type GridSearchEntry, type GridPoint, type GridQueueMode,
} from '@/lib/db';
import { visibilityTone } from '@/lib/grid-rank-scale';
import { DEFAULT_GRID_DEPTH } from '@/lib/grid-pricing';
import LocalTime from '@/components/LocalTime';
import LocalFinderForm from '../local-finder/LocalFinderForm';
import HistorySidebar from '@/components/HistorySidebar';
import DeleteMonitorButton from '../local-finder/DeleteMonitorButton';
import GridPending from '../local-finder/GridPending';
import { GridPreferencesProvider } from '../local-finder/GridPreferences';
import GridTimeline from '../local-finder/GridTimeline';
import GridRunButton from '../local-finder/GridRunButton';
import type { GridPositionTrendPoint } from '../local-finder/GridPositionTrend';
import type { GridMapSnapshot } from '../local-finder/GridSnapshotMapPanel';

interface SearchParams {
  keyword?: string;
  location_coordinate?: string;
  language?: string;
  grid_size?: string;
  spacing_km?: string;
  grid_target?: string;
  grid_history_id?: string;
  queue_mode?: string;
  depth?: string;
  grid_shape?: string;
  grid_rotation?: string;
  grid_excluded?: string;
}

/** "5×5", or "5×5 · diamond" for a non-square monitor. */
function gridBadge(entry: { grid_size: number; layout?: GridLayout }) {
  const shape = entry.layout?.shape ?? 'square';
  return `${entry.grid_size}×${entry.grid_size}${shape === 'square' ? '' : ` · ${shape}`}`;
}

async function GeoGridPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const gridHistoryId = params.grid_history_id;

  const defaultLanguage = getSetting('default_language') ?? 'English';
  const defaultCoordinates = getSetting('default_coordinates') ?? '';
  const defaultDomain = getSetting('default_domain') ?? '';
  const brand = getBrandSettings();
  const brandName = brand.name;
  const brandLogoUrl = brand.logo ?? undefined;
  const gridPreferences = getGridPreferences();
  const { distanceUnit } = gridPreferences;

  let gridResults: GridPoint[] | null = null;
  let gridEntry: GridSearchEntry | null = null;
  let gridPending: { id: string; totalPoints: number; queueMode: GridQueueMode } | null = null;
  let gridError: { title: string; detail: string } | null = null;

  // Viewing a saved run. Rendering never bills: new runs start from server actions (POST) only,
  // so a refresh, the back button or an old "Run now" link can no longer pay DataForSEO again.
  if (gridHistoryId) {
    const entry = getGridEntry(gridHistoryId);
    if (!entry) {
      gridError = {
        title: 'This snapshot no longer exists.',
        detail: 'Its monitor was deleted, or the link belongs to another project. Switch project in the sidebar, or open one of the monitors below.',
      };
    } else if (entry.status === 'pending') {
      gridEntry = entry;
      gridPending = { id: entry.id, totalPoints: gridPointCount(entry.grid_size, entry.layout ?? DEFAULT_GRID_LAYOUT), queueMode: entry.queue_mode };
    } else {
      gridResults = getGridResults(gridHistoryId);
      gridEntry = entry;
    }
  } else if (params.keyword?.trim() && params.location_coordinate && params.grid_target) {
    // Legacy GET "run" URLs (bookmarks, old sidebar links) only prefill the form now.
    gridError = {
      title: 'Nothing was run.',
      detail: 'Runs now start from the form, after you confirm the API mode and its cost. The settings from your link are filled in below.',
    };
  }
  if (!creds && !gridEntry) {
    gridError = gridError ?? {
      title: 'Add your DataForSEO credentials first.',
      detail: 'Geo-grid runs are billed to your DataForSEO account. Add your API login in Settings, then come back to create a monitor.',
    };
  }

  const gridHistory = getGridHistory();
  const seriesRuns = gridEntry ? getGridSeriesHistory(gridEntry.series_id) : [];
  const gridSchedule = gridEntry ? getGridSchedule(gridEntry.series_id) : null;
  const completedSeriesRuns = seriesRuns.filter((run) => run.status === 'done');
  const mapSnapshots: GridMapSnapshot[] = completedSeriesRuns.map((run, index) => {
    const precedingRun = completedSeriesRuns[index + 1];
    return {
      id: run.id,
      ts: run.ts,
      status: run.status,
      visibility: run.summary?.ato ?? null,
      cost: run.cost,
      results: getGridResults(run.id) ?? [],
      previousResults: precedingRun ? getGridResults(precedingRun.id) : null,
    };
  });
  const trend: GridPositionTrendPoint[] = seriesRuns
    .slice()
    .reverse()
    .flatMap((run) => {
      if (run.status !== 'done') return [];
      const points = getGridResults(run.id);
      if (!points) return [];
      const total = gridPointCount(run.grid_size, run.layout ?? DEFAULT_GRID_LAYOUT);
      return [{
        id: run.id,
        ts: run.ts,
        total,
        top3: points.filter((point) => point.rank !== null && point.rank <= 3).length,
        top4To7: points.filter((point) => point.rank !== null && point.rank >= 4 && point.rank <= 7).length,
        top8To10: points.filter((point) => point.rank !== null && point.rank >= 8 && point.rank <= 10).length,
        top11Plus: points.filter((point) => point.rank !== null && point.rank >= 11).length,
      }];
    });
  // gridHistory is newest-first: keep the first entry seen per series (its latest run).
  // A plain `new Map(entries)` would let each older run overwrite it, surfacing the creation run.
  const latestBySeriesMap = new Map<string, GridSearchEntry>();
  for (const entry of gridHistory) {
    if (!latestBySeriesMap.has(entry.series_id)) latestBySeriesMap.set(entry.series_id, entry);
  }
  const latestBySeries = Array.from(latestBySeriesMap.values());

  const formDefaults = {
    keyword: (params.keyword ?? gridEntry?.keyword ?? '').toString(),
    location: '',
    locationCoordinate: (params.location_coordinate ?? gridEntry?.center ?? '').toString(),
    defaultCenter: defaultCoordinates,
    language: (params.language ?? gridEntry?.language ?? defaultLanguage).toString(),
    device: 'desktop',
    os: 'windows',
    // New monitors default to the top 10; a link or an open monitor keeps its own depth.
    depth: (params.depth ?? gridEntry?.depth ?? DEFAULT_GRID_DEPTH).toString(),
    minRating: '',
    timeFilter: '',
    gridMode: true,
    forceGridMode: true,
    gridSize: (params.grid_size ?? gridEntry?.grid_size ?? '5').toString(),
    // A new monitor starts at 1 km or 1 mi, following the Settings distance unit.
    spacingKm: (params.spacing_km ?? gridEntry?.spacing_km ?? unitToKm(1, distanceUnit)).toString(),
    gridTarget: (params.grid_target ?? gridEntry?.target ?? defaultDomain).toString(),
    queueMode: (params.queue_mode ?? 'standard').toString(),
    gridLayout: params.keyword
      ? gridLayoutFromParams(params, parseInt(params.grid_size ?? '5', 10))
      : gridEntry?.layout ?? DEFAULT_GRID_LAYOUT,
  };

  // Compact rows for the narrow sidebar shown next to an open monitor.
  const monitorItems = latestBySeries.map((entry) => {
    const isActive = entry.series_id === gridEntry?.series_id;
    const isPending = entry.status === 'pending';
    const layout = entry.layout ?? DEFAULT_GRID_LAYOUT;
    return (
      <div key={entry.id} className={`relative px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
        <a href={`/dashboard/geo-grid?grid_history_id=${entry.id}#results`} aria-current={isActive ? 'page' : undefined} className="block min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <p className={`truncate text-sm font-bold ${isActive ? 'text-blue-800 dark:text-blue-200' : 'text-slate-900 dark:text-slate-100'}`}>{entry.keyword}</p>
          <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400" title={entry.target}>{entry.target}</p>
          <p className="mt-1 flex items-baseline justify-between gap-2 text-xs tabular-nums text-slate-600 dark:text-slate-400">
            <span>{gridBadge(entry)} · <LocalTime ts={entry.ts} /></span>
            {isPending
              ? <span className="font-bold text-amber-800 dark:text-amber-300">Processing</span>
              : entry.summary && <span className={`font-bold ${visibilityTone(entry.summary.ato).text}`}>{entry.summary.ato}%</span>}
          </p>
        </a>
        <div className="mt-1.5 flex items-center justify-end gap-1">
          <DeleteMonitorButton runId={entry.id} keyword={entry.keyword} compact />
          {!isPending && <GridRunButton runId={entry.id} keyword={entry.keyword} pointCount={gridPointCount(entry.grid_size, layout)} lastMode={entry.queue_mode} depth={entry.depth} compact />}
        </div>
      </div>
    );
  });

  return (
    <GridPreferencesProvider value={gridPreferences}>
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Geo-grid monitors</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Track where a business ranks across a map, then revisit the same grid over time.</p>
        </div>
        {gridEntry && (
          <a href="/dashboard/geo-grid" className="text-sm font-bold text-blue-700 hover:underline dark:text-blue-300 lg:hidden">
            All monitors ({latestBySeries.length})
          </a>
        )}
      </div>

      <div className="space-y-6">
        {gridError && (
          <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="font-bold">{gridError.title}</p>
            <p className="mt-0.5">{gridError.detail}</p>
            {!creds && <a href="/dashboard/settings" className="mt-1 inline-block font-bold underline">Open Settings</a>}
          </div>
        )}

        <details className="group rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" open={latestBySeries.length === 0 || !!gridError}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-slate-800/50 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-sm font-bold text-slate-900 dark:text-white">New monitor</span>
              <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-400">Pick a grid center, a keyword and the business to track. The price shows before you run.</span>
            </span>
            <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-300 text-lg text-slate-700 transition-transform group-open:rotate-45 dark:border-slate-700 dark:text-slate-300">+</span>
          </summary>
          <div className="border-t border-slate-200 px-5 py-5 dark:border-slate-800"><LocalFinderForm defaults={formDefaults} /></div>
        </details>

        {!gridEntry && latestBySeries.length > 0 && (
          <section aria-labelledby="monitor-list-title">
            <h2 id="monitor-list-title" className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
              Monitors <span className="font-normal text-slate-600 dark:text-slate-400">· {latestBySeries.length}</span>
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {latestBySeries.map((entry) => {
                const tone = entry.summary ? visibilityTone(entry.summary.ato) : null;
                return (
                  <li key={entry.id}>
                    <a href={`/dashboard/geo-grid?grid_history_id=${entry.id}#results`} className="flex h-full items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500">
                      <span className="min-w-0">
                        <span className="block truncate text-base font-bold text-slate-900 dark:text-white">{entry.keyword}</span>
                        <span className="mt-0.5 block truncate text-sm text-slate-700 dark:text-slate-300" title={entry.target}>{entry.target}</span>
                        <span className="mt-2 block text-xs tabular-nums text-slate-600 dark:text-slate-400">
                          {gridBadge(entry)} · {entry.center} · last run <LocalTime ts={entry.ts} />
                        </span>
                      </span>
                      {entry.summary && tone ? (
                        <span className="shrink-0 text-right">
                          <span className={`block text-2xl font-black tabular-nums ${tone.text}`}>{entry.summary.ato}%</span>
                          <span className="block text-xs text-slate-600 dark:text-slate-400">visibility</span>
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs font-bold text-amber-800 dark:text-amber-300">Processing</span>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* The creation form above keeps the full width; the monitors list only sits next to an open monitor. */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div id="results" className="flex-1 min-w-0 w-full">
            {gridPending && gridEntry && (
              <GridPending
                searchId={gridPending.id}
                projectId={getCurrentProject().id}
                totalPoints={gridPending.totalPoints}
                queueMode={gridPending.queueMode}
                keyword={gridEntry.keyword}
                target={gridEntry.target}
                gridSize={gridEntry.grid_size}
                layout={gridEntry.layout}
                startedAt={gridEntry.ts}
              />
            )}
            {gridResults && gridEntry && (
              <>
                <GridTimeline
                  entry={gridEntry}
                  snapshots={mapSnapshots}
                  schedule={gridSchedule}
                  brandName={brandName}
                  brandLogoUrl={brandLogoUrl}
                  brandColor={brand.color}
                  brandFooter={brand.footer}
                  brandStyle={brand}
                  trend={trend}
                  distanceUnit={distanceUnit}
                />
              </>
            )}
          </div>
          {gridEntry && latestBySeries.length > 0 && (
            <HistorySidebar title="Monitors" items={monitorItems} compact />
          )}
        </div>
      </div>
    </div>
    </GridPreferencesProvider>
  );
}

export default withProjectScope(GeoGridPage);
