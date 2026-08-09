'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface HistoryPoint {
  date?: string;
  backlinks?: number;
  new_backlinks?: number;
  lost_backlinks?: number;
  referring_domains?: number;
  new_referring_domains?: number;
  lost_referring_domains?: number;
  referring_main_domains?: number;
}

type SortKey = 'date' | 'backlinks' | 'new_backlinks' | 'lost_backlinks' | 'referring_domains' | 'new_referring_domains' | 'lost_referring_domains';
type SortDir = 'asc' | 'desc';

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }

function sortValue(item: HistoryPoint, key: SortKey): number | string {
  switch (key) {
    case 'date': return item.date ?? '';
    case 'backlinks': return item.backlinks ?? -1;
    case 'new_backlinks': return item.new_backlinks ?? -1;
    case 'lost_backlinks': return item.lost_backlinks ?? -1;
    case 'referring_domains': return item.referring_domains ?? -1;
    case 'new_referring_domains': return item.new_referring_domains ?? -1;
    case 'lost_referring_domains': return item.lost_referring_domains ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

/** points are expected pre-sorted chronologically (oldest first) — default view sorts newest first. */
export default function BacklinksHistoryTable({ points }: { points: HistoryPoint[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...points].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb))
        : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [points, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'right'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left !px-6' : 'text-right'} ${className ?? 'text-slate-400'}`}
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
            <Header label="Date" sortK="date" align="left" />
            <Header label="Backlinks" sortK="backlinks" align="right" />
            <Header label="+New" sortK="new_backlinks" align="right" className="text-emerald-600" />
            <Header label="−Lost" sortK="lost_backlinks" align="right" className="text-red-500" />
            <Header label="Ref. Domains" sortK="referring_domains" align="right" className="hidden sm:table-cell text-slate-400" />
            <Header label="+New RD" sortK="new_referring_domains" align="right" className="hidden md:table-cell text-emerald-600" />
            <Header label="−Lost RD" sortK="lost_referring_domains" align="right" className="hidden md:table-cell text-red-500" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map((p, i) => (
            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <td className="px-6 py-3 font-mono text-slate-700 dark:text-slate-300">{p.date ?? '—'}</td>
              <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{fmt(p.backlinks)}</td>
              <td className="px-4 py-3 text-right font-mono text-emerald-600 tabular-nums">{p.new_backlinks ? `+${fmt(p.new_backlinks)}` : '—'}</td>
              <td className="px-4 py-3 text-right font-mono text-red-500 tabular-nums">{p.lost_backlinks ? `-${fmt(p.lost_backlinks)}` : '—'}</td>
              <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums hidden sm:table-cell">{fmt(p.referring_domains)}</td>
              <td className="px-4 py-3 text-right font-mono text-emerald-600 tabular-nums hidden md:table-cell">{p.new_referring_domains ? `+${fmt(p.new_referring_domains)}` : '—'}</td>
              <td className="px-4 py-3 text-right font-mono text-red-500 tabular-nums hidden md:table-cell">{p.lost_referring_domains ? `-${fmt(p.lost_referring_domains)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
