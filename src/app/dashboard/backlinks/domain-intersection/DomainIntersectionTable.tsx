'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface DomIntItem {
  domain_from?: string;
  domain_from_rank?: number;
  backlinks_from_target1?: number;
  backlinks_from_target2?: number;
  first_seen?: string;
  last_seen?: string;
}

type SortKey = 'domain_from' | 'domain_from_rank' | 'backlinks_from_target1' | 'backlinks_from_target2' | 'last_seen';
type SortDir = 'asc' | 'desc';

function RankBadge({ rank }: { rank?: number }) {
  if (rank == null) return <span className="text-slate-300 text-xs">—</span>;
  const cls = rank >= 70 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : rank >= 40 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200';
  return <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border tabular-nums ${cls}`}>DR {rank}</span>;
}

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }

function sortValue(item: DomIntItem, key: SortKey): number | string {
  switch (key) {
    case 'domain_from': return item.domain_from?.toLowerCase() ?? '';
    case 'domain_from_rank': return item.domain_from_rank ?? -1;
    case 'backlinks_from_target1': return item.backlinks_from_target1 ?? -1;
    case 'backlinks_from_target2': return item.backlinks_from_target2 ?? -1;
    case 'last_seen': return item.last_seen ?? '';
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function DomainIntersectionTable({ items, t1, t2 }: { items: DomIntItem[]; t1: string; t2: string }) {
  const [sortKey, setSortKey] = useState<SortKey>('domain_from_rank');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left !px-6' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? 'text-slate-400'}`}
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
            <Header label="Linking domain" sortK="domain_from" align="left" />
            <Header label="DR" sortK="domain_from_rank" align="center" />
            <Header label={`→ ${t1 || 'Target 1'}`} sortK="backlinks_from_target1" align="right" className="text-blue-600" />
            <Header label={`→ ${t2 || 'Target 2'}`} sortK="backlinks_from_target2" align="right" className="text-violet-600" />
            <Header label="Last seen" sortK="last_seen" align="right" className="hidden lg:table-cell text-slate-400" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map((item, i) => (
            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <td className="px-6 py-3 font-mono text-sm text-slate-900 dark:text-slate-200">{item.domain_from ?? '—'}</td>
              <td className="px-4 py-3 text-center"><RankBadge rank={item.domain_from_rank} /></td>
              <td className="px-4 py-3 text-right font-mono text-blue-600 tabular-nums font-bold">{fmt(item.backlinks_from_target1)}</td>
              <td className="px-4 py-3 text-right font-mono text-violet-600 tabular-nums font-bold">{fmt(item.backlinks_from_target2)}</td>
              <td className="px-4 py-3 text-right text-slate-400 text-[11px] hidden lg:table-cell">{item.last_seen?.slice(0, 10) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
