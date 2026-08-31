'use client';

import { useState } from 'react';
import type { TrackedKeyword, RankCheck } from '@/lib/db';
import PendingButton from '@/components/PendingButton';

// ─── Badges ───────────────────────────────────────────────────────────────────

function PositionBadge({ pos }: { pos: number | null }) {
  if (pos === null)
    return <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-red-50 text-red-400 border border-red-100">—</span>;
  const cls =
    pos <= 3 ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
    : pos <= 10 ? 'bg-blue-50 text-blue-600 border-blue-200'
    : pos <= 30 ? 'bg-yellow-50 text-yellow-600 border-yellow-200'
    : 'bg-slate-100 text-slate-500 border-slate-200';
  return <span className={`px-2 py-0.5 rounded-lg text-[11px] font-black border tabular-nums ${cls}`}>#{pos}</span>;
}

function TrendBadge({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null && previous === null) return null;
  if (previous === null || current === null) return <span className="text-[10px] font-bold text-slate-300">new</span>;
  const diff = previous - current;
  if (diff === 0) return <span className="text-[11px] text-slate-300">—</span>;
  if (diff > 0) return <span className="text-[10px] font-black text-emerald-500">↑{diff}</span>;
  return <span className="text-[10px] font-black text-red-400">↓{Math.abs(diff)}</span>;
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ history }: { history: RankCheck[] }) {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const last14 = sorted.slice(-14);
  if (last14.length < 2) return <span className="text-[10px] text-slate-300">—</span>;

  const positions = last14.map((c) => c.position);
  const definedPositions = positions.filter((p): p is number => p !== null);
  if (definedPositions.length < 2) return <span className="text-[10px] text-slate-300">—</span>;

  const maxPos = Math.max(...definedPositions, 10);
  const minPos = Math.min(...definedPositions, 1);
  const range = Math.max(maxPos - minPos, 5);
  const W = 80, H = 24;
  const xStep = W / (last14.length - 1);
  const toY = (p: number) => ((p - minPos) / range) * (H - 4) + 2;

  const points: { x: number; y: number }[] = [];
  last14.forEach((c, i) => {
    if (c.position !== null) points.push({ x: i * xStep, y: toY(c.position) });
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const latest = positions[positions.length - 1];
  const stroke = latest !== null && latest <= 10 ? '#3b82f6' : '#94a3b8';

  return (
    <svg width={W} height={H} className="overflow-visible">
      <path d={pathD} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.length > 0 && (
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill={stroke} />
      )}
    </svg>
  );
}

// ─── History chart ────────────────────────────────────────────────────────────

interface TooltipData {
  x: number;
  y: number;
  date: string;
  position: number | null;
  url: string | null;
}

function HistoryChart({ history, keywordId }: { history: RankCheck[]; keywordId: number }) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0)
    return <div className="py-6 text-center text-slate-400 text-xs">No checks recorded yet.</div>;

  const positions = sorted.map((h) => h.position).filter((p): p is number => p !== null);

  if (positions.length === 0)
    return <div className="py-6 text-center text-slate-400 text-xs">No ranking data recorded yet.</div>;

  const W = 600, H = 150;
  const PAD = { l: 44, r: 20, t: 20, b: 36 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const minPos = Math.max(1, Math.min(...positions) - 2);
  const maxPos = Math.max(...positions) + 2;
  const posRange = Math.max(maxPos - minPos, 5);

  const n = sorted.length;
  const toX = (i: number) => PAD.l + (i / Math.max(n - 1, 1)) * chartW;
  const toY = (pos: number) => PAD.t + ((pos - minPos) / posRange) * chartH;

  const allPoints = sorted.map((entry, i) => ({ x: toX(i), y: entry.position !== null ? toY(entry.position) : null, entry }));
  const validPoints = allPoints.filter((p): p is typeof p & { y: number } => p.y !== null);

  // Build path — restart subpath after gaps
  const segments: string[] = [];
  let penDown = false;
  for (const p of allPoints) {
    if (p.y !== null) {
      segments.push(`${penDown ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
      penDown = true;
    } else {
      penDown = false;
    }
  }
  const pathD = segments.join(' ');

  // Area fill under valid points
  const areaD = validPoints.length >= 2
    ? `M ${validPoints.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')} L ${validPoints[validPoints.length - 1].x.toFixed(1)} ${(PAD.t + chartH).toFixed(1)} L ${validPoints[0].x.toFixed(1)} ${(PAD.t + chartH).toFixed(1)} Z`
    : '';

  const latestPos = positions[positions.length - 1];
  const stroke = latestPos <= 10 ? '#3b82f6' : '#6366f1';
  const gradId = `kw-grad-${keywordId}`;

  // Y-axis labels
  const ySteps = 4;
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => {
    const pos = Math.round(minPos + (i / ySteps) * posRange);
    return { pos, y: toY(pos) };
  });

  // X-axis labels — up to 7 evenly spaced
  const xCount = Math.min(n, 7);
  const xLabels = Array.from({ length: xCount }, (_, i) => {
    const idx = xCount <= 1 ? 0 : Math.round((i / (xCount - 1)) * (n - 1));
    return { x: toX(idx), label: sorted[idx].date.slice(5) };
  });

  // Page-1 boundary line at position 10
  const y10 = toY(10);
  const showBoundary = y10 > PAD.t && y10 < PAD.t + chartH;

  return (
    <div className="relative select-none">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${H}px` }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yLabels.map(({ y }, i) => (
          <line key={i} x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#f1f5f9" strokeWidth="1" />
        ))}

        {/* Page-1 boundary */}
        {showBoundary && (
          <>
            <line x1={PAD.l} y1={y10} x2={W - PAD.r} y2={y10} stroke="#bfdbfe" strokeWidth="1" strokeDasharray="4 3" />
            <text x={W - PAD.r + 2} y={y10 + 4} fontSize="8" fill="#93c5fd">10</text>
          </>
        )}

        {/* Area */}
        {areaD && <path d={areaD} fill={`url(#${gradId})`} />}

        {/* Line */}
        <path d={pathD} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Y-axis labels */}
        {yLabels.map(({ pos, y }) => (
          <text key={pos} x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8" fontWeight="600">
            #{pos}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ x, label }, i) => (
          <text key={i} x={x} y={H - 6} textAnchor="middle" fontSize="9" fill="#94a3b8">{label}</text>
        ))}

        {/* Bottom axis */}
        <line x1={PAD.l} y1={PAD.t + chartH} x2={W - PAD.r} y2={PAD.t + chartH} stroke="#e2e8f0" strokeWidth="1" />

        {/* Data points */}
        {validPoints.map(({ x, y, entry }, i) => {
          const isHovered = tooltip?.date === entry.date;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={isHovered ? 5 : 3.5}
              fill={isHovered ? stroke : 'white'}
              stroke={stroke}
              strokeWidth="2"
              style={{ cursor: 'crosshair' }}
              onMouseEnter={() => setTooltip({ x, y, date: entry.date, position: entry.position, url: entry.url ?? null })}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}

        {/* Tooltip */}
        {tooltip && (() => {
          const hasUrl = !!tooltip.url;
          const tipW = 180, tipH = hasUrl ? 54 : 38;
          const tipX = Math.max(PAD.l, Math.min(tooltip.x - tipW / 2, W - PAD.r - tipW));
          const tipY = Math.max(PAD.t, tooltip.y - tipH - 12);
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="6" fill="white" stroke="#e2e8f0" strokeWidth="1"
                style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.08))' }} />
              <text x={tipX + 10} y={tipY + 15} fontSize="9" fill="#64748b" fontWeight="600">{tooltip.date}</text>
              <text x={tipX + 10} y={tipY + 30} fontSize="12" fill={stroke} fontWeight="800">
                {tooltip.position !== null ? `#${tooltip.position}` : 'Not ranked'}
              </text>
              {hasUrl && (
                <text x={tipX + 10} y={tipY + 46} fontSize="8.5" fill="#94a3b8">
                  {(tooltip.url!.replace(/^https?:\/\//, '')).slice(0, 30) + (tooltip.url!.length > 35 ? '…' : '')}
                </text>
              )}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// ─── Keyword row ──────────────────────────────────────────────────────────────

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  kw: TrackedKeyword;
  history: RankCheck[];
  latest: RankCheck | null;
  previous: RankCheck | null;
  hasCreds: boolean;
  checkAction: (fd: FormData) => Promise<void>;
  removeAction: (fd: FormData) => Promise<void>;
}

export default function KeywordRow({ kw, history, latest, previous, hasCreds, checkAction, removeAction }: Props) {
  const [expanded, setExpanded] = useState(false);
  const currPos = latest?.position ?? null;
  const prevPos = previous?.position ?? null;

  return (
    <>
      <tr
        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-5 py-3.5">
          <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
            <span
              className="inline-block text-[8px] text-slate-300 transition-transform duration-200"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              ▼
            </span>
            {kw.keyword}
          </div>
          <div className="text-[10px] text-slate-400 pl-4">{kw.location} · {kw.language}</div>
        </td>
        <td className="px-3 py-3.5 text-center">
          <PositionBadge pos={currPos} />
        </td>
        <td className="px-3 py-3.5 text-center">
          <TrendBadge current={currPos} previous={prevPos} />
        </td>
        <td className="px-3 py-3.5">
          <div className="flex justify-center">
            <Sparkline history={history} />
          </div>
        </td>
        <td className="px-3 py-3.5 text-slate-400 text-[10px] whitespace-nowrap">
          {latest ? formatDate(latest.checkedAt) : '—'}
        </td>
        <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1.5">
            {hasCreds && (
              <form action={checkAction}>
                <input type="hidden" name="id" value={kw.id} />
                <input type="hidden" name="keyword" value={kw.keyword} />
                <input type="hidden" name="domain" value={kw.domain} />
                <input type="hidden" name="location" value={kw.location} />
                <input type="hidden" name="language" value={kw.language} />
                <PendingButton
                  type="submit"
                  className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all"
                  pendingClassName="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg bg-blue-100 text-blue-300 cursor-not-allowed"
                >
                  ↻
                </PendingButton>
              </form>
            )}
            <form action={removeAction}>
              <input type="hidden" name="id" value={kw.id} />
              <button type="submit" className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-all">
                ✕
              </button>
            </form>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-slate-50/40 dark:bg-slate-800/30">
          <td colSpan={6} className="px-5 pt-1 pb-5">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
              Position history — last 30 days
            </div>
            <HistoryChart history={history} keywordId={kw.id} />
            {latest?.url && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-semibold shrink-0">Ranked URL:</span>
                <a
                  href={latest.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-blue-600 hover:underline font-mono truncate"
                  onClick={(e) => e.stopPropagation()}
                >
                  {latest.url}
                </a>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
