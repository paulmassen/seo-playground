'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export interface RefDomain {
  domain: string;
  domain_from_rank: number;
  backlinks: number;
  broken_backlinks: number;
  referring_links_tld: Record<string, number>;
  first_seen: string;
  last_seen: string;
  is_broken: boolean;
  is_redirect: boolean;
}

type SortKey = 'domain' | 'dr' | 'backlinks' | 'broken' | 'first_seen';
type SortDir = 'asc' | 'desc';

function DRBadge({ rank }: { rank: number }) {
  const cls = rank >= 70
    ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
    : rank >= 40
    ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
  return <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border tabular-nums ${cls}`}>DR {rank}</span>;
}

function sortValue(item: RefDomain, key: SortKey): number | string {
  switch (key) {
    case 'domain': return item.domain?.toLowerCase() ?? '';
    case 'dr': return item.domain_from_rank ?? -1;
    case 'backlinks': return item.backlinks ?? -1;
    case 'broken': return item.broken_backlinks ?? -1;
    case 'first_seen': return item.first_seen ?? '';
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function ReferringDomainsTable({ items }: { items: RefDomain[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('dr');
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

  function Header({ label, sortK, align }: { label: string; sortK: SortKey; align: 'left' | 'center' | 'right' }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'}`}
          onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''} ${align === 'center' ? 'justify-center' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-slate-100 dark:border-slate-800">
          <Header label="Domain" sortK="domain" align="left" />
          <Header label="DR" sortK="dr" align="center" />
          <Header label="Links" sortK="backlinks" align="right" />
          <Header label="Broken" sortK="broken" align="right" />
          <Header label="First Seen" sortK="first_seen" align="left" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
        {sorted.map((item, i) => (
          <tr key={i} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/50 ${item.is_broken ? 'opacity-50' : ''}`}>
            <td className="px-5 py-3">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <a href={`https://${item.domain}`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{item.domain}</a>
                {item.is_redirect && <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1">redirect</span>}
                {item.is_broken && <span className="text-[9px] font-black uppercase tracking-wider text-red-400 border border-red-200 dark:border-red-900 rounded px-1">broken</span>}
              </div>
            </td>
            <td className="px-3 py-3 text-center"><DRBadge rank={item.domain_from_rank} /></td>
            <td className="px-3 py-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">{item.backlinks.toLocaleString()}</td>
            <td className="px-3 py-3 text-right font-mono text-slate-400">{item.broken_backlinks > 0 ? item.broken_backlinks : '—'}</td>
            <td className="px-3 py-3 text-slate-400">{item.first_seen?.split('T')[0] ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
