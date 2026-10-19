import { withProjectScope } from '@/lib/db';
import { redirect } from 'next/navigation';
import { getBrandSettings } from '@/lib/brand-server';
import { getGridPreferences } from '@/lib/grid-preferences-server';
import { unitToKm } from '@/lib/grid-preferences';
import { DEFAULT_GRID_LAYOUT, gridLayoutFromParams, gridLayoutParams, gridPointCount, type GridLayout } from '@/lib/grid-layout';
import {
  getCurrentProject, getCredentials, getSetting, getGridHistory, getGridEntry, saveGridSearch,
  saveGridSearchPending, getGridResults, getGridSeriesHistory, getGridSchedule, gridSeriesId, type GridSearchEntry, type GridPoint, type GridQueueMode,
} from '@/lib/db';
import LocalFinderForm from '../local-finder/LocalFinderForm';
import HistorySidebar from '@/components/HistorySidebar';
import DeleteMonitorButton from '../local-finder/DeleteMonitorButton';
import GridPending from '../local-finder/GridPending';
import { GridPreferencesProvider } from '../local-finder/GridPreferences';
import GridTimeline from '../local-finder/GridTimeline';
import type { GridPositionTrendPoint } from '../local-finder/GridPositionTrend';
import type { GridMapSnapshot } from '../local-finder/GridSnapshotMapPanel';
import { fetchGridSearch, postGridTasksQueue, stableGridId } from '../local-finder/grid-api';

