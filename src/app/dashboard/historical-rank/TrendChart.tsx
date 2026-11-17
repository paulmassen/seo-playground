'use client';

import { useMemo, useState } from 'react';
import { formatMonth, metricValue, monthKey, TREND_METRICS, type DomainSeries, type TrendMetric } from './hist-shared';

const COLORS = ['#2563eb', '#f97316', '#10b981'];

function compact(v: number) {
  return new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

/** Line chart of one metric over time, one line per domain. */
export default function TrendChart({ series }: { series: DomainSeries[] }) {
  const [metric, setMetric] = useState<TrendMetric>('etv');
  const [indexed, setIndexed] = useState(false);

  // Union of months across domains, so lines line up even when a domain has gaps.
  const months = useMemo(() => {
    const map = new Map<string, { year: number; month: number }>();
    for (const s of series) for (const i of s.items) map.set(monthKey(i), { year: i.year, month: i.month });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [series]);

  const lines = useMemo(() => series.map((s) => {
    const byMonth = new Map(s.items.map((i) => [monthKey(i), metricValue(i, metric)]));
    const raw = months.map((m) => byMonth.get(monthKey(m)) ?? null);
    if (!indexed) return raw;
    const base = raw.find((v) => v !== null && v > 0) ?? null;
    return raw.map((v) => (v === null || !base ? null : (v / base) * 100));
  }), [series, months, metric, indexed]);

  const W = 820, H = 260, L = 52, R = 16, T = 14, B = 30;
  const all = lines.flat().filter((v): v is number => v !== null);
  const max = Math.max(...all, 1);
  const x = (i: number) => (months.length === 1 ? L + (W - L - R) / 2 : L + (i / (months.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelStep = Math.max(1, Math.ceil(months.length / 8));
  const metricInfo = TREND_METRICS.find((m) => m.key === metric)!;

  if (months.length === 0) return null;

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-6 dark:bg-slate-900 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.18em] dark:text-blue-400">Trend</p>
          <h2 className="mt-1 text-base font-black tracking-tight text-slate-900 dark:text-white">{metricInfo.label}</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{metricInfo.hint}{indexed ? ' Indexed: first month = 100, to compare growth between domains of different sizes.' : ''}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={metric} onChange={(e) => setMetric(e.target.value as TrendMetric)}
            className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
            {TREND_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          {series.length > 1 && (
            <label className="text-[11px] text-slate-500 flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={indexed} onChange={(e) => setIndexed(e.target.checked)} /> Indexed (=100)
            </label>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] font-bold">
        {series.map((s, si) => (
          <span key={s.target} className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <i className="h-0.5 w-4" style={{ backgroundColor: COLORS[si % COLORS.length] }} />{s.target}
          </span>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl bg-slate-50 p-2 dark:bg-slate-950/60">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[620px] h-auto w-full" role="img" aria-label={`${metricInfo.label} over time`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity="0.10" />
              <text x={L - 8} y={y(t) + 3} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.55">{compact(Math.round(t))}</text>
            </g>
          ))}
          {lines.map((vals, si) => {
            const color = COLORS[si % COLORS.length];
            let d = '';
            let pen = false;
            vals.forEach((v, i) => {
              if (v === null) { pen = false; return; }
              d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
              pen = true;
            });
            return (
              <g key={si}>
                <path d={d} fill="none" stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                {vals.map((v, i) => v === null ? null : (
                  <circle key={i} cx={x(i)} cy={y(v)} r={months.length > 40 ? 1.8 : 3} fill={color}>
                    <title>{`${series[si].target} · ${formatMonth(months[i].year, months[i].month)}: ${indexed ? v.toFixed(0) : Math.round(v).toLocaleString('en-GB')}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
          {months.map((m, i) => (i === months.length - 1 || (i % labelStep === 0 && months.length - 1 - i >= labelStep / 2)) && (
            <text key={i} x={x(i)} y={H - 10} textAnchor={months.length > 1 && i === months.length - 1 ? 'end' : months.length > 1 && i === 0 ? 'start' : 'middle'} fontSize="9" fill="currentColor" opacity="0.58">{formatMonth(m.year, m.month)}</text>
          ))}
        </svg>
      </div>
    </section>
  );
}
