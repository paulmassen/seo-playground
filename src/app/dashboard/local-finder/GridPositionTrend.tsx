'use client';

import { formatLocalTime } from '@/components/LocalTime';
import { RANK_BANDS, type RankBandKey } from '@/lib/grid-rank-scale';

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

/** Points of a band at one snapshot. "Not found" is whatever is left, so the stack always reaches 100%. */
function bandCount(point: GridPositionTrendPoint, key: RankBandKey): number {
  if (key === 'notFound') return Math.max(0, point.total - point.top3 - point.top4To7 - point.top8To10 - point.top11Plus);
  return point[key];
}

/** Share of grid points in each rank band across snapshots, using the same scale as the map pins. */
export default function GridPositionTrend({ points, selectedId }: Props) {
  const width = 680;
  const height = 196;
  const left = 40;
  const right = 14;
  const top = 12;
  const bottom = 28;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const positionX = (index: number) => points.length === 1 ? left + plotWidth / 2 : left + (index / (points.length - 1)) * plotWidth;
  const y = (value: number) => top + plotHeight * (1 - value / 100);
  const percentage = (point: GridPositionTrendPoint, key: RankBandKey) => point.total > 0 ? (bandCount(point, key) / point.total) * 100 : 0;
  const below = (point: GridPositionTrendPoint, bandIndex: number) => RANK_BANDS.slice(0, bandIndex).reduce((sum, band) => sum + percentage(point, band.key), 0);

  const areaPath = (bandIndex: number) => {
    const key = RANK_BANDS[bandIndex].key;
    const lowerValues = points.map((point) => below(point, bandIndex));
    const upperValues = points.map((point, index) => lowerValues[index] + percentage(point, key));
    const upper = upperValues.map((value, index) => `${index === 0 ? 'M' : 'L'}${positionX(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
    const lower = lowerValues.map((_, index) => `L${positionX(points.length - 1 - index).toFixed(1)},${y(lowerValues[points.length - 1 - index]).toFixed(1)}`).join(' ');
    return `${upper} ${lower} Z`;
  };

  const tickIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const latest = points[points.length - 1];
  const summary = latest
    ? `Latest snapshot: ${RANK_BANDS.map((band) => `${band.label} ${bandCount(latest, band.key)} of ${latest.total} points`).join(', ')}.`
    : '';

  return (
    <figure>
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700 dark:text-slate-300" aria-hidden="true">
        {RANK_BANDS.map((band) => (
          <span key={band.key} className="inline-flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm ring-1 ring-slate-900/10" style={{ backgroundColor: band.fill }} />{band.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full text-slate-600 dark:text-slate-400" role="img" aria-label={`Share of grid points per rank range over ${points.length} snapshots. ${summary}`}>
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="currentColor" strokeOpacity="0.15" />
            <text x={left - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="currentColor">{tick}%</text>
          </g>
        ))}
        {RANK_BANDS.map((band, index) => (
          <path key={band.key} d={areaPath(index)} fill={band.fill} stroke="#ffffff" strokeWidth="1"><title>{band.label}</title></path>
        ))}
        {points.map((point, index) => {
          const active = point.id === selectedId;
          return active
            ? <line key={point.id} x1={positionX(index)} x2={positionX(index)} y1={top} y2={height - bottom} stroke="#0f172a" strokeWidth="2" strokeDasharray="4 3" />
            : null;
        })}
        {tickIndexes.map((index) => (
          <text key={index} x={positionX(index)} y={height - 8} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} fontSize="11" fill="currentColor" suppressHydrationWarning>
            {formatLocalTime(points[index].ts, 'day')}
          </text>
        ))}
      </svg>
    </figure>
  );
}
