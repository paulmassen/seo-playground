'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface TrafficMetrics { count?: number; etv?: number; impressions_etv?: number; }
interface TrafficItem { target?: string; metrics?: { organic?: TrafficMetrics; paid?: TrafficMetrics } }

type SortKey = 'target' | 'traffic' | 'keywords' | 'paid_keywords';
type SortDir = 'asc' | 'desc';

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }

function TrafficBar({ value, max }: { value?: number; max: number }) {
  if (!value || max === 0) return <span className="text-slate-300 text-xs">0</span>;
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 tabular-nums">{fmt(value)}</span>
    </div>
  );
}

function sortValue(item: TrafficItem, key: SortKey): number | string {
  switch (key) {
    case 'target': return item.target?.toLowerCase() ?? '';
    case 'traffic': return item.metrics?.organic?.etv ?? -1;
    case 'keywords': return item.metrics?.organic?.count ?? -1;
    case 'paid_keywords': return item.metrics?.paid?.count ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function TrafficEstimationTable({ items }: { items: TrafficItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('traffic');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const maxEtv = Math.max(...items.map((i) => i.metrics?.organic?.etv ?? 0), 1);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb))
        : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'center' | 'right'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? ''}`}
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
            <Header label="Domain" sortK="target" align="left" className="!px-6" />
            <Header label="Est. traffic (ETV)" sortK="traffic" align="left" />
            <Header label="Keywords" sortK="keywords" align="right" />
            <Header label="Paid KWs" sortK="paid_keywords" align="right" className="hidden sm:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map((item, i) => {
            const org = item.metrics?.organic;
            return (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-3 font-mono text-sm text-slate-900 dark:text-slate-200 font-medium">{item.target ?? '—'}</td>
                <td className="px-4 py-3"><TrafficBar value={org?.etv} max={maxEtv} /></td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">{fmt(org?.count)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden sm:table-cell">{fmt(item.metrics?.paid?.count)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
