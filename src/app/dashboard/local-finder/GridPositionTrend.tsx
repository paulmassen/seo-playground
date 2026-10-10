export type GridPositionTrendPoint = {
  id: string;
  ts: number;
  total: number;
  top3: number;
  top4To7: number;
  top8To10: number;
  top11Plus: number;
};

type Props = {
  points: GridPositionTrendPoint[];
  selectedId: string;
};

const bands = [
  { key: 'top3', label: 'Top 3', color: '#059669' },
  { key: 'top4To7', label: '#4–7', color: '#14b8a6' },
  { key: 'top8To10', label: '#8–10', color: '#3b82f6' },
  { key: 'top11Plus', label: '#11+', color: '#f59e0b' },
] as const;

function formatDate(ts: number) {
  // SVG titles are rendered both on the server and browser. Pin the locale and
  // timezone so a French browser cannot hydrate "Aug 8" as "8 août".
  return new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(ts));
}

export default function GridPositionTrend({ points, selectedId }: Props) {
  const width = 680;
  const height = 204;
  const left = 38;
  const right = 14;
  const top = 14;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const positionX = (index: number) => points.length === 1 ? left + plotWidth / 2 : left + (index / (points.length - 1)) * plotWidth;
  const y = (value: number) => top + plotHeight * (1 - value / 100);
  const percentage = (point: GridPositionTrendPoint, key: typeof bands[number]['key']) => point.total > 0 ? (point[key] / point.total) * 100 : 0;

  const areaPath = (key: typeof bands[number]['key']) => {
    const bandIndex = bands.findIndex((band) => band.key === key);
    const lowerValues = points.map((point) => bands.slice(0, bandIndex).reduce((sum, band) => sum + percentage(point, band.key), 0));
    const upperValues = points.map((point, index) => lowerValues[index] + percentage(point, key));
    const upper = upperValues.map((value, index) => `${index === 0 ? 'M' : 'L'}${positionX(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
    const lowerPath = lowerValues.map((value, index) => `L${positionX(points.length - 1 - index).toFixed(1)},${y(lowerValues[points.length - 1 - index]).toFixed(1)}`).join(' ');
    return `${upper} ${lowerPath} Z`;
  };

  const runningPercent = (point: GridPositionTrendPoint, through: number) => bands.slice(0, through + 1).reduce((sum, band) => sum + percentage(point, band.key), 0);
  const tickIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

  return (
    <section className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-900 dark:text-white">Position distribution over time</h3>
          <p className="mt-0.5 text-[11px] text-slate-400">Share of grid points in each ranking range. Newest snapshot is on the right.</p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-slate-500">
          {bands.map((band) => <span key={band.key} className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{ backgroundColor: band.color }} />{band.label}</span>)}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl bg-slate-50 p-2 dark:bg-slate-950/60">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Position distribution trend by ranking range">
          {[0, 25, 50, 75, 100].map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="currentColor" strokeOpacity="0.10" /><text x={left - 7} y={y(tick) + 3} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.48">{tick}%</text></g>)}
          {points.length === 1 ? bands.map((band, index) => {
            const lower = bands.slice(0, index).reduce((sum, previousBand) => sum + percentage(points[0], previousBand.key), 0);
            const upper = lower + percentage(points[0], band.key);
            return <rect key={band.key} x={positionX(0) - 28} y={y(upper)} width="56" height={y(lower) - y(upper)} fill={band.color}><title>{`${band.label}: ${Math.round(percentage(points[0], band.key))}%`}</title></rect>;
          }) : bands.map((band) => <path key={band.key} d={areaPath(band.key)} fill={band.color} fillOpacity="0.86" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="1"><title>{band.label}</title></path>)}
          {points.map((point, index) => {
            const active = point.id === selectedId;
            return <g key={point.id}><line x1={positionX(index)} x2={positionX(index)} y1={top} y2={height - bottom} stroke={active ? '#1d4ed8' : 'currentColor'} strokeOpacity={active ? '0.6' : '0.08'} strokeDasharray={active ? '3 3' : undefined} /><circle cx={positionX(index)} cy={y(runningPercent(point, 0))} r={active ? 4.5 : 3} fill="#ffffff" stroke="#059669" strokeWidth="2"><title>{`${formatDate(point.ts)} — Top 3: ${point.top3}/${point.total}; #4–7: ${point.top4To7}/${point.total}; #8–10: ${point.top8To10}/${point.total}; #11+: ${point.top11Plus}/${point.total}`}</title></circle></g>;
          })}
          {tickIndexes.map((index) => <text key={index} x={positionX(index)} y={height - 10} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} fontSize="9" fill="currentColor" opacity="0.55">{formatDate(points[index].ts)}</text>)}
        </svg>
      </div>
      {points.length === 1 && <p className="mt-2 text-[10px] text-slate-400">Run this monitor again to draw its trend.</p>}
    </section>
  );
}
