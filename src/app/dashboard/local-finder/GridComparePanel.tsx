'use client';

import { lazy, Suspense, useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { GridPoint } from '@/lib/db';
import { formatLocalTime } from '@/components/LocalTime';
import ExportCSVButton from '@/components/ExportCSVButton';
import { displayGridTarget } from '@/lib/grid-target';
import { CHANGE_STYLES, compareGridSnapshots, type PointChange } from './grid-compare';
import type { CompareMapView } from './GridCompareMap';

const GridCompareMap = lazy(() => import('./GridCompareMap'));

export type CompareSnapshot = { id: string; ts: number; results: GridPoint[] };

type Props = {
  /** Completed snapshots of the monitor, newest first. */
  snapshots: CompareSnapshot[];
  gridSize: number;
  target: string;
  keyword: string;
};

const CHANGE_ORDER: PointChange[] = ['gained', 'improved', 'unchanged', 'declined', 'lost', 'absent'];

function Delta({ before, after, unit = '', lowerIsBetter = false }: { before: number | null; after: number | null; unit?: string; lowerIsBetter?: boolean }) {
  if (before === null || after === null) return <span className="text-xs text-slate-500">—</span>;
  const raw = Math.round((after - before) * 10) / 10;
  if (raw === 0) return <span className="text-xs text-slate-600 dark:text-slate-400">no change</span>;
  const better = lowerIsBetter ? raw < 0 : raw > 0;
  return (
    <span className={`text-xs font-bold tabular-nums ${better ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
      <span aria-hidden="true">{better ? '▲' : '▼'}</span>
      <span className="sr-only">{better ? 'better by' : 'worse by'}</span> {Math.abs(raw)}{unit}
    </span>
  );
}

const selectCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white';

/**
 * Before / after view of two snapshots of one monitor: the change at every grid point, the
 * metric deltas and the competitors that took (or gave up) the local pack. Uses saved snapshots
 * only, so it never calls DataForSEO.
 */
export default function GridComparePanel({ snapshots, gridSize, target, keyword }: Props) {
  const [open, setOpen] = useState(false);
  // Oldest against newest by default: the longest stretch of history the monitor has.
  const [beforeId, setBeforeId] = useState(snapshots[snapshots.length - 1]?.id ?? '');
  const [afterId, setAfterId] = useState(snapshots[0]?.id ?? '');
  const [view, setView] = useState<CompareMapView>('change');

  const before = snapshots.find((s) => s.id === beforeId) ?? snapshots[snapshots.length - 1];
  const after = snapshots.find((s) => s.id === afterId) ?? snapshots[0];
  const comparison = useMemo(
    () => (before && after ? compareGridSnapshots(before.results, after.results) : null),
    [before, after],
  );

  if (snapshots.length < 2 || !before || !after || !comparison) return null;

  const beforeLabel = formatLocalTime(before.ts, 'long');
  const afterLabel = formatLocalTime(after.ts, 'long');
  const sameSnapshot = before.id === after.id;
  const reversed = before.ts > after.ts;
  const hasGeo = comparison.points.some((p) => p.lat != null && p.lng != null);
  const total = comparison.points.length;
  const targetName = displayGridTarget(target);

  const metrics = [
    { label: 'Visibility', b: comparison.before.ato, a: comparison.after.ato, fmt: (v: number | null) => `${v}%`, unit: ' pt' },
    { label: 'Coverage', b: comparison.before.coverage, a: comparison.after.coverage, fmt: (v: number | null) => `${v}%`, unit: ' pt' },
    { label: 'ARP', b: comparison.before.arp, a: comparison.after.arp, fmt: (v: number | null) => (v == null ? '—' : `#${v}`), unit: '', lowerIsBetter: true },
    { label: 'SoLV', b: comparison.before.solv, a: comparison.after.solv, fmt: (v: number | null) => `${v}%`, unit: ' pt' },
  ];

  const csvData = comparison.points.map((p) => ({
    row: p.row + 1,
    col: p.col + 1,
    lat: p.lat ?? '',
    lng: p.lng ?? '',
    before: p.before ?? '',
    after: p.after ?? '',
    change: CHANGE_STYLES[p.change].label,
    delta: p.delta ?? '',
    entered_pack: p.enteredPack.map((b) => b.name).join('; '),
    left_pack: p.leftPack.map((b) => b.name).join('; '),
  }));
  const csvColumns = [
    { key: 'row', label: 'Row' }, { key: 'col', label: 'Column' }, { key: 'lat', label: 'Latitude' }, { key: 'lng', label: 'Longitude' },
    { key: 'before', label: `Rank ${beforeLabel}` }, { key: 'after', label: `Rank ${afterLabel}` },
    { key: 'change', label: 'Change' }, { key: 'delta', label: 'Places gained' },
    { key: 'entered_pack', label: 'Entered top 3' }, { key: 'left_pack', label: 'Left top 3' },
  ];

  return (
    <details
      className="group rounded-xl border border-slate-200 dark:border-slate-800"
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-slate-800/50 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-sm font-bold text-slate-900 dark:text-white">Compare two snapshots</span>
          <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-400">
            Before / after map, point by point, with the competitors that took or gave up the local pack. Uses saved snapshots only, no API cost.
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-xs text-slate-600 transition-transform group-open:rotate-180 dark:text-slate-400">▾</span>
      </summary>

      {open && (
        <div className="space-y-6 border-t border-slate-200 px-4 py-5 dark:border-slate-800">
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">Before</span>
              <select value={before.id} onChange={(e) => setBeforeId(e.target.value)} className={selectCls}>
                {snapshots.map((s) => <option key={s.id} value={s.id}>{formatLocalTime(s.ts, 'long')}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={() => { setBeforeId(after.id); setAfterId(before.id); }}
              title="Swap before and after"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:border-slate-500 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:text-slate-300"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" /> Swap
            </button>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">After</span>
              <select value={after.id} onChange={(e) => setAfterId(e.target.value)} className={selectCls}>
                {snapshots.map((s) => <option key={s.id} value={s.id}>{formatLocalTime(s.ts, 'long')}</option>)}
              </select>
            </label>
          </div>

          {sameSnapshot ? (
            <p role="status" className="text-sm text-slate-700 dark:text-slate-300">Pick two different snapshots to see what changed.</p>
          ) : (
            <>
              {reversed && (
                <p role="status" className="-mt-3 text-xs text-amber-800 dark:text-amber-300">“Before” is newer than “After”: changes read backwards in time.</p>
              )}

              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {metrics.map((m) => (
                  <div key={m.label}>
                    <dt className="text-xs font-bold text-slate-700 dark:text-slate-300">{m.label}</dt>
                    <dd className="mt-1 text-sm tabular-nums text-slate-600 dark:text-slate-400">
                      {m.fmt(m.b)} <span aria-hidden="true">→</span><span className="sr-only">to</span>{' '}
                      <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">{m.fmt(m.a)}</span>
                    </dd>
                    <dd className="mt-0.5"><Delta before={m.b} after={m.a} unit={m.unit} lowerIsBetter={m.lowerIsBetter} /></dd>
                  </div>
                ))}
              </dl>

              <p className="text-sm text-slate-700 dark:text-slate-300">
                <span className="font-bold">{targetName}</span>: better on{' '}
                <span className="font-bold text-green-700 dark:text-green-400">{comparison.counts.improved + comparison.counts.gained}</span> of {total} points, worse on{' '}
                <span className="font-bold text-red-700 dark:text-red-400">{comparison.counts.declined + comparison.counts.lost}</span>.
                {' '}Top 3 gained on {comparison.packGained} point{comparison.packGained === 1 ? '' : 's'}, lost on {comparison.packLost}.
              </p>

              <section aria-labelledby="compare-map-title">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 id="compare-map-title" className="text-sm font-bold text-slate-900 dark:text-white">
                    {view === 'change' ? 'Change at each point' : view === 'before' ? `Ranks on ${beforeLabel}` : `Ranks on ${afterLabel}`}
                  </h3>
                  <div role="radiogroup" aria-label="Map view" className="inline-flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
                    {(['change', 'before', 'after'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={view === v}
                        onClick={() => setView(v)}
                        className={`rounded-md px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${view === v ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                      >
                        {v === 'change' ? 'Change' : v === 'before' ? 'Before' : 'After'}
                      </button>
                    ))}
                  </div>
                </div>

                {hasGeo ? (
                  <Suspense fallback={<div className="flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800" style={{ height: 'clamp(340px, 62vh, 600px)' }}><p className="text-sm text-slate-600 dark:text-slate-400">Loading map…</p></div>}>
                    <GridCompareMap points={comparison.points} gridSize={gridSize} view={view} beforeLabel={beforeLabel} afterLabel={afterLabel} />
                  </Suspense>
                ) : (
                  <div className="inline-grid gap-1 rounded-xl bg-slate-100 p-3 dark:bg-slate-800" style={{ gridTemplateColumns: `repeat(${gridSize}, 2.5rem)` }}>
                    {comparison.points.map((p) => {
                      const style = CHANGE_STYLES[p.change];
                      return (
                        <div key={`${p.row}:${p.col}`} role="img" aria-label={`Row ${p.row + 1}, column ${p.col + 1}: ${style.label}`}
                          className="grid h-10 w-10 place-items-center rounded-md text-xs font-black tabular-nums"
                          style={{ background: style.fill, color: style.ink, gridColumn: p.col + 1, gridRow: p.row + 1 }}>
                          {p.delta !== null && p.delta !== 0 ? (p.delta > 0 ? `+${p.delta}` : `−${-p.delta}`) : p.change === 'gained' ? 'new' : p.change === 'lost' ? 'lost' : p.change === 'unchanged' ? '=' : '—'}
                        </div>
                      );
                    })}
                  </div>
                )}

                {view === 'change' && (
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-700 dark:text-slate-300" aria-label="Change legend">
                    {CHANGE_ORDER.map((change) => (
                      <li key={change} className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm ring-1 ring-slate-900/15" style={{ backgroundColor: CHANGE_STYLES[change].fill }} aria-hidden="true" />
                        {CHANGE_STYLES[change].label} <span className="font-bold tabular-nums">{comparison.counts[change]}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {comparison.movers.length > 0 && (
                <section aria-labelledby="compare-movers-title">
                  <h3 id="compare-movers-title" className="text-sm font-bold text-slate-900 dark:text-white">Who moved in the local pack</h3>
                  <p className="mb-3 mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                    Change in top 3 share (SoLV) between the two snapshots. “Took your spot” counts the points where {targetName} slipped and this business entered the top 3.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-600 dark:text-slate-400">
                          <th scope="col" className="pb-2 pr-3 text-left font-bold">Business</th>
                          <th scope="col" className="pb-2 pr-3 text-right font-bold">SoLV before</th>
                          <th scope="col" className="pb-2 pr-3 text-right font-bold">SoLV after</th>
                          <th scope="col" className="pb-2 pr-3 text-right font-bold">Change</th>
                          <th scope="col" className="pb-2 text-right font-bold">Took your spot</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {comparison.movers.slice(0, 8).map((m) => (
                          <tr key={m.key}>
                            <td className="max-w-[18rem] truncate py-2 pr-3 font-bold text-slate-900 dark:text-white" title={m.name}>{m.name}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{m.solvBefore}%</td>
                            <td className="py-2 pr-3 text-right tabular-nums font-bold text-slate-900 dark:text-white">{m.solvAfter}%</td>
                            <td className={`py-2 pr-3 text-right text-xs font-bold tabular-nums ${m.solvDelta > 0 ? 'text-red-700 dark:text-red-400' : m.solvDelta < 0 ? 'text-green-700 dark:text-green-400' : 'text-slate-600'}`}>
                              {m.solvDelta > 0 ? `+${m.solvDelta}` : m.solvDelta} pt
                            </td>
                            <td className="py-2 text-right tabular-nums text-slate-800 dark:text-slate-200">{m.tookFromYou > 0 ? `${m.tookFromYou} pt${m.tookFromYou === 1 ? '' : 's'}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">A competitor gaining top 3 share is shown in red: it is share taken from the pack you compete for.</p>
                </section>
              )}

              <div className="flex justify-end">
                <ExportCSVButton
                  data={csvData}
                  columns={csvColumns}
                  filename={`geo-grid-compare-${keyword.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${new Date(before.ts).toISOString().slice(0, 10)}-${new Date(after.ts).toISOString().slice(0, 10)}.csv`}
                />
              </div>
            </>
          )}
        </div>
      )}
    </details>
  );
}
