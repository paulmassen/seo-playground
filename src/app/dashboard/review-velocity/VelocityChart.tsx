'use client';

import { useMemo, useState } from 'react';

export interface ChartSeries {
  id: number;
  title: string;
  isSelf: boolean;
  color: string;
  weekly: Array<number | null>;
  monthly: Array<number | null>;
}

interface Props {
  weekLabels: string[];
  monthLabels: string[];
  series: ChartSeries[];
}

const W = 720, H = 250;
const PAD = { top: 14, right: 14, bottom: 26, left: 34 };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * magnitude >= value) return step * magnitude;
  return 10 * magnitude;
}

/** New reviews per complete week or month; uncovered periods leave a gap instead of dropping to 0. */
export default function VelocityChart({ weekLabels, monthLabels, series }: Props) {
  const [granularity, setGranularity] = useState<'week' | 'month'>('week');
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [hover, setHover] = useState<number | null>(null);

  const labels = granularity === 'week' ? weekLabels : monthLabels;
  const shown = series.filter((s) => !hidden.has(s.id));
  const valuesOf = (s: ChartSeries) => (granularity === 'week' ? s.weekly : s.monthly);
  const max = useMemo(() => niceMax(Math.max(1, ...shown.flatMap((s) => valuesOf(s).filter((v): v is number => v !== null)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, granularity]);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const n = Math.max(1, labels.length);
  const x = (i: number) => (n === 1 ? PAD.left + plotW / 2 : PAD.left + (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  function path(values: Array<number | null>) {
    let d = '';
    let open = false;
    values.forEach((v, i) => {
      if (v === null) { open = false; return; }
      d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      open = true;
    });
    return d;
  }

  const ordered = [...shown].sort((a, b) => Number(a.isSelf) - Number(b.isSelf));
  const hoverRows = hover === null ? [] : shown
    .map((s) => ({ s, v: valuesOf(s)[hover] }))
    .sort((a, b) => (b.v ?? -1) - (a.v ?? -1));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5" role="group" aria-label="Granularity">
          {(['week', 'month'] as const).map((g) => (
            <button key={g} type="button" onClick={() => { setGranularity(g); setHover(null); }} aria-pressed={granularity === g}
              className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-md transition-colors ${granularity === g ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>
              Per {g}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-slate-400">Complete {granularity}s only · gaps = not covered by the data</span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`New reviews per ${granularity}`} onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
              <text x={PAD.left - 6} y={y(max * f) + 3} textAnchor="end" fontSize="9" className="fill-slate-400">{Number.isInteger(max * f) ? max * f : (max * f).toFixed(1)}</text>
            </g>
          ))}
          {labels.map((label, i) => (n <= 14 || i % 2 === 0 || i === n - 1) && (
            <text key={label} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" className="fill-slate-400">{label}</text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="currentColor" className="text-slate-300 dark:text-slate-600" strokeDasharray="3 3" />}
          {ordered.map((s) => (
            <g key={s.id}>
              <path d={path(valuesOf(s))} fill="none" stroke={s.color} strokeWidth={s.isSelf ? 3 : 1.5} strokeLinejoin="round" strokeLinecap="round" opacity={s.isSelf || hover === null ? 1 : 0.85} />
              {s.isSelf && valuesOf(s).map((v, i) => v !== null && <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color} />)}
            </g>
          ))}
          {labels.map((label, i) => (
            <rect key={`hit-${label}`} x={x(i) - plotW / Math.max(1, n - 1) / 2} y={PAD.top} width={plotW / Math.max(1, n - 1)} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute top-2 z-10 min-w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-lg px-3 py-2"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: x(hover) > W * 0.6 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{granularity === 'week' ? `Week of ${labels[hover]}` : labels[hover]}</p>
            {hoverRows.map(({ s, v }) => (
              <p key={s.id} className={`flex items-center justify-between gap-4 text-xs ${s.isSelf ? 'font-black' : ''}`}>
                <span className="flex items-center gap-1.5 min-w-0"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} /><span className="truncate max-w-40">{s.title}</span></span>
                <span className="tabular-nums text-slate-700 dark:text-slate-200">{v ?? '—'}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s) => {
          const off = hidden.has(s.id);
          return (
            <li key={s.id}>
              <button type="button" aria-pressed={!off}
                onClick={() => setHidden((current) => { const next = new Set(current); if (next.has(s.id)) next.delete(s.id); else next.add(s.id); return next; })}
                className={`inline-flex items-center gap-1.5 text-xs transition-opacity ${off ? 'opacity-35' : ''} ${s.isSelf ? 'font-black text-slate-900 dark:text-white' : 'text-slate-500'}`}>
                <span className="w-3 h-1 rounded-full" style={{ background: s.color }} />
                {s.title}{s.isSelf ? ' (you)' : ''}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
