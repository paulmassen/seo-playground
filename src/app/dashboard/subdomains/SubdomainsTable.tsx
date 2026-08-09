'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface SubdomainItem {
  subdomain?: string;
  metrics?: {
    organic?: {
      count?: number;
      etv?: number;
      estimated_paid_traffic_cost?: number;
    };
  };
}

type SortKey = 'subdomain' | 'keywords' | 'traffic' | 'traffic_cost';
type SortDir = 'asc' | 'desc';

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }

function sortValue(item: SubdomainItem, key: SortKey): number | string {
  const org = item.metrics?.organic;
  switch (key) {
    case 'subdomain': return item.subdomain?.toLowerCase() ?? '';
    case 'keywords': return org?.count ?? -1;
    case 'traffic': return org?.etv ?? -1;
    case 'traffic_cost': return org?.estimated_paid_traffic_cost ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function SubdomainsTable({ items }: { items: SubdomainItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('traffic');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const maxTraffic = Math.max(...items.map((i) => i.metrics?.organic?.etv ?? 0), 1);

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
            <Header label="Subdomain" sortK="subdomain" align="left" className="!px-6" />
            <Header label="Keywords" sortK="keywords" align="right" />
            <Header label="Traffic" sortK="traffic" align="right" />
            <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell">Share</th>
            <Header label="Traffic value" sortK="traffic_cost" align="right" className="hidden lg:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map((item, i) => {
            const org = item.metrics?.organic;
            const etv = org?.etv ?? 0;
            const share = maxTraffic > 0 ? Math.round((etv / maxTraffic) * 100) : 0;
            return (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-3 font-mono text-sm text-blue-600 dark:text-blue-400 max-w-[240px]">
                  <a href={`https://${item.subdomain}`} target="_blank" rel="noopener noreferrer" className="hover:underline truncate block">{item.subdomain ?? '—'}</a>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">{fmt(org?.count)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums font-bold">{fmt(Math.round(etv))}</td>
                <td className="px-6 py-3 hidden md:table-cell">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${share}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-400 tabular-nums">{share}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden lg:table-cell">
                  {org?.estimated_paid_traffic_cost != null ? `$${Math.round(org.estimated_paid_traffic_cost).toLocaleString('en-GB')}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
