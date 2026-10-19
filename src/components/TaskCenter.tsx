'use client';

import Link from 'next/link';
import { Bell, Check, ChevronRight, CircleAlert, LoaderCircle } from 'lucide-react';
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

type RunningAnalysis = { id: string; name: string; keyword: string; pending: number };
type FinishedAnalysis = { id: string; name: string; keyword: string; finishedAt: number; failed: number };
type AnalysisFeed = { running: RunningAnalysis[]; finished: FinishedAnalysis[] };
type RankTask = { taskId: string; keyword: string; domain: string; status: 'posting' | 'pending' | 'done' | 'failed'; finishedAt: number | null };
type RankFeed = { running: RankTask[]; finished: RankTask[] };

const POLL_MS = 15_000;
const COMPLETE_FOR_MS = 45_000;

/** Top-bar bell: Geo-grid, Rank Tracker and Review Velocity work (running, then ready to open). */
export default function TaskCenter() {
  const router = useRouter();
  const [pending, setPending] = useState<Task[]>([]);
  const [completed, setCompleted] = useState<Task[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisFeed>({ running: [], finished: [] });
  const [rankTasks, setRankTasks] = useState<RankFeed>({ running: [], finished: [] });
  const [open, setOpen] = useState(false);
  const runningGrid = useRef(false);
  const runningAnalyses = useRef(false);
  const runningRankTasks = useRef(false);
  const completedAt = useRef(new Map<string, number>());

  useEffect(() => {
    const pollGrid = async () => {
      if (runningGrid.current) return;
      runningGrid.current = true;
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
        runningGrid.current = false;
      }
    };

    const pollAnalyses = async () => {
      if (runningAnalyses.current) return;
      runningAnalyses.current = true;
      try {
        const response = await fetch('/api/review-velocity-tasks', { cache: 'no-store' });
        if (response.ok) setAnalyses(await response.json() as AnalysisFeed);
      } catch {
        // Same as above: keep the last known state until the next poll.
      } finally {
        runningAnalyses.current = false;
      }
    };

    const pollRankTasks = async () => {
      if (runningRankTasks.current) return;
      runningRankTasks.current = true;
      try {
        const response = await fetch('/api/rank-tracker-tasks', { cache: 'no-store' });
        if (response.ok) setRankTasks(await response.json() as RankFeed);
      } catch {
        // Keep the last known state until the next poll.
      } finally {
        runningRankTasks.current = false;
      }
    };

    const poll = () => {
      void pollGrid();
      void pollAnalyses();
      void pollRankTasks();
    };
    poll();
    const interval = window.setInterval(poll, POLL_MS);
    return () => window.clearInterval(interval);
  }, [router]);

  const runningCount = pending.length + analyses.running.length + rankTasks.running.length;
  const total = runningCount + completed.length + analyses.finished.length + rankTasks.finished.length;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Tasks and notifications"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`relative grid h-8 w-8 place-items-center rounded-lg transition-colors ${total > 0 ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200'}`}
      >
        {runningCount > 0 ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
        {total > 0 && <span className={`absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-black text-white ${runningCount > 0 ? 'bg-blue-600' : 'bg-emerald-600'}`}>{total}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div><p className="text-xs font-black text-slate-900 dark:text-white">Tasks</p><p className="mt-0.5 text-[10px] text-slate-400">Progress continues while you work.</p></div>
            {runningCount > 0 && <span className="text-[10px] font-bold tabular-nums text-blue-600 dark:text-blue-400">{runningCount} running</span>}
          </div>
          {total === 0 ? <p className="px-4 py-6 text-center text-xs text-slate-400">Nothing in progress.</p> : (
            <div className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {rankTasks.finished.map((task) => <Link key={`rank-done-${task.taskId}`} href={`/dashboard/rank-tracker?domain=${encodeURIComponent(task.domain)}&task_id=${encodeURIComponent(task.taskId)}#results`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${task.status === 'failed' ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300'}`}>{task.status === 'failed' ? <CircleAlert className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{task.keyword}</span><span className={`block truncate text-[10px] ${task.status === 'failed' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>Rank Tracker · {task.status === 'failed' ? 'Check failed' : 'Check ready'} · {task.domain}</span></span><ChevronRight className="h-3.5 w-3.5 text-slate-400" /></Link>)}
              {analyses.finished.map((analysis) => <Link key={`analysis-done-${analysis.id}`} href={`/dashboard/review-velocity?id=${analysis.id}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"><Check className="h-3.5 w-3.5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{analysis.name}</span><span className={`block truncate text-[10px] ${analysis.failed > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>Review Velocity · {analysis.failed > 0 ? `${analysis.failed} fetch${analysis.failed > 1 ? 'es' : ''} failed` : 'Analysis ready'}</span></span><ChevronRight className="h-3.5 w-3.5 text-slate-400" /></Link>)}
              {completed.map((task) => <Link key={`done-${task.id}`} href={`/dashboard/geo-grid?grid_history_id=${task.id}#results`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"><Check className="h-3.5 w-3.5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{task.keyword}</span><span className="block truncate text-[10px] text-emerald-600 dark:text-emerald-400">Report ready · {task.target}</span></span><ChevronRight className="h-3.5 w-3.5 text-slate-400" /></Link>)}
              {pending.map((task) => <Link key={task.id} href={`/dashboard/geo-grid?grid_history_id=${task.id}#results`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{task.keyword}</span><span className="block truncate text-[10px] text-slate-400">{task.target} · {task.ready}/{task.total} points</span></span><ChevronRight className="h-3.5 w-3.5 text-slate-400" /></Link>)}
              {rankTasks.running.map((task) => <Link key={`rank-running-${task.taskId}`} href={`/dashboard/rank-tracker?domain=${encodeURIComponent(task.domain)}#results`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{task.keyword}</span><span className="block truncate text-[10px] text-slate-400">Rank Tracker · {task.status === 'posting' ? 'Submitting check' : 'Check in progress'} · {task.domain}</span></span><ChevronRight className="h-3.5 w-3.5 text-slate-400" /></Link>)}
              {analyses.running.map((analysis) => <Link key={`analysis-running-${analysis.id}`} href={`/dashboard/review-velocity?id=${analysis.id}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{analysis.name}</span><span className="block truncate text-[10px] text-slate-400">Review Velocity · {analysis.pending} fetch{analysis.pending > 1 ? 'es' : ''} in progress</span></span><ChevronRight className="h-3.5 w-3.5 text-slate-400" /></Link>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
