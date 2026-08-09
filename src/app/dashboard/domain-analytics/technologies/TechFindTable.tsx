'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';

type TechCategories = Record<string, Record<string, string[]>>;

interface FindDomainItem {
  domain?: string;
  title?: string;
  description?: string;
  domain_rank?: number;
  country_iso_code?: string;
  last_visited?: string;
  technologies?: TechCategories;
}

type SortKey = 'dr' | 'domain' | 'title' | 'country' | 'last_seen';
type SortDir = 'asc' | 'desc';

function DrBadge({ value }: { value?: number }) {
  if (!value) return <span className="text-slate-300 text-xs">—</span>;
  const color = value >= 70 ? 'bg-emerald-500 text-white' : value >= 40 ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500';
  return <span className={`inline-flex items-center justify-center w-9 h-5 rounded text-[10px] font-black ${color}`}>{value}</span>;
}

function fmtVisited(s?: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function sortValue(item: FindDomainItem, key: SortKey): number | string {
  switch (key) {
    case 'dr': return item.domain_rank ?? -1;
    case 'domain': return item.domain?.toLowerCase() ?? '';
    case 'title': return item.title?.toLowerCase() ?? '';
    case 'country': return item.country_iso_code ?? '';
    case 'last_seen': return item.last_visited ?? '';
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function TechFindTable({ items }: { items: FindDomainItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('dr');
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
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? ''}`}
          onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : align === 'center' ? 'justify-center' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((item) => ({
    dr: item.domain_rank ?? '',
    domain: item.domain ?? '',
    title: item.title ?? '',
    country: item.country_iso_code ?? '',
    last_seen: item.last_visited ? item.last_visited.split('T')[0] : '',
  }));

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Matching domains</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs font-black text-slate-400">{items.length} shown</span>
          <CopyMarkdownButton
            data={csvData}
            columns={[
              { key: 'dr', label: 'DR' },
              { key: 'domain', label: 'Domain' },
              { key: 'title', label: 'Title' },
              { key: 'country', label: 'Country' },
              { key: 'last_seen', label: 'Last Seen' },
            ]}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
              <Header label="DR" sortK="dr" align="center" className="w-14" />
              <Header label="Domain" sortK="domain" align="left" />
              <Header label="Title" sortK="title" align="left" className="hidden md:table-cell" />
              <Header label="Country" sortK="country" align="center" className="hidden sm:table-cell w-16" />
              <Header label="Last seen" sortK="last_seen" align="right" className="hidden lg:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
            {sorted.map((item, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                <td className="px-4 py-3 text-center"><DrBadge value={item.domain_rank} /></td>
                <td className="px-4 py-3">
                  <a href={`https://${item.domain}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 hover:text-blue-600 transition-colors">
                    {item.domain}
                  </a>
                  {item.technologies && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Array.from(
                        new Set(
                          Object.values(item.technologies).flatMap((subcats) => Object.values(subcats).flat()),
                        ),
                      )
                        .slice(0, 6)
                        .map((t) => (
                          <span key={t} className="text-[9px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">{t}</span>
                        ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 max-w-[200px] hidden md:table-cell">
                  <span className="text-xs text-slate-600 dark:text-slate-400 truncate block">{item.title ?? '—'}</span>
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{item.country_iso_code ?? '—'}</span>
                </td>
                <td className="px-4 py-3 text-right hidden lg:table-cell">
                  <span className="text-[11px] text-slate-400 tabular-nums">{fmtVisited(item.last_visited)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
