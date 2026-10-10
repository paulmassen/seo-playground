'use client';

import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import type { GridSchedule } from '@/lib/db';
import { updateGridSchedule } from '../geo-grid/actions';

const days = [
  ['Sunday', 0], ['Monday', 1], ['Tuesday', 2], ['Wednesday', 3], ['Thursday', 4], ['Friday', 5], ['Saturday', 6],
] as const;

export default function GridScheduleControl({ runId, schedule }: { runId: string; schedule: GridSchedule | null }) {
  const [frequency, setFrequency] = useState<'off' | 'daily' | 'weekly'>(schedule?.frequency ?? 'off');
  const [timeZone, setTimeZone] = useState(schedule?.time_zone ?? 'UTC');

  useEffect(() => {
    if (!schedule) setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }, [schedule]);

  return (
    <form action={updateGridSchedule} className="border-t border-slate-200 pt-4 dark:border-slate-800">
      <input type="hidden" name="run_id" value={runId} />
      <input type="hidden" name="time_zone" value={timeZone} />
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-2.5">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <CalendarClock className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Automated checks</p>
            <p className="mt-0.5 max-w-sm text-[11px] leading-relaxed text-slate-400">A scheduler adds a new snapshot to this timeline at the selected time.</p>
          </div>
        </div>
        {schedule && (
          <span className="shrink-0 text-[10px] font-bold tabular-nums text-slate-400">
            Next {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: schedule.time_zone }).format(new Date(schedule.next_run_at))}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as 'off' | 'daily' | 'weekly')} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <option value="off">Not scheduled</option>
          <option value="daily">Every day</option>
          <option value="weekly">Every week</option>
        </select>
        <input name="time_of_day" type="time" defaultValue={schedule?.time_of_day ?? '08:00'} disabled={frequency === 'off'} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" />
        <select name="weekday" defaultValue={schedule?.weekday ?? 1} disabled={frequency !== 'weekly'} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {days.map(([label, value]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select name="queue_mode" defaultValue={schedule?.queue_mode ?? 'standard'} disabled={frequency === 'off'} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <option value="standard">Standard queue</option>
          <option value="priority">Priority queue</option>
        </select>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[10px] text-slate-400">{timeZone.replace(/_/g, ' ')} · Requires the configured cron endpoint.</p>
        <button type="submit" className="text-[10px] font-black uppercase tracking-widest text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-400">
          {frequency === 'off' ? 'Save' : 'Save schedule'}
        </button>
      </div>
    </form>
  );
}
