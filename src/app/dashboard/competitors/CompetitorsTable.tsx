'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { CompetitorItem } from './page';

type SortKey = 'domain' | 'intersections' | 'avg_position' | 'traffic' | 'total_kw';
type SortDir = 'asc' | 'desc';

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-GB');
}

function n(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function TrafficBadge({ value }: { value?: number }) {
  if (!value) return <span className="text-slate-300">—</span>;
  const color = value >= 10000 ? 'text-emerald-700 bg-emerald-50'
    : value >= 1000 ? 'text-blue-700 bg-blue-50'
    : 'text-slate-600 bg-slate-100';
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-black tabular-nums ${color}`}>{n(value)}</span>;
}

function sortValue(item: CompetitorItem, key: SortKey): number | string {
  switch (key) {
    case 'domain': return item.domain?.toLowerCase() ?? '';
    case 'intersections': return item.intersections ?? -1;
    case 'avg_position': return item.avg_position ?? -1;
    case 'traffic': return item.metrics?.organic?.estimated_traffic ?? item.full_domain_metrics?.organic?.estimated_traffic ?? -1;
    case 'total_kw': return item.full_domain_metrics?.organic?.count ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function CompetitorsTable({ items, maxIntersections }: { items: CompetitorItem[]; maxIntersections: number }) {
  const [sortKey, setSortKey] = useState<SortKey>('intersections');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'right'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left' : 'text-right'} ${className ?? ''}`}
          onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <th className="px-5 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 w-10">#</th>
            <Header label="Competitor domain" sortK="domain" align="left" />
            <Header label="Common keywords" sortK="intersections" align="left" />
            <Header label="Avg pos." sortK="avg_position" align="right" />
            <Header label="Est. traffic" sortK="traffic" align="right" className="hidden sm:table-cell" />
            <Header label="Total KW" sortK="total_kw" align="right" className="hidden md:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map((item, i) => {
            const intersections = item.intersections ?? 0;
            const barPct = Math.round((intersections / maxIntersections) * 100);
            const traffic = item.metrics?.organic?.estimated_traffic;
            const totalKw = item.full_domain_metrics?.organic?.count;

            return (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-5 py-3 text-center">
                  <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-black flex items-center justify-center mx-auto">
                    {i + 1}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`https://${item.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-sm"
                  >
                    {item.domain}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-900 dark:text-white tabular-nums w-10 shrink-0">{fmt(intersections)}</span>
                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden min-w-[60px]">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                  {item.avg_position ? item.avg_position.toFixed(1) : '—'}
                </td>
                <td className="px-4 py-3 text-right hidden sm:table-cell">
                  <TrafficBadge value={traffic} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums hidden md:table-cell">
                  {fmt(totalKw)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
