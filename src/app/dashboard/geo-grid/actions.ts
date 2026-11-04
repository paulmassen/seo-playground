'use server';

import { runWithCurrentProject } from '@/lib/db';

import { deleteGridSchedule, deleteGridSeries, getGridEntry, getSetting, saveGridSchedule, type GridQueueMode, type GridScheduleFrequency } from '@/lib/db';
import { DEFAULT_GRID_LAYOUT, gridLayoutFromParams } from '@/lib/grid-layout';
import { LEGACY_GRID_DEPTH, parseGridDepth, parseGridQueueMode } from '@/lib/grid-pricing';
import { normalizeGridSize } from '@/lib/grid-preferences';
import { gridTimeZone } from '@/lib/grid-timezone';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { startGridRun, type GridRunInput } from './run-grid';

/** Returned to the form or run button that started a paid run, so the error shows next to it. */
export type GridRunState = { error?: string; openId?: string } | null;

const COORDINATE = /^\s*-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?\s*$/;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

async function runAndOpen(input: GridRunInput): Promise<GridRunState> {
  const result = await startGridRun(input);
  if (result.error !== undefined) return { error: result.error, openId: result.id };
  revalidatePath('/dashboard/geo-grid');
  redirect(`/dashboard/geo-grid?grid_history_id=${encodeURIComponent(result.id)}#results`);
}

/**
 * Creates a monitor and pays for its first run. A POST on purpose: the previous GET form
 * billed again on refresh, back navigation or a reopened link.
 */
export async function createGridMonitor(_previous: GridRunState, formData: FormData): Promise<GridRunState> {
  return runWithCurrentProject(async () => {
    const keyword = text(formData, 'keyword');
    const center = text(formData, 'location_coordinate');
    const target = text(formData, 'grid_target');
    if (!keyword) return { error: 'Enter the keyword to monitor.' };
    if (!COORDINATE.test(center)) return { error: 'Set the grid center: click the map, or type coordinates as lat,lng.' };
    if (!target) return { error: 'Enter the target domain or business, or pick a Google listing on the map.' };

    const gridSize = normalizeGridSize(text(formData, 'grid_size'));
    const spacingKm = parseFloat(text(formData, 'spacing_km'));
    if (!Number.isFinite(spacingKm) || spacingKm <= 0) return { error: 'Choose the spacing between grid points.' };

    return runAndOpen({
      keyword,
      center: center.replace(/\s+/g, ''),
      gridSize,
      spacingKm,
      target,
      language: text(formData, 'language') || getSetting('default_language') || 'English',
      queueMode: parseGridQueueMode(text(formData, 'queue_mode')),
      depth: parseGridDepth(text(formData, 'depth')),
      layout: gridLayoutFromParams({
        grid_shape: text(formData, 'grid_shape') || undefined,
        grid_rotation: text(formData, 'grid_rotation') || undefined,
        grid_excluded: text(formData, 'grid_excluded') || undefined,
      }, gridSize),
    });
  });
}

/** Adds a snapshot to an existing monitor, in the API mode the user confirmed next to its price. */
export async function rerunGridMonitor(_previous: GridRunState, formData: FormData): Promise<GridRunState> {
  return runWithCurrentProject(async () => {
    const entry = getGridEntry(text(formData, 'run_id'));
    if (!entry) return { error: 'This monitor no longer exists. Reload the page to see the current list.' };
    return runAndOpen({
      keyword: entry.keyword,
      center: entry.center,
      gridSize: entry.grid_size,
      spacingKm: entry.spacing_km,
      target: entry.target,
      language: entry.language,
      queueMode: parseGridQueueMode(text(formData, 'queue_mode'), entry.queue_mode),
      // The depth is part of the monitor: changing it would make snapshots incomparable.
      depth: entry.depth ?? LEGACY_GRID_DEPTH,
      layout: entry.layout ?? DEFAULT_GRID_LAYOUT,
    });
  });
}

function safeTimeZone(value: FormDataEntryValue | null): string {
  const timeZone = typeof value === 'string' ? value : 'UTC';
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format();
    return timeZone;
  } catch {
    return 'UTC';
  }
}

export async function updateGridSchedule(formData: FormData) {
  return runWithCurrentProject(async () => {
    const runId = String(formData.get('run_id') ?? '');
    const frequency = formData.get('frequency') as GridScheduleFrequency | 'off';
    const entry = getGridEntry(runId);
    if (!entry) return;

    if (frequency === 'off') {
      deleteGridSchedule(entry.series_id);
    } else if (frequency === 'daily' || frequency === 'weekly') {
      const queueMode = formData.get('queue_mode') as GridQueueMode;
      saveGridSchedule({
        series_id: entry.series_id,
        keyword: entry.keyword,
        target: entry.target,
        center: entry.center,
        grid_size: entry.grid_size,
        spacing_km: entry.spacing_km,
        language: entry.language,
        layout: entry.layout,
        depth: entry.depth ?? LEGACY_GRID_DEPTH,
        queue_mode: queueMode === 'priority' || queueMode === 'standard' ? queueMode : 'standard',
        frequency,
        weekday: frequency === 'weekly' ? Number(formData.get('weekday')) : null,
        time_of_day: String(formData.get('time_of_day') ?? '08:00'),
        time_zone: gridTimeZone(entry.center) ?? safeTimeZone(formData.get('time_zone')),
      });
    }

    revalidatePath('/dashboard/geo-grid');
    redirect(`/dashboard/geo-grid?grid_history_id=${encodeURIComponent(runId)}#results`);
  });
}

/** Deletes a whole monitor (all snapshots and its schedule). */
export async function deleteGridMonitor(formData: FormData) {
  return runWithCurrentProject(async () => {
    const entry = getGridEntry(String(formData.get('run_id') ?? ''));
    if (entry) deleteGridSeries(entry.series_id);
    revalidatePath('/dashboard/geo-grid');
    redirect('/dashboard/geo-grid');
  });
}
