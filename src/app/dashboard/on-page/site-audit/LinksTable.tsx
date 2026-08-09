'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import ExportCSVButton from '@/components/ExportCSVButton';

interface LinkItem {
  link_from?: string;
  link_to?: string;
  domain_from?: string;
  domain_to?: string;
  type?: string;
  is_broken?: boolean;
  is_nofollowed?: boolean;
  anchor?: string;
  direction?: 'internal' | 'external';
}

type SortKey = 'from' | 'to' | 'type' | 'status' | 'anchor';
type SortDir = 'asc' | 'desc';

function pathOf(url?: string) {
  if (!url) return '—';
  try { return new URL(url).pathname; } catch { return url; }
}

function sortValue(item: LinkItem, key: SortKey): number | string {
  switch (key) {
    case 'from': return pathOf(item.link_from).toLowerCase();
    case 'to': return (item.link_to ?? '').toLowerCase();
    case 'type': return item.direction === 'external' ? 1 : 0;
    case 'status': return (item.is_broken ? 2 : 0) + (item.is_nofollowed ? 1 : 0);
    case 'anchor': return (item.anchor ?? '').toLowerCase();
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function LinksTable({ links }: { links: LinkItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...links].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [links, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'center'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left' : 'text-center'} ${className ?? ''}`}
        onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'center' ? 'justify-center w-full' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((link) => ({
    from: link.link_from ?? '',
    to: link.link_to ?? '',
    type: link.direction ?? '',
    broken: link.is_broken ? 'yes' : 'no',
    nofollow: link.is_nofollowed ? 'yes' : 'no',
    anchor: link.anchor ?? '',
  }));
  const columns = [
    { key: 'from', label: 'From' },
    { key: 'to', label: 'To' },
    { key: 'type', label: 'Type' },
    { key: 'broken', label: 'Broken' },
    { key: 'nofollow', label: 'Nofollow' },
    { key: 'anchor', label: 'Anchor' },
  ];

  return (
    <div>
      <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-3 flex-wrap text-[11px] font-bold">
          <span className="text-slate-500">{links.length} links total</span>
          <span className="text-red-500">{links.filter((l) => l.is_broken).length} broken</span>
          <span className="text-slate-400">{links.filter((l) => l.is_nofollowed).length} nofollow</span>
          <span className="text-blue-500">{links.filter((l) => l.direction === 'external').length} external</span>
        </div>
        <div className="flex items-center gap-2">
          <CopyMarkdownButton data={csvData} columns={columns} />
          <ExportCSVButton data={csvData} filename="site-audit-links.csv" columns={columns} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <Header label="From" sortK="from" align="left" />
              <Header label="To" sortK="to" align="left" />
              <Header label="Type" sortK="type" align="center" />
              <Header label="Status" sortK="status" align="center" />
              <Header label="Anchor" sortK="anchor" align="left" className="hidden lg:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {sorted.map((link, i) => {
              const fromPath = pathOf(link.link_from);
              const isExternal = link.direction === 'external';
              return (
                <tr key={i} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${link.is_broken ? 'bg-red-50/40 dark:bg-red-950/20' : ''}`}>
                  <td className="px-4 py-2.5 max-w-[180px]">
                    <span className="font-mono text-slate-600 dark:text-slate-400 truncate block text-[10px]" title={link.link_from}>{fromPath}</span>
                  </td>
                  <td className="px-4 py-2.5 max-w-[200px]">
                    <a href={link.link_to} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-blue-600 hover:underline truncate block text-[10px]" title={link.link_to}>
                      {link.link_to ?? '—'}
                    </a>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${isExternal ? 'bg-violet-50 text-violet-600' : 'bg-slate-100 text-slate-500'}`}>
                      {isExternal ? 'ext' : 'int'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex justify-center gap-1">
                      {link.is_broken && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">broken</span>}
                      {link.is_nofollowed && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">nofollow</span>}
                      {!link.is_broken && !link.is_nofollowed && <span className="text-emerald-500 text-xs">✓</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 hidden lg:table-cell max-w-[160px]">
                    <span className="text-slate-500 truncate block">{link.anchor || <span className="text-slate-300 italic">no anchor</span>}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
