'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { LoaderCircle, Play, X } from 'lucide-react';
import type { GridQueueMode } from '@/lib/db';
import { GRID_QUEUE_MODES, LEGACY_GRID_DEPTH, estimateGridCost, formatUsd, type GridDepth } from '@/lib/grid-pricing';
import { rerunGridMonitor, type GridRunState } from '../geo-grid/actions';

type Props = {
  runId: string;
  keyword: string;
  pointCount: number;
  /** Mode of the last run; repeat runs never default to Live, the most expensive one. */
  lastMode: GridQueueMode;
  /** The monitor's results per point; it sets the price of every new snapshot. */
  depth?: GridDepth;
  compact?: boolean;
};

function ConfirmButton({ cost, mode }: { cost: string; mode: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-70 dark:bg-white dark:text-slate-900 dark:hover:bg-blue-200"
    >
      {pending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
      {pending ? (mode === 'Live' ? 'Running grid… keep this page open' : 'Queuing…') : `Pay ≈${cost} and run`}
    </button>
  );
}

/** A re-run is a paid call: it opens a confirmation with the mode and the estimated price before anything is billed. */
export default function GridRunButton({ runId, keyword, pointCount, lastMode, depth = LEGACY_GRID_DEPTH, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<GridQueueMode>(lastMode === 'live' ? 'standard' : lastMode);
  const [state, action] = useActionState<GridRunState, FormData>(rerunGridMonitor, null);
  const panelId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    const onPointer = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer); };
  }, [open]);

  const selected = GRID_QUEUE_MODES.find((option) => option.value === mode)!;
  const cost = formatUsd(estimateGridCost(pointCount, mode, depth));

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={compact
          ? 'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-blue-300 dark:hover:bg-blue-950'
          : 'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'}
      >
        <Play className="h-3 w-3" aria-hidden="true" />
        Run{compact ? '' : ' again'}
      </button>

      {open && (
        <form
          id={panelId}
          action={action}
          aria-label={`Run "${keyword}" again`}
          className="absolute right-0 z-[1100] mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900"
        >
          <input type="hidden" name="run_id" value={runId} />
          <input type="hidden" name="queue_mode" value={mode} />
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-bold text-slate-900 dark:text-white">New snapshot</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cancel" className="-m-1 rounded p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{pointCount} points · top {depth} results, billed by DataForSEO.</p>

          <fieldset className="mt-3">
            <legend className="sr-only">API mode</legend>
            <div className="space-y-1.5">
              {GRID_QUEUE_MODES.map((option) => {
                const active = option.value === mode;
                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-600 ${active ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'}`}
                  >
                    <input type="radio" name="queue_mode_choice" value={option.value} checked={active} onChange={() => setMode(option.value)} className="sr-only" />
                    <span>
                      <span className={`block font-bold ${active ? 'text-blue-800 dark:text-blue-200' : 'text-slate-800 dark:text-slate-200'}`}>{option.label}</span>
                      <span className="block text-slate-600 dark:text-slate-400">{option.wait}</span>
                    </span>
                    <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">≈{formatUsd(estimateGridCost(pointCount, option.value, depth))}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {state?.error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
              {state.error}
              {state.openId && <> <a className="font-bold underline" href={`/dashboard/geo-grid?grid_history_id=${state.openId}#results`}>Open the partial run</a></>}
            </p>
          )}

          <div className="mt-3">
            <ConfirmButton cost={cost} mode={selected.label} />
            <p className="mt-1.5 text-center text-[11px] text-slate-600 dark:text-slate-400">Estimate from DataForSEO list prices.</p>
          </div>
        </form>
      )}
    </div>
  );
}
