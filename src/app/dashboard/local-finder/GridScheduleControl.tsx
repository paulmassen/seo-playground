'use client';

import { useEffect, useId, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import type { GridQueueMode, GridSchedule } from '@/lib/db';
import { LEGACY_GRID_DEPTH, estimateGridCost, formatUsd, type GridDepth } from '@/lib/grid-pricing';
import PendingButton from '@/components/PendingButton';
import { updateGridSchedule } from '../geo-grid/actions';

const days = [
  ['Sunday', 0], ['Monday', 1], ['Tuesday', 2], ['Wednesday', 3], ['Thursday', 4], ['Friday', 5], ['Saturday', 6],
] as const;

const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:disabled:bg-slate-800';
const labelClass = 'mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300';

export default function GridScheduleControl({ runId, schedule, pointCount, depth = LEGACY_GRID_DEPTH, locationTimeZone }: { runId: string; schedule: GridSchedule | null; pointCount: number; depth?: GridDepth; locationTimeZone: string | null }) {
  const [frequency, setFrequency] = useState<'off' | 'daily' | 'weekly'>(schedule?.frequency ?? 'off');
  const [mode, setMode] = useState<GridQueueMode>(schedule?.queue_mode ?? 'standard');
  const [timeZone, setTimeZone] = useState(locationTimeZone ?? schedule?.time_zone ?? 'UTC');
  const id = useId();

  useEffect(() => {
    if (!locationTimeZone && !schedule) setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }, [locationTimeZone, schedule]);

  const perRun = estimateGridCost(pointCount, mode, depth);
  const runsPerMonth = frequency === 'daily' ? 30 : frequency === 'weekly' ? 4.3 : 0;

  return (
    <form action={updateGridSchedule}>
      <input type="hidden" name="run_id" value={runId} />
      <input type="hidden" name="time_zone" value={timeZone} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-2.5">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Automatic snapshots</p>
            <p className="mt-0.5 max-w-md text-xs text-slate-600 dark:text-slate-400">
              Adds a snapshot to this timeline on a schedule, while the app’s background worker is running.
            </p>
          </div>
        </div>
        {schedule && (
          <p className="shrink-0 text-xs tabular-nums text-slate-600 dark:text-slate-400">
            Next run {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: schedule.time_zone }).format(new Date(schedule.next_run_at))} ({schedule.time_zone})
          </p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor={`${id}-frequency`} className={labelClass}>Repeat</label>
          <select id={`${id}-frequency`} name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as 'off' | 'daily' | 'weekly')} className={fieldClass}>
            <option value="off">Not scheduled</option>
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-time`} className={labelClass}>Time</label>
          <input id={`${id}-time`} name="time_of_day" type="time" defaultValue={schedule?.time_of_day ?? '08:00'} disabled={frequency === 'off'} className={fieldClass} />
        </div>
        <div>
          <label htmlFor={`${id}-weekday`} className={labelClass}>Day</label>
          <select id={`${id}-weekday`} name="weekday" defaultValue={schedule?.weekday ?? 1} disabled={frequency !== 'weekly'} className={fieldClass}>
            {days.map(([label, value]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-mode`} className={labelClass}>API mode</label>
          <select id={`${id}-mode`} name="queue_mode" value={mode} onChange={(event) => setMode(event.target.value as GridQueueMode)} disabled={frequency === 'off'} className={fieldClass}>
            <option value="standard">Standard · ≈{formatUsd(estimateGridCost(pointCount, 'standard', depth))}</option>
            <option value="priority">Priority · ≈{formatUsd(estimateGridCost(pointCount, 'priority', depth))}</option>
          </select>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {frequency !== 'off' && `≈${formatUsd(perRun)} per run, about ${formatUsd(perRun * runsPerMonth)} a month · `}
          {locationTimeZone ? `Map location time: ${timeZone}.` : `Map time zone unavailable; using ${timeZone}.`}
          {schedule && locationTimeZone && schedule.time_zone !== locationTimeZone && ' The existing schedule keeps its current time zone until you save.'}
        </p>
        <PendingButton
          type="submit"
          pendingChildren="Saving…"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 transition-colors hover:border-blue-500 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          {frequency === 'off' ? (schedule ? 'Turn off schedule' : 'Save') : 'Save schedule'}
        </PendingButton>
      </div>
    </form>
  );
}
