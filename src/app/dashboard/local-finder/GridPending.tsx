'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { GridQueueMode } from '@/lib/db';

interface Props {
  searchId: string;
  totalPoints: number;
  queueMode: GridQueueMode;
  keyword: string;
  target: string;
  gridSize: number;
}

const POLL_INTERVAL: Record<GridQueueMode, number> = {
  live:     5_000,
  priority: 10_000,
  standard: 30_000,
};

const MODE_LABEL: Record<GridQueueMode, string> = {
  live:     'Live',
  priority: 'Priority Queue',
  standard: 'Standard Queue',
};

const WAIT_HINT: Record<GridQueueMode, string> = {
  live:     'Results in ~6 seconds',
  priority: 'Results in ~1 minute on average',
  standard: 'Results typically in 5–45 minutes',
};

export default function GridPending({ searchId, totalPoints, queueMode, keyword, target, gridSize }: Props) {
  const router = useRouter();
  const [ready, setReady] = useState(0);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checkingRef = useRef(false);
  const doneRef = useRef(false);

  const checkStatus = useCallback(async () => {
    if (checkingRef.current || doneRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/grid-check/${searchId}`);
      const data = await res.json() as { status: string; ready?: number; total?: number; error?: string };
      setLastChecked(new Date());
      if (data.status === 'done') {
        doneRef.current = true;
        router.refresh();
        return;
      }
      if (data.error) {
        setError(data.error);
      } else {
        setReady(data.ready ?? 0);
      }
    } catch {
      setError('Network error — will retry.');
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [searchId, router]);

  const interval = POLL_INTERVAL[queueMode];

  useEffect(() => {
    doneRef.current = false;

    const runCheck = () => {
      void checkStatus();
    };

    const initialTimer = setTimeout(runCheck, 0);
    const timer = setInterval(runCheck, interval);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [checkStatus, interval]);

  const pct = totalPoints > 0 ? Math.round((ready / totalPoints) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-black uppercase tracking-widest text-slate-500">Processing</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
            {MODE_LABEL[queueMode]}
          </span>
        </div>
        <button
          onClick={checkStatus}
          disabled={checking}
          className="text-[11px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700 disabled:opacity-40 transition-colors"
        >
          {checking ? 'Checking…' : 'Check now'}
        </button>
      </div>

      <div className="px-6 py-6 space-y-5">
        {/* Search info */}
        <div>
          <p className="text-sm font-bold text-slate-900">{keyword}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Target: <span className="font-bold text-slate-600">{target}</span>
            {' · '}{gridSize}×{gridSize} grid
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Progress</span>
            <span className="text-[11px] font-mono text-slate-500">{ready} / {totalPoints} points ready</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400">{WAIT_HINT[queueMode]}</p>
        </div>

        {/* Status line */}
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          {checking && (
            <svg className="animate-spin w-3 h-3 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {error ? (
            <span className="text-red-500">{error}</span>
          ) : lastChecked ? (
            <span>Last checked at {lastChecked.toLocaleTimeString()} · auto-refreshes every {interval / 1000}s</span>
          ) : (
            <span>Connecting to DataForSEO…</span>
          )}
        </div>
      </div>
    </div>
  );
}
