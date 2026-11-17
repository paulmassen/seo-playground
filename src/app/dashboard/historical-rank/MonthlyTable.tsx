'use client';

import { METRIC_HINTS } from '@/lib/metric-glossary';
import { useState } from 'react';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { formatMonth, pctChange, top10, top3, type HistRankItem } from './hist-shared';

function n(v?: number) { return Math.round(v ?? 0).toLocaleString('en-GB'); }

function Delta({ from, to }: { from?: number; to?: number }) {
  const pct = pctChange(from, to);
  if (pct === null || Math.abs(pct) < 0.05) return null;
  const cls = pct > 0 ? 'text-emerald-600' : 'text-red-500';
  return <span className={`block text-[9px] font-bold ${cls}`}>{pct > 0 ? '+' : ''}{pct >= 100 || pct <= -100 ? pct.toFixed(0) : pct.toFixed(1)}%</span>;
}

function Th({ children, hint, align = 'right' }: { children: React.ReactNode; hint?: string; align?: 'left' | 'right' }) {
  return (
    <th title={hint} className={`px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right'}`}>
      <span className={hint ? 'underline decoration-dotted decoration-slate-300 dark:decoration-slate-600 underline-offset-[3px] cursor-help' : undefined}>{children}</span>
    </th>
  );
}

/** Newest month first, each value with its change against the previous month. */
export default function MonthlyTable({ items, target }: { items: HistRankItem[]; target: string }) {
  const [showPaid, setShowPaid] = useState(items.some((i) => (i.metrics.paid?.count ?? 0) > 0));
  const hasMoves = items.some((i) => i.metrics.organic?.is_new != null);
  const rows = [...items].reverse();

  const csvData = items.map((i) => {
    const o = i.metrics.organic ?? {};
    const p = i.metrics.paid ?? {};
    return {
      month: `${i.year}-${String(i.month).padStart(2, '0')}`,
      keywords: o.count ?? 0, pos_1: o.pos_1 ?? 0, top3: top3(o), top10: top10(o),
      etv: Math.round(o.etv ?? 0), traffic_value: Math.round(o.estimated_paid_traffic_cost ?? 0),
      is_new: o.is_new ?? '', is_up: o.is_up ?? '', is_down: o.is_down ?? '', is_lost: o.is_lost ?? '',
      paid_keywords: p.count ?? 0, paid_etv: Math.round(p.etv ?? 0),
    };
  });
  const csvColumns = [
    { key: 'month', label: 'Month' }, { key: 'keywords', label: 'Ranked keywords' }, { key: 'pos_1', label: '#1' },
    { key: 'top3', label: 'Top 3' }, { key: 'top10', label: 'Top 10' }, { key: 'etv', label: 'Organic ETV' },
    { key: 'traffic_value', label: 'Traffic value ($)' }, { key: 'is_new', label: 'New' }, { key: 'is_up', label: 'Up' },
    { key: 'is_down', label: 'Down' }, { key: 'is_lost', label: 'Lost' }, { key: 'paid_keywords', label: 'Paid keywords' },
    { key: 'paid_etv', label: 'Paid ETV' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden dark:bg-slate-900 dark:border-slate-800">
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 flex-wrap">
        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Month by month · {target}</h2>
        <label className="text-[11px] text-slate-500 flex items-center gap-1.5 cursor-pointer ml-auto">
          <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} /> Paid columns
        </label>
        <CopyMarkdownButton data={csvData} columns={csvColumns} />
        <ExportCSVButton data={csvData} filename={`historical-rank-${target}.csv`} columns={csvColumns} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <Th align="left">Month</Th>
              <Th hint={METRIC_HINTS.rankedKeywords}>Keywords</Th>
              <Th hint="Keywords ranking #1.">#1</Th>
              <Th hint={METRIC_HINTS.top3}>Top 3</Th>
              <Th hint="Keywords ranking in positions 1 to 10 (page one).">Top 10</Th>
              <Th hint={METRIC_HINTS.etv}>ETV</Th>
              <Th hint={METRIC_HINTS.trafficValue}>Value</Th>
              {hasMoves && <Th hint="Ranked keywords that were new / moved up / moved down / disappeared compared with the previous month.">New · Up · Down · Lost</Th>}
              {showPaid && <Th hint={METRIC_HINTS.paidKeywords}>Paid KW</Th>}
              {showPaid && <Th hint={METRIC_HINTS.paidEtv}>Paid ETV</Th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {rows.map((item, i) => {
              const prev = rows[i + 1];
              const o = item.metrics.organic ?? {};
              const po = prev?.metrics.organic;
              const p = item.metrics.paid ?? {};
              const pp = prev?.metrics.paid;
              return (
                <tr key={`${item.year}-${item.month}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 align-top">
                  <td className="px-5 py-2.5 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">{formatMonth(item.year, item.month)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">{n(o.count)}<Delta from={po?.count} to={o.count} /></td>
                  <td className="px-3 py-2.5 text-right font-mono font-black text-emerald-600">{n(o.pos_1)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-teal-600">{n(top3(o))}<Delta from={po ? top3(po) : undefined} to={top3(o)} /></td>
                  <td className="px-3 py-2.5 text-right font-mono text-blue-600">{n(top10(o))}<Delta from={po ? top10(po) : undefined} to={top10(o)} /></td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">{n(o.etv)}<Delta from={po?.etv} to={o.etv} /></td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-500">${n(o.estimated_paid_traffic_cost)}</td>
                  {hasMoves && (
                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">
                      <span className="text-emerald-600">+{o.is_new ?? 0}</span>{' '}
                      <span className="text-blue-500">↑{o.is_up ?? 0}</span>{' '}
                      <span className="text-amber-600">↓{o.is_down ?? 0}</span>{' '}
                      <span className="text-red-500">−{o.is_lost ?? 0}</span>
                    </td>
                  )}
                  {showPaid && <td className="px-3 py-2.5 text-right font-mono text-violet-600">{n(p.count)}<Delta from={pp?.count} to={p.count} /></td>}
                  {showPaid && <td className="px-3 py-2.5 text-right font-mono text-violet-600">{n(p.etv)}<Delta from={pp?.etv} to={p.etv} /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
