'use client';

import type { GridLayout } from '@/lib/grid-layout';

import { useEffect, useMemo, useState } from 'react';
import { SearchX } from 'lucide-react';
import { parseTargetCid } from '@/lib/grid-target';
import { LEGACY_GRID_DEPTH, formatUsd, type GridDepth } from '@/lib/grid-pricing';
import { visibilityTone } from '@/lib/grid-rank-scale';
import LocalTime from '@/components/LocalTime';
import GridResults from './GridResults';
import { computeGridSummary } from './grid-insights';
import { useGridSnapshotSelection } from './GridSnapshotSelection';
import GridSnapshotPicker, { type GridMapSnapshot } from './GridSnapshotMapPanel';
import GridPositionTrend, { type GridPositionTrendPoint } from './GridPositionTrend';

type Props = {
  snapshots: GridMapSnapshot[];
  selectedId: string;
  gridSize: number;
  layout?: GridLayout;
  spacingKm: number;
  target: string;
  captureId: string;
  trend: GridPositionTrendPoint[];
  /** Results checked per point, which bounds Coverage and "not found". */
  depth?: GridDepth;
  center: string;
  language: string;
};

/** Signed change, rounded to 1 decimal; `lowerIsBetter` flips the sign for ranks. */
function delta(current: number | null, previous: number | null, lowerIsBetter = false) {
  if (current === null || previous === null) return null;
  const value = Math.round((lowerIsBetter ? previous - current : current - previous) * 10) / 10;
  return value;
}

function Delta({ value, unit = '' }: { value: number | null; unit?: string }) {
  if (value === null) return null;
  if (value === 0) return <span className="text-xs text-slate-600 dark:text-slate-400">no change</span>;
  const up = value > 0;
  return (
    <span className={`text-xs font-bold tabular-nums ${up ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      <span className="sr-only">{up ? 'improved by' : 'worse by'}</span> {Math.abs(value)}{unit}
    </span>
  );
}

export default function GridAnalysisPanel({ snapshots, selectedId, gridSize, layout, spacingKm, target, captureId, trend, depth = LEGACY_GRID_DEPTH, center, language }: Props) {
  const selection = useGridSnapshotSelection();
  const [localId, setLocalId] = useState(selectedId);
  useEffect(() => setLocalId(selectedId), [selectedId]);
  // Shared with the PDF export button so the report always matches the map.
  const activeId = selection?.activeId ?? localId;
  const setActiveId = selection?.setActiveId ?? setLocalId;

  const activeIndex = Math.max(0, snapshots.findIndex((snapshot) => snapshot.id === activeId));
  const activeSnapshot = snapshots[activeIndex];
  const previousSnapshot = snapshots[activeIndex + 1];

  const current = useMemo(() => activeSnapshot ? computeGridSummary(activeSnapshot.results) : null, [activeSnapshot]);
  const previous = useMemo(() => activeSnapshot?.previousResults ? computeGridSummary(activeSnapshot.previousResults) : null, [activeSnapshot]);

  if (!activeSnapshot || !current) return null;

  const tone = visibilityTone(current.ato);
  const nothingFound = current.foundCount === 0 && current.totalPoints > 0;
  const pickedListing = parseTargetCid(target) !== null;

  return (
    <div className="space-y-6">
      {snapshots.length > 1 && (
        <section aria-labelledby="snapshot-picker-title">
          <h3 id="snapshot-picker-title" className="mb-2 text-sm font-bold text-slate-900 dark:text-white">
            Snapshots <span className="font-normal text-slate-600 dark:text-slate-400">· oldest to newest</span>
          </h3>
          <GridSnapshotPicker snapshots={snapshots} activeId={activeSnapshot.id} onSelect={setActiveId} />
        </section>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Visibility
            <span className="sr-only"> (100% means rank 1 at every point)</span>
          </dt>
          <dd className="mt-1 flex items-baseline gap-2">
            <span className={`text-3xl font-black tabular-nums tracking-tight ${tone.text}`}>{current.ato}%</span>
            <Delta value={delta(current.ato, previous?.ato ?? null)} unit=" pt" />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Coverage
            <span className="sr-only"> (share of points where you appear in the top {depth})</span>
          </dt>
          <dd className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-black tabular-nums tracking-tight text-slate-900 dark:text-white">{current.coverage}%</span>
            <Delta value={delta(current.coverage, previous?.coverage ?? null)} unit=" pt" />
          </dd>
          <dd className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Found on {current.foundCount} of {current.totalPoints} points</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-slate-700 dark:text-slate-300">
            ARP
            <span className="sr-only"> (average rank position)</span>
          </dt>
          <dd className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-black tabular-nums tracking-tight text-slate-900 dark:text-white">{current.arp == null ? '—' : `#${current.arp}`}</span>
            <Delta value={delta(current.arp, previous?.arp ?? null, true)} />
          </dd>
          <dd className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Average rank where found</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-slate-700 dark:text-slate-300">
            SoLV
            <span className="sr-only"> (share of local voice)</span>
          </dt>
          <dd className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-black tabular-nums tracking-tight text-slate-900 dark:text-white">{current.solv}%</span>
            <Delta value={delta(current.solv, previous?.solv ?? null)} unit=" pt" />
          </dd>
          <dd className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">In the top 3 on {current.top3Count} of {current.totalPoints} points</dd>
        </div>
      </dl>
      <p className="-mt-3 text-xs text-slate-600 dark:text-slate-400">
        Snapshot of <LocalTime ts={activeSnapshot.ts} format="long" />
        {previousSnapshot ? <> · changes compared with <LocalTime ts={previousSnapshot.ts} /></> : ' · first snapshot, so no changes yet'}
        {activeSnapshot.cost !== undefined && <> · cost {formatUsd(activeSnapshot.cost)}</>}
      </p>

      {nothingFound && (
        <div role="status" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <SearchX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold">{target} was not in the top {depth} at any of the {current.totalPoints} points.</p>
            <p className="mt-1">
              {pickedListing
                ? 'The target is an exact Google listing, so this is likely a real ranking gap: check the competitors below, or widen the spacing to see where the listing starts to appear.'
                : 'The target is matched by domain or name, and many Local Finder listings come back without a website. Before running again, create a monitor that picks the exact Google listing from the map search.'}
            </p>
          </div>
        </div>
      )}

      <GridResults
        key={activeSnapshot.id}
        results={activeSnapshot.results}
        previousResults={activeSnapshot.previousResults}
        gridSize={gridSize}
        layout={layout}
        spacingKm={spacingKm}
        target={target}
        captureId={captureId}
        depth={depth}
        center={center}
        language={language}
      />

      {trend.length > 1 && (
        <section aria-labelledby="trend-title" className="border-t border-slate-200 pt-6 dark:border-slate-800">
          <h3 id="trend-title" className="text-sm font-bold text-slate-900 dark:text-white">Rank distribution over time</h3>
          <p className="mb-3 mt-0.5 text-xs text-slate-600 dark:text-slate-400">Share of grid points in each rank range, per snapshot. The dashed line marks the snapshot on the map.</p>
          <GridPositionTrend points={trend} selectedId={activeSnapshot.id} />
        </section>
      )}
    </div>
  );
}
