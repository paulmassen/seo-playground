// Server-only: starts one paid Geo-grid run. Called from server actions only, never from a page render,
// so a GET (refresh, back button, link prefetch) can never bill a DataForSEO call.
import {
  getCredentials, getGridEntry, gridSeriesId, saveGridSearch, saveGridSearchPending,
  type GridQueueMode, type GridSearchEntry,
} from '@/lib/db';
import type { GridLayout } from '@/lib/grid-layout';
import type { GridDepth } from '@/lib/grid-pricing';
import { fetchGridSearch, postGridTasksQueue, stableGridId } from '../local-finder/grid-api';

export interface GridRunInput {
  keyword: string;
  center: string;
  gridSize: number;
  spacingKm: number;
  target: string;
  language: string;
  queueMode: GridQueueMode;
  layout: GridLayout;
  /** Results requested per point; the queues bill per 10. */
  depth: GridDepth;
}

/** `id` is set whenever an entry exists to open, including a queue run that failed after some billed chunks. */
export type GridRunResult = { id: string; error?: undefined } | { id?: string; error: string };

export async function startGridRun(input: GridRunInput): Promise<GridRunResult> {
  const creds = getCredentials();
  if (!creds) return { error: 'DataForSEO credentials are missing. Add them in Settings, then run again.' };

  const { keyword, center, gridSize, spacingKm, target, language, queueMode, layout, depth } = input;
  const seriesId = gridSeriesId(keyword, center, gridSize, spacingKm, target, language, layout, depth);
  // Time-windowed id: a double submit within the same minute opens the existing run instead of paying twice.
  const id = stableGridId(keyword, center, gridSize, spacingKm, target, queueMode, layout, depth);
  if (getGridEntry(id)) return { id };

  const baseEntry: GridSearchEntry = {
    id, ts: Date.now(), series_id: seriesId, keyword, target, center,
    grid_size: gridSize, spacing_km: spacingKm, language, status: 'done', queue_mode: queueMode, layout, depth,
  };

  if (queueMode === 'live') {
    const result = await fetchGridSearch(keyword, center, gridSize, spacingKm, language, target, creds.login, creds.pass, layout, depth);
    if (result.error) return { error: result.error };
    saveGridSearch({ ...baseEntry, cost: result.cost }, result.results);
    return { id };
  }

  const result = await postGridTasksQueue(keyword, center, gridSize, spacingKm, language, creds.login, creds.pass, queueMode, layout, depth);
  // A failure after some chunks were posted still leaves billed tasks to collect.
  if (result.taskPoints.length > 0) {
    saveGridSearchPending({ ...baseEntry, status: 'pending', cost: result.cost }, result.taskPoints);
  }
  if (result.error) return { id: result.taskPoints.length > 0 ? id : undefined, error: result.error };
  return { id };
}
