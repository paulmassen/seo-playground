'use client';

import Link from 'next/link';
import { Bell, Check, ChevronRight, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Task = {
  id: string;
  keyword: string;
  target: string;
  status: 'pending' | 'done';
  ready: number;
  total: number;
};

const POLL_MS = 15_000;
const COMPLETE_FOR_MS = 45_000;

export default function GridTaskCenter() {
  const router = useRouter();
  const [pending, setPending] = useState<Task[]>([]);
  const [completed, setCompleted] = useState<Task[]>([]);
  const [open, setOpen] = useState(false);
  const running = useRef(false);
  const completedAt = useRef(new Map<string, number>());

  useEffect(() => {
    const poll = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const response = await fetch('/api/grid-tasks', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json() as { tasks?: Task[] };
        const tasks = data.tasks ?? [];
        const done = tasks.filter((task) => task.status === 'done');
        const now = Date.now();
        if (done.length > 0) {
          done.forEach((task) => completedAt.current.set(task.id, now));
          setCompleted((current) => {
            const byId = new Map(current.map((task) => [task.id, task]));
            done.forEach((task) => byId.set(task.id, task));
            return [...byId.values()];
          });
          router.refresh();
        }
        setPending(tasks.filter((task) => task.status === 'pending'));
        setCompleted((current) => current.filter((task) => (now - (completedAt.current.get(task.id) ?? now)) < COMPLETE_FOR_MS));
      } catch {
        // A background status check should never disturb the user’s current work.
      } finally {
        running.current = false;
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(interval);
  }, [router]);

  const total = pending.length + completed.length;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Geo-grid tasks"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`relative grid h-8 w-8 place-items-center rounded-lg transition-colors ${total > 0 ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200'}`}
      >
        {pending.length > 0 ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
        {total > 0 && <span className={`absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-black text-white ${pending.length > 0 ? 'bg-blue-600' : 'bg-emerald-600'}`}>{total}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div><p className="text-xs font-black text-slate-900 dark:text-white">Geo-grid tasks</p><p className="mt-0.5 text-[10px] text-slate-400">Progress continues while you work.</p></div>
            {pending.length > 0 && <span className="text-[10px] font-bold tabular-nums text-blue-600 dark:text-blue-400">{pending.length} running</span>}
          </div>
          {total === 0 ? <p className="px-4 py-6 text-center text-xs text-slate-400">No Geo-grid task in progress.</p> : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {completed.map((task) => <Link key={`done-${task.id}`} href={`/dashboard/geo-grid?grid_history_id=${task.id}#results`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"><Check className="h-3.5 w-3.5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{task.keyword}</span><span className="block truncate text-[10px] text-emerald-600 dark:text-emerald-400">Report ready · {task.target}</span></span><ChevronRight className="h-3.5 w-3.5 text-slate-400" /></Link>)}
              {pending.map((task) => <Link key={task.id} href={`/dashboard/geo-grid?grid_history_id=${task.id}#results`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{task.keyword}</span><span className="block truncate text-[10px] text-slate-400">{task.target} · {task.ready}/{task.total} points</span></span><ChevronRight className="h-3.5 w-3.5 text-slate-400" /></Link>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
