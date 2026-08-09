'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import ExportCSVButton from '@/components/ExportCSVButton';
import type { LeaderboardItem } from './page';

type SortKey = 'name' | 'mentions' | 'volume';
type SortDir = 'asc' | 'desc';

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }

function sortValue(item: LeaderboardItem, key: SortKey, nameOf: (i: LeaderboardItem) => string): number | string {
  switch (key) {
    case 'name': return nameOf(item).toLowerCase();
    case 'mentions': return item.total?.mentions ?? -1;
    case 'volume': return item.total?.ai_search_volume ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-violet-600" /> : <ArrowDown className="w-3 h-3 text-violet-600" />;
}

function LeaderboardTable({
  title, items, nameLabel, nameOf, filenamePrefix,
}: {
  title: string;
  items: LeaderboardItem[];
  nameLabel: string;
  nameOf: (i: LeaderboardItem) => string;
  filenamePrefix: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('mentions');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const va = sortValue(a, sortKey, nameOf);
      const vb = sortValue(b, sortKey, nameOf);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortKey, sortDir, nameOf]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function Header({ label, sortK, align }: { label: string; sortK: SortKey; align: 'left' | 'right' }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left !px-6' : 'text-right'}`}
        onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((item) => ({
    [nameLabel.toLowerCase()]: nameOf(item),
    mentions: item.total?.mentions ?? '',
    ai_search_volume: item.total?.ai_search_volume ?? '',
  }));
  const columns = [
    { key: nameLabel.toLowerCase(), label: nameLabel },
    { key: 'mentions', label: 'Mentions' },
    { key: 'ai_search_volume', label: 'AI Search Volume' },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">{title}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-slate-400">{items.length}</span>
          {items.length > 0 && (
            <>
              <CopyMarkdownButton data={csvData} columns={columns} />
              <ExportCSVButton data={csvData} filename={`${filenamePrefix}.csv`} columns={columns} />
            </>
          )}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-slate-400">No results found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <Header label={nameLabel} sortK="name" align="left" />
                <Header label="Mentions" sortK="mentions" align="right" />
                <Header label="AI Search Volume" sortK="volume" align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {sorted.map((item, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-200 max-w-[240px]">
                    <span className="truncate block">{nameOf(item)}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">{fmt(item.total?.mentions)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">{fmt(item.total?.ai_search_volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function LeaderboardTables({ domains, brands, topic }: { domains: LeaderboardItem[]; brands: LeaderboardItem[]; topic: string }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <LeaderboardTable
        title="Top Mentioned Domains"
        items={domains}
        nameLabel="Domain"
        nameOf={(i) => i.domain ?? '—'}
        filenamePrefix={`ai-visibility-domains-${topic}`}
      />
      <LeaderboardTable
        title="Top Mentioned Brands"
        items={brands}
        nameLabel="Brand"
        nameOf={(i) => i.brand ?? '—'}
        filenamePrefix={`ai-visibility-brands-${topic}`}
      />
    </div>
  );
}
