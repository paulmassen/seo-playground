'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import ExportCSVButton from '@/components/ExportCSVButton';

interface NonIndexableItem {
  url?: string;
  reason?: string;
}

const REASONS: Record<string, string> = {
  robots_txt: 'Blocked by robots.txt',
  meta_tag: 'noindex meta tag',
  http_header: 'X-Robots-Tag header',
  attribute: 'nofollow / noindex attribute',
  too_many_redirects: 'Too many redirects',
};

function reasonLabel(reason?: string) {
  return reason ? REASONS[reason] ?? reason : '—';
}

type SortKey = 'url' | 'reason';
type SortDir = 'asc' | 'desc';

function sortValue(page: NonIndexableItem, key: SortKey): string {
  return key === 'url' ? page.url?.toLowerCase() ?? '' : reasonLabel(page.reason);
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function NonIndexableTable({ pages }: { pages: NonIndexableItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('reason');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    return [...pages].sort((a, b) => {
      const cmp = sortValue(a, sortKey).localeCompare(sortValue(b, sortKey));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [pages, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
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

  const csvData = sorted.map((page) => ({ url: page.url ?? '', reason: reasonLabel(page.reason) }));
  const columns = [
    { key: 'url', label: 'URL' },
    { key: 'reason', label: 'Reason' },
  ];

  return (
    <div>
      <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
        <CopyMarkdownButton data={csvData} columns={columns} />
        <ExportCSVButton data={csvData} filename="site-audit-non-indexable.csv" columns={columns} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">#</th>
              <Header label="URL" sortK="url" align="left" />
              <Header label="Reason" sortK="reason" align="left" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {sorted.map((page, i) => {
              const path = page.url ? (() => { try { return new URL(page.url).pathname; } catch { return page.url; } })() : '—';
              return (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 text-[11px] font-mono text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3 max-w-[280px]">
                    <a href={page.url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-mono text-blue-600 hover:underline truncate block">{path}</a>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">{reasonLabel(page.reason)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
