'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface BulkRdItem {
  target?: string;
  referring_domains?: number;
  referring_main_domains?: number;
  referring_ips?: number;
  broken_backlinks?: number;
  broken_pages?: number;
  referring_domains_nofollow?: number;
}

type SortKey = 'target' | 'referring_domains' | 'referring_main_domains' | 'referring_ips' | 'referring_domains_nofollow' | 'broken_backlinks';
type SortDir = 'asc' | 'desc';

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }

function sortValue(item: BulkRdItem, key: SortKey): number | string {
  switch (key) {
    case 'target': return item.target?.toLowerCase() ?? '';
    case 'referring_domains': return item.referring_domains ?? -1;
    case 'referring_main_domains': return item.referring_main_domains ?? -1;
    case 'referring_ips': return item.referring_ips ?? -1;
    case 'referring_domains_nofollow': return item.referring_domains_nofollow ?? -1;
    case 'broken_backlinks': return item.broken_backlinks ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function BulkRdTable({ items }: { items: BulkRdItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('referring_domains');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const maxRd = Math.max(...items.map((i) => i.referring_domains ?? 0), 1);

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

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'right'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left !px-6' : 'text-right'} ${className ?? ''}`}
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
            <Header label="Domain" sortK="target" align="left" />
            <Header label="Ref. Domains" sortK="referring_domains" align="left" />
            <Header label="Main RD" sortK="referring_main_domains" align="right" className="hidden sm:table-cell" />
            <Header label="Ref. IPs" sortK="referring_ips" align="right" className="hidden md:table-cell" />
            <Header label="Nofollow RD" sortK="referring_domains_nofollow" align="right" className="hidden lg:table-cell" />
            <Header label="Broken BL" sortK="broken_backlinks" align="right" className="hidden lg:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map((item, i) => {
            const share = Math.round(((item.referring_domains ?? 0) / maxRd) * 100);
            return (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-3 font-mono text-sm text-slate-900 dark:text-slate-200 font-medium">{item.target ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${share}%` }} />
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">{fmt(item.referring_domains)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden sm:table-cell">{fmt(item.referring_main_domains)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden md:table-cell">{fmt(item.referring_ips)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden lg:table-cell">{fmt(item.referring_domains_nofollow)}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums hidden lg:table-cell">
                  {item.broken_backlinks ? <span className="text-red-500">{fmt(item.broken_backlinks)}</span> : <span className="text-slate-300">0</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
