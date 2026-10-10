'use client';

import { useEffect, useState } from 'react';
import PendingButton from '@/components/PendingButton';
import type { PromptTrackerSchedule } from '@/lib/db';

export default function PromptScheduleControl({
  schedule,
  saveAction,
}: {
  schedule: PromptTrackerSchedule | null;
  saveAction: (formData: FormData) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(Boolean(schedule));
  const [timeZone, setTimeZone] = useState(schedule?.timeZone ?? 'UTC');

  useEffect(() => {
    if (!schedule) setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }, [schedule]);

  const nextRun = schedule
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: schedule.timeZone }).format(new Date(schedule.nextRunAt))
    : null;

  return (
    <form action={saveAction} className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="mr-auto">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} aria-hidden="true" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">Daily checks</span>
        </div>
        <p className="mt-0.5 text-[10px] font-medium text-slate-400">
          {nextRun ? `Next run: ${nextRun}` : 'Run every tracked prompt once a day.'}
        </p>
      </div>

      <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400">
        <input name="enabled" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
        Enabled
      </label>
      <input name="time_of_day" type="time" defaultValue={schedule?.timeOfDay ?? '08:00'} disabled={!enabled} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-violet-500 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" />
      <input type="hidden" name="time_zone" value={timeZone} />
      <span className="max-w-32 truncate text-[10px] font-medium text-slate-400" title={timeZone}>{timeZone.replace(/_/g, ' ')}</span>
      <PendingButton
        type="submit"
        className="rounded-lg bg-slate-100 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        pendingClassName="rounded-lg bg-slate-100 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:bg-slate-800"
        pendingChildren="Saving…"
      >
        Save schedule
      </PendingButton>
    </form>
  );
}