interface SearchParams {
  keyword?: string;
  location_coordinate?: string;
  language?: string;
  grid_size?: string;
  spacing_km?: string;
  grid_target?: string;
  grid_history_id?: string;
  queue_mode?: string;
  grid_shape?: string;
  grid_rotation?: string;
  grid_excluded?: string;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** "5×5", or "5×5 · diamond" for a non-square monitor. */
function gridBadge(entry: { grid_size: number; layout?: GridLayout }) {
  const shape = entry.layout?.shape ?? 'square';
  return `${entry.grid_size}×${entry.grid_size}${shape === 'square' ? '' : ` · ${shape}`}`;
}

/** Short form for the narrow monitors sidebar, e.g. "18 Oct, 10:06". */
function formatShortDate(ts: number) {
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

function gridRerunUrl(entry: { keyword: string; center: string; grid_size: number; spacing_km: number; target: string; language: string; queue_mode: string; layout?: GridLayout }) {
  const p = new URLSearchParams({
    ...gridLayoutParams(entry.layout ?? DEFAULT_GRID_LAYOUT),
    keyword: entry.keyword,
    location_coordinate: entry.center,
    grid_size: String(entry.grid_size),
    spacing_km: String(entry.spacing_km),
    grid_target: entry.target,
    language: entry.language,
    queue_mode: entry.queue_mode,
    mode: 'grid',
  });
  return `/dashboard/geo-grid?${p.toString()}`;
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
  let gridError: string | null = null;

  // Load from history
  if (gridHistoryId) {
    const entry = getGridEntry(gridHistoryId);
    if (!entry) {
      gridError = 'Monitor not found.';
    } else if (entry.status === 'pending') {
      gridEntry = entry;
      gridPending = { id: entry.id, totalPoints: gridPointCount(entry.grid_size, entry.layout ?? DEFAULT_GRID_LAYOUT), queueMode: entry.queue_mode };
    } else {
      gridResults = getGridResults(gridHistoryId);
      gridEntry = entry;
    }
  }

  // Fresh grid search
  if (!gridHistoryId && params.keyword?.trim() && params.location_coordinate && params.grid_target) {
    if (!creds) {
      gridError = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const gridSize = Math.min(Math.max(parseInt(params.grid_size ?? '5', 10), 3), 11);
      const spacingKm = parseFloat(params.spacing_km ?? '1');
      const queueMode = (params.queue_mode ?? 'live') as GridQueueMode;
      const language = params.language ?? defaultLanguage;
      // Shape, rotation and skipped points are chosen once, when the monitor is created.
      const layout = gridLayoutFromParams(params, gridSize);
      const seriesId = gridSeriesId(
        params.keyword, params.location_coordinate, gridSize, spacingKm, params.grid_target, language, layout,
      );

      const id = stableGridId(
        params.keyword, params.location_coordinate, gridSize, spacingKm, params.grid_target, queueMode, layout,
      );

      if (!getGridEntry(id)) {
        const baseEntry: GridSearchEntry = {
          id, ts: Date.now(),
          series_id: seriesId,
          keyword: params.keyword,
          target: params.grid_target,
          center: params.location_coordinate,
          grid_size: gridSize,
          spacing_km: spacingKm,
          language,
          status: 'done',
          queue_mode: queueMode,
          layout,
        };

        if (queueMode === 'live') {
          const result = await fetchGridSearch(
            params.keyword, params.location_coordinate,
            gridSize, spacingKm, params.language ?? defaultLanguage,
            params.grid_target, creds.login, creds.pass, layout,
          );
          if (result.error) {
            gridError = result.error;
          } else {
            saveGridSearch({ ...baseEntry, cost: result.cost }, result.results);
          }
        } else {
          const result = await postGridTasksQueue(
            params.keyword, params.location_coordinate,
            gridSize, spacingKm, params.language ?? defaultLanguage,
            creds.login, creds.pass, queueMode, layout,
          );
          if (result.error) gridError = result.error;
          // A failure after some chunks were posted still leaves billed tasks to collect.
          if (result.taskPoints.length > 0) {
            saveGridSearchPending({ ...baseEntry, status: 'pending', cost: result.cost }, result.taskPoints);
          }
        }
      }

      // Redirect to a stable history-id URL so every subsequent poll / router.refresh() looks up
      // this exact entry by id instead of recomputing stableGridId() — which is time-windowed and
      // would otherwise mint a new id (and restart the whole grid from scratch) once enough time
      // has passed, which is exactly what happens on long-running standard/priority queue searches.
      if (!gridError) {
        redirect(`/dashboard/geo-grid?grid_history_id=${id}#results`);
      }
    }
  }

  const gridHistory = getGridHistory();
  const seriesRuns = gridEntry ? getGridSeriesHistory(gridEntry.series_id) : [];
  const selectedRunIndex = seriesRuns.findIndex((run) => run.id === gridEntry?.id);
  const previousRun = selectedRunIndex >= 0 ? seriesRuns[selectedRunIndex + 1] : undefined;
  const previousResults = previousRun?.status === 'done' ? getGridResults(previousRun.id) : null;
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
    depth: '20',
    minRating: '',
    timeFilter: '',
    gridMode: true,
    forceGridMode: true,
    gridSize: (params.grid_size ?? gridEntry?.grid_size ?? '5').toString(),
    // A new monitor starts at 1 km or 1 mi, following the Settings distance unit.
    spacingKm: (params.spacing_km ?? gridEntry?.spacing_km ?? unitToKm(1, distanceUnit)).toString(),
    gridTarget: (params.grid_target ?? gridEntry?.target ?? defaultDomain).toString(),
    queueMode: (params.queue_mode ?? gridEntry?.queue_mode ?? 'live').toString(),
    gridLayout: params.keyword
      ? gridLayoutFromParams(params, parseInt(params.grid_size ?? '5', 10))
      : gridEntry?.layout ?? DEFAULT_GRID_LAYOUT,
  };

  // Compact rows for the narrow sidebar shown next to an open monitor.
  const monitorItems = latestBySeries.map((entry) => {
    const isActive = entry.series_id === gridEntry?.series_id;
    const isPending = entry.status === 'pending';
    return (
      <div key={entry.id} className={`px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
        <a href={`/dashboard/geo-grid?grid_history_id=${entry.id}#results`} className="block min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className={`text-[13px] font-bold truncate ${isActive ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-slate-200'}`}>
              {entry.keyword}
            </p>
            <span className="text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">{gridBadge(entry)}</span>
            {isPending && (
              <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded shrink-0">Pending</span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">{entry.target}</p>
          {entry.summary && (
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${entry.summary.ato}%` }} />
              </div>
              <span className="text-[10px] font-black text-emerald-600 tabular-nums shrink-0">{entry.summary.ato}%</span>
            </div>
          )}
        </a>
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <span className="text-[10px] text-slate-400 tabular-nums" title={`Last run ${formatDate(entry.ts)}`}>{formatShortDate(entry.ts)}</span>
          <div className="flex items-center gap-2.5">
            <DeleteMonitorButton runId={entry.id} compact />
            <a
              href={gridRerunUrl(entry)}
              className="text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-800 transition-colors"
              title="Run this monitor now"
            >
              Run ↻
            </a>
          </div>
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
          <p className="text-sm text-slate-400 mt-1">Track a keyword and target domain across a location, then revisit its map over time.</p>
        </div>
        {/* An open monitor has the sidebar list; an error page has no other way back. */}
        {gridError && latestBySeries.length > 0 && (
          <a href="/dashboard/geo-grid" className="text-[10px] font-black uppercase tracking-widest text-slate-400 transition-colors hover:text-blue-600">
            ← All monitors ({latestBySeries.length})
          </a>
        )}
      </div>

      <div className="space-y-6">
        <details className="group rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-5 dark:border-blue-900/70 dark:bg-blue-950/20" open={latestBySeries.length === 0 || !!gridError}>
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black text-slate-900 dark:text-white">Add a location and keyword to monitor</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Choose the map center, keyword, and target domain or business.</p>
              </div>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-600 text-lg font-medium text-white transition-transform group-open:rotate-45">+</span>
            </div>
          </summary>
          <div className="mt-5 border-t border-blue-100 pt-5 dark:border-blue-900/60"><LocalFinderForm defaults={formDefaults} /></div>
        </details>

        {!gridEntry && !gridError && latestBySeries.length > 0 && (
          <section aria-labelledby="monitor-list-title">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Your monitoring</p>
                <h2 id="monitor-list-title" className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white">Keyword &amp; location pairs</h2>
              </div>
              <span className="text-xs font-bold tabular-nums text-slate-400">{latestBySeries.length} active</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {latestBySeries.map((entry) => (
                <a key={entry.id} href={`/dashboard/geo-grid?grid_history_id=${entry.id}#results`} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-950/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-base font-black text-slate-900 dark:text-white">{entry.keyword}</p><p className="mt-1 truncate text-xs font-semibold text-blue-600 dark:text-blue-400">{entry.target}</p></div>
                    <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">{gridBadge(entry)}</span>
                  </div>
                  <div className="mt-5 flex items-end justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div className="text-[11px] text-slate-400"><p>{entry.center}</p><p className="mt-0.5">Last run {formatDate(entry.ts)}</p></div>
                    {entry.summary ? <div className="text-right"><p className="text-lg font-black tabular-nums text-emerald-600">{entry.summary.ato}%</p><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">visibility</p></div> : <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Processing</p>}
                  </div>
                  <span className="mt-4 block text-[10px] font-black uppercase tracking-widest text-slate-400 transition-colors group-hover:text-blue-600">Open monitor →</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* The creation form above keeps the full width; the monitors list only sits next to an open monitor. */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div id="results" className="flex-1 min-w-0 w-full">
            {gridError && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{gridError}</div>
            )}
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
                  results={gridResults}
                  previousResults={previousResults}
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
