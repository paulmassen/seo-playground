'use client';

import type { GridPoint } from '@/lib/db';
import LocalTime from '@/components/LocalTime';
import { visibilityTone } from '@/lib/grid-rank-scale';

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
  activeId: string;
  onSelect: (id: string) => void;
};

/**
 * Date picker for the single ranking map. Oldest left, newest right; only the pins and figures change,
 * so the map keeps its pan and zoom. Hidden by the caller until there are two snapshots to choose from.
 */
export default function GridSnapshotPicker({ snapshots, activeId, onSelect }: Props) {
  const ordered = [...snapshots].reverse();
  return (
    <div role="radiogroup" aria-label="Snapshot shown on the map" className="flex gap-1.5 overflow-x-auto pb-1">
      {ordered.map((snapshot, index) => {
        const active = snapshot.id === activeId;
        const latest = index === ordered.length - 1;
        return (
          <button
            key={snapshot.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(snapshot.id)}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
              active
                ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-950'
                : 'border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500'
            }`}
          >
            <span className={`block whitespace-nowrap text-xs font-bold tabular-nums ${active ? 'text-blue-900 dark:text-blue-100' : 'text-slate-800 dark:text-slate-200'}`}>
              <LocalTime ts={snapshot.ts} />
              {latest && <span className="ml-1.5 font-normal text-slate-600 dark:text-slate-400">latest</span>}
            </span>
            <span className={`mt-0.5 block text-xs font-bold tabular-nums ${snapshot.visibility === null ? 'text-slate-600' : visibilityTone(snapshot.visibility).text}`}>
              {snapshot.visibility === null ? snapshot.status : `${snapshot.visibility}% visibility`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
