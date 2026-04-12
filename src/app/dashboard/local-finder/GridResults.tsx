'use client';

import { lazy, Suspense } from 'react';
import type { GridPoint } from '@/lib/db';

const GridMap = lazy(() => import('./GridMap'));

interface Props {
  results: GridPoint[];
  gridSize: number;
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

export default function GridResults({ results, gridSize, keyword, target, cost }: Props) {
  const ranked = results.filter((p) => p.rank !== null);
  const top3 = results.filter((p) => p.rank !== null && p.rank <= 3).length;
  const top10 = results.filter((p) => p.rank !== null && p.rank <= 10).length;
  const avgRank = ranked.length > 0
    ? Math.round(ranked.reduce((s, p) => s + p.rank!, 0) / ranked.length * 10) / 10
    : null;
  const ato = results.length > 0
    ? Math.round((results.reduce((s, p) => s + (21 - Math.min(p.rank ?? 21, 21)), 0) / (results.length * 20)) * 100)
    : 0;

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
          <p className="text-[10px] text-slate-400 mt-0.5">{ranked.length}/{results.length} points found</p>
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

      {/* Map card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-black text-slate-900">{keyword}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Target: <span className="font-bold text-slate-600">{target}</span>
              {' · '}{gridSize}×{gridSize} points
            </p>
          </div>
          <div className="flex items-center gap-3">
            {cost !== undefined && (
              <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>
            )}
            <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
              Click a pin for details
            </span>
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
          <GridMap points={results} gridSize={gridSize} target={target} />
        </Suspense>
      </div>

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
