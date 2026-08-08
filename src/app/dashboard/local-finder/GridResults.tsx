'use client';

import { lazy, Suspense, useMemo, useState } from 'react';
import type { GridPoint } from '@/lib/db';
import { computeCompetitors, computeGridSummary, computeRingStats, type CompetitorSummary } from './grid-insights';

const GridMap = lazy(() => import('./GridMap'));

interface Props {
  results: GridPoint[];
  gridSize: number;
  spacingKm: number;
  keyword: string;
  target: string;
  cost?: number;
}

function rankColor(rank: number | null): string {
  if (rank === null) return '#94a3b8';
  if (rank === 1)    return '#059669';
  if (rank <= 3)     return '#10b981';
  if (rank <= 7)     return '#14b8a6';
  if (rank <= 10)    return '#3b82f6';
  if (rank <= 15)    return '#f59e0b';
  if (rank <= 20)    return '#f97316';
  return '#ef4444';
}

export default function GridResults({ results, gridSize, spacingKm, keyword, target, cost }: Props) {
  const [highlight, setHighlight] = useState<CompetitorSummary | null>(null);

  const { foundCount, top3Count: top3, top10Count: top10, avgRank, ato } = computeGridSummary(results);

  const competitors = useMemo(() => computeCompetitors(results), [results]);
  const topCompetitors = competitors.slice(0, 5);
  const ringStats = useMemo(() => computeRingStats(results, gridSize, spacingKm), [results, gridSize, spacingKm]);

  const legend = [
    { color: '#059669', label: '#1' },
    { color: '#10b981', label: '#2-3' },
    { color: '#14b8a6', label: '#4-7' },
    { color: '#3b82f6', label: '#8-10' },
    { color: '#f59e0b', label: '#11-15' },
    { color: '#f97316', label: '#16-20' },
    { color: '#ef4444', label: '#21+' },
    { color: '#94a3b8', label: 'Not found' },
  ];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">ATO Score</p>
          <p className="text-2xl font-black text-slate-900 mt-0.5 tabular-nums">{ato}%</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Local visibility</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Avg rank</p>
          <p className="text-2xl font-black text-slate-900 mt-0.5 tabular-nums">{avgRank ?? '—'}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{foundCount}/{results.length} points found</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Top 3</p>
          <p className="text-2xl font-black text-emerald-600 mt-0.5 tabular-nums">{top3}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">of {results.length} points</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Top 10</p>
          <p className="text-2xl font-black text-blue-600 mt-0.5 tabular-nums">{top10}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">of {results.length} points</p>
        </div>
      </div>

      {/* Competitive landscape */}
      {topCompetitors.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-black text-slate-900 dark:text-white">Competitive landscape</p>
            <p className="text-[10px] text-slate-400">Ranked by grid presence</p>
          </div>
          <p className="text-[11px] text-slate-400 mb-4">
            Businesses appearing in the top 20 across the grid, compared to your own visibility.
          </p>

          <div className="space-y-2">
            {/* Target row, for direct comparison */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-900">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 w-14 shrink-0">You</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 flex-1 min-w-0 truncate">{target}</span>
              <div className="flex-1 max-w-[120px] h-2 bg-emerald-100 dark:bg-emerald-900 rounded-full overflow-hidden hidden sm:block">
                <div className="h-full bg-emerald-500" style={{ width: `${ato}%` }} />
              </div>
              <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 tabular-nums w-10 text-right">{ato}%</span>
            </div>

            {topCompetitors.map((c, i) => {
              const isActive = highlight?.key === c.key;
              return (
                <div
                  key={c.key}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900'
                      : 'bg-slate-50 dark:bg-slate-800 border-transparent'
                  }`}
                >
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 w-14 shrink-0">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{c.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {c.appearances}/{c.totalPoints} points · avg #{c.avgRank}
                      {c.avgRating != null ? ` · ★${c.avgRating.toFixed(1)}` : ''}
                    </p>
                  </div>
                  <div className="flex-1 max-w-[120px] h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden hidden sm:block">
                    <div className="h-full bg-blue-500" style={{ width: `${c.visibilityScore}%` }} />
                  </div>
                  <span className="text-xs font-black text-slate-600 dark:text-slate-300 tabular-nums w-10 text-right">{c.visibilityScore}%</span>
                  <button
                    type="button"
                    onClick={() => setHighlight(isActive ? null : c)}
                    className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg shrink-0 transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-slate-900 text-blue-600 border border-blue-200 dark:border-blue-900 hover:bg-blue-50 dark:hover:bg-blue-950'
                    }`}
                  >
                    {isActive ? 'Showing ✓' : 'View on grid'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Map card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-black text-slate-900">
              {highlight ? highlight.name : keyword}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {highlight ? (
                <>Competitor · avg #{highlight.avgRank} · {highlight.appearances}/{highlight.totalPoints} points</>
              ) : (
                <>Target: <span className="font-bold text-slate-600">{target}</span></>
              )}
              {' · '}{gridSize}×{gridSize} points
            </p>
          </div>
          <div className="flex items-center gap-3">
            {cost !== undefined && (
              <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>
            )}
            {highlight ? (
              <button
                type="button"
                onClick={() => setHighlight(null)}
                className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
              >
                ← Back to target
              </button>
            ) : (
              <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                Click a pin for details
              </span>
            )}
          </div>
        </div>

        {/* Mini legend */}
        <div className="flex flex-wrap gap-2 mb-4">
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
              <span className="text-[10px] font-bold text-slate-500">{item.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-200">
            <div className="w-3 h-3 rounded-sm border-2 border-dashed border-slate-400" />
            <span className="text-[10px] font-bold text-slate-500">Center</span>
          </div>
        </div>

        {/* Map */}
        <Suspense fallback={
          <div className="w-full rounded-xl bg-slate-100 animate-pulse flex items-center justify-center" style={{ height: 520 }}>
            <p className="text-sm text-slate-400 font-medium">Loading map…</p>
          </div>
        }>
          <GridMap
            key={highlight?.key ?? 'target'}
            points={results}
            gridSize={gridSize}
            target={target}
            highlightKey={highlight?.key}
            highlightName={highlight?.name}
          />
        </Suspense>
      </div>

      {/* Visibility by distance from center */}
      {ringStats.length > 1 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-sm font-black text-slate-900 dark:text-white mb-1">Visibility by distance</p>
          <p className="text-[11px] text-slate-400 mb-4">
            How far from the center point the target stays visible — useful to see the real edge of your service area.
          </p>
          <div className="space-y-2">
            {ringStats.map((r) => (
              <div key={r.ring} className="flex items-center gap-3">
                <span className="text-[10px] font-black text-slate-400 w-20 shrink-0 tabular-nums">
                  {r.ring === 0 ? 'Center' : `~${r.distanceKm} km`}
                </span>
                <div className="flex-1 h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${r.top3Pct >= 50 ? 'bg-emerald-500' : r.foundCount > 0 ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                    style={{ width: `${Math.round((r.foundCount / r.pointCount) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 w-28 shrink-0 text-right tabular-nums">
                  {r.avgRank != null ? `avg #${r.avgRank}` : 'not found'}
                </span>
                <span className="text-[10px] text-slate-400 w-16 shrink-0 text-right tabular-nums">
                  {r.foundCount}/{r.pointCount} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rank distribution mini-grid (fallback for points without geo) */}
      {results.some((p) => p.lat == null) && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Distribution (grid without coordinates)</p>
          <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
            {results.map((p, i) => {
              const color = rankColor(p.rank);
              const half = Math.floor(gridSize / 2);
              const isCenter = p.row === half && p.col === half;
              return (
                <div
                  key={i}
                  title={p.rank != null ? `#${p.rank}` : 'Not found'}
                  style={{
                    width: 36, height: 36,
                    background: color,
                    borderRadius: 6,
                    border: isCenter ? '2px dashed rgba(255,255,255,0.7)' : '1px solid rgba(255,255,255,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 900, color: 'white',
                  }}
                >
                  {p.rank ?? '—'}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
