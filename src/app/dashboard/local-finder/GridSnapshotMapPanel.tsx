'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GridPoint } from '@/lib/db';
import GridMap from './GridMap';
import GridPositionTrend, { type GridPositionTrendPoint } from './GridPositionTrend';

export type GridMapSnapshot = {
  id: string;
  ts: number;
  status: string;
  visibility: number | null;
  cost?: number;
  results: GridPoint[];
  previousResults: GridPoint[] | null;
};

type Props = {
  snapshots: GridMapSnapshot[];
  selectedId: string;
  gridSize: number;
  target: string;
  captureId: string;
  trend: GridPositionTrendPoint[];
  onSelectedIdChange?: (id: string) => void;
};

function formatSnapshotDate(ts: number) {
  return new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(ts));
}

export default function GridSnapshotMapPanel({ snapshots, selectedId, gridSize, target, captureId, trend, onSelectedIdChange }: Props) {
  const [activeId, setActiveId] = useState(selectedId);

  // Changing monitor from the sidebar is a genuine new context. Date comparison below is local,
  // deliberately avoiding a route navigation so Leaflet keeps the current pan and zoom.
  useEffect(() => setActiveId(selectedId), [selectedId]);

  const activeSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === activeId) ?? snapshots.find((snapshot) => snapshot.id === selectedId) ?? snapshots[0],
    [activeId, selectedId, snapshots],
  );

  if (!activeSnapshot) return null;

  return (
    <section>
      <GridPositionTrend points={trend} selectedId={activeSnapshot.id} />

      <div className="mt-6 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-900 dark:text-white">Ranking map</h3>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {activeSnapshot.previousResults
              ? `Marker labels show the movement since ${formatSnapshotDate(snapshots[snapshots.findIndex((snapshot) => snapshot.id === activeSnapshot.id) + 1]?.ts ?? activeSnapshot.ts)}.`
              : 'This is the first snapshot — future markers will show movement.'}
          </p>
        </div>
        <span className="text-[10px] font-bold text-slate-400">center dashed</span>
      </div>

      <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3.5 dark:border-blue-900/70 dark:bg-blue-950/20">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">Snapshot comparison</p>
            <h4 className="mt-0.5 text-sm font-black text-slate-900 dark:text-white">Choose the date shown on the map</h4>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Oldest on the left, newest on the right. Only the pins update.</p>
          </div>
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold tabular-nums text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300">{snapshots.length} runs</span>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Map snapshots">
          {[...snapshots].reverse().map((snapshot) => {
            const active = snapshot.id === activeSnapshot.id;
            return (
              <button
                key={snapshot.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { setActiveId(snapshot.id); onSelectedIdChange?.(snapshot.id); }}
                className={`min-w-[126px] border-l-2 px-3 py-1.5 text-left transition-colors ${active ? 'border-blue-600 bg-white text-blue-900 shadow-sm dark:bg-slate-900 dark:text-blue-100' : 'border-blue-100 text-slate-500 hover:border-blue-300 hover:bg-white dark:border-blue-900/70 dark:text-slate-400 dark:hover:bg-slate-900'}`}
              >
                <span className="block text-[10px] font-black uppercase tracking-wider">{active ? 'Viewing' : 'Snapshot'}</span>
                <span className="mt-0.5 block whitespace-nowrap text-xs font-bold tabular-nums">{formatSnapshotDate(snapshot.ts)}</span>
                <span className="mt-0.5 block text-[10px] tabular-nums">{snapshot.visibility === null ? snapshot.status : `${snapshot.visibility}% visibility`}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <GridMap points={activeSnapshot.results} previousPoints={activeSnapshot.previousResults} gridSize={gridSize} target={target} captureId={captureId} />
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-500">
        <span><b className="text-emerald-600">+3</b> gained positions</span><span><b className="text-red-500">-3</b> lost positions</span><span><b className="text-slate-500">new</b> entered the pack</span><span><b className="text-slate-500">lost</b> left the pack</span>
      </div>
    </section>
  );
}
