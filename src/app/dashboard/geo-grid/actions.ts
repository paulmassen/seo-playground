'use server';

import { runWithCurrentProject } from '@/lib/db';

import { deleteGridSchedule, deleteGridSeries, getGridEntry, saveGridSchedule, type GridQueueMode, type GridScheduleFrequency } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

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
        queue_mode: queueMode === 'priority' || queueMode === 'standard' ? queueMode : 'standard',
        frequency,
        weekday: frequency === 'weekly' ? Number(formData.get('weekday')) : null,
        time_of_day: String(formData.get('time_of_day') ?? '08:00'),
        time_zone: safeTimeZone(formData.get('time_zone')),
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
