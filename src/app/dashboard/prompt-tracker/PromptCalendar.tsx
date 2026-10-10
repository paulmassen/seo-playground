import StatusDot from './StatusDot';
import { calendarWeeks } from '@/lib/prompt-report';
import type { PromptCheck } from '@/lib/db';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Calendar of mentions: one row per week, one cell per day with the status dot and the day number. */
export default function PromptCalendar({ checks }: { checks: PromptCheck[] }) {
  const weeks = calendarWeeks(checks);
  if (weeks.length === 0) return <p className="text-sm text-slate-400">No checks yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-separate border-spacing-1">
        <thead>
          <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            <th className="px-2 text-left font-black">Week of</th>
            {WEEKDAYS.map((d) => <th key={d} className="px-1 font-black">{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.monday}>
              <td className="px-2 whitespace-nowrap font-mono text-[11px] text-slate-500 dark:text-slate-400">{week.monday}</td>
              {week.days.map((day) => (
                <td key={day.date} className="p-0">
                  {day.inRange ? (
                    <div className="flex h-12 w-12 flex-col items-center justify-center gap-1 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                      <StatusDot status={day.status} size="sm" title={`${day.date}: ${day.status ?? 'no check'}`} />
                      <span className="text-[10px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">{Number(day.date.slice(8))}</span>
                    </div>
                  ) : (
                    <div className="h-12 w-12" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
