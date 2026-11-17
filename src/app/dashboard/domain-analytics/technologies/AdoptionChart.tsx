export interface StatsPoint { date: string; domains_count?: number; countries?: Record<string, number> | null }

/** Compact number with enough decimals for ticks that are close together to stay distinct. */
function compact(v: number, span = v) {
  const digits = (unit: number) => Math.min(3, Math.max(1, Math.ceil(Math.log10(unit / Math.max(span, 1))) + 1));
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(digits(1_000_000))}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(digits(1_000))}k`;
  return String(v);
}

function monthLabel(date: string) {
  const d = new Date(date.slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? date.slice(0, 7) : d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

/** Line chart of how many domains use a technology, optionally restricted to one country. */
export default function AdoptionChart({ points, country }: { points: StatsPoint[]; country?: string }) {
  const values = points.map((p) => (country ? p.countries?.[country] ?? 0 : p.domains_count ?? 0));
  if (values.length === 0) return null;
  const W = 720, H = 220, PL = 48, PR = 12, PT = 12, PB = 28;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const lo = min > max * 0.5 ? Math.floor(min * 0.95) : 0;
  const x = (i: number) => PL + (values.length === 1 ? (W - PL - PR) / 2 : (i / (values.length - 1)) * (W - PL - PR));
  const y = (v: number) => PT + (1 - (v - lo) / (max - lo || 1)) * (H - PT - PB);
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ticks = [lo, lo + (max - lo) / 2, max];
  const step = Math.max(1, Math.ceil(values.length / 8));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Domains using the technology over time">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} className="stroke-slate-100 dark:stroke-slate-700" />
          <text x={PL - 6} y={y(t) + 3} textAnchor="end" className="fill-slate-400 text-[10px]">{compact(Math.round(t), (max - lo) / 2)}</text>
        </g>
      ))}
      <path d={line} fill="none" className="stroke-blue-500" strokeWidth={2} />
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={3} className="fill-blue-500"><title>{`${monthLabel(points[i].date)}: ${v.toLocaleString('en-GB')} domains`}</title></circle>
          {i % step === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">{monthLabel(points[i].date)}</text>}
        </g>
      ))}
    </svg>
  );
}
