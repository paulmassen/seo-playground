'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export interface PageIntItem {
  url_from?: string;
  domain_from?: string;
  page_from_rank?: number;
  backlinks_spam_score?: number;
  url_to?: string[];
}

type SortKey = 'url_from' | 'page_from_rank' | 'spam' | 'targets_linked';
type SortDir = 'asc' | 'desc';

function RankBadge({ rank }: { rank?: number }) {
  if (rank == null) return <span className="text-slate-300 text-xs">—</span>;
  const cls = rank >= 70 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : rank >= 40 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200';
  return <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border tabular-nums ${cls}`}>DR {rank}</span>;
}

function SpamBadge({ score }: { score?: number }) {
  if (score == null) return <span className="text-slate-300">—</span>;
  const cls = score >= 60 ? 'bg-red-50 text-red-600 border-red-200' : score >= 30 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border tabular-nums ${cls}`}>{score}</span>;
}

function sortValue(item: PageIntItem, key: SortKey): number | string {
  switch (key) {
    case 'url_from': return item.url_from?.toLowerCase() ?? '';
    case 'page_from_rank': return item.page_from_rank ?? -1;
    case 'spam': return item.backlinks_spam_score ?? -1;
    case 'targets_linked': return item.url_to?.length ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function PageIntersectionTable({ items }: { items: PageIntItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('page_from_rank');
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

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'center' | 'right'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? ''}`}
          onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''} ${align === 'center' ? 'justify-center' : ''}`}>
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
            <Header label="From URL" sortK="url_from" align="left" className="!px-6" />
            <Header label="DR" sortK="page_from_rank" align="center" />
            <Header label="Spam" sortK="spam" align="center" className="hidden sm:table-cell" />
            <Header label="Targets linked" sortK="targets_linked" align="right" className="hidden md:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map((item, i) => (
            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <td className="px-6 py-3 max-w-[320px]">
                <a href={item.url_from} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] font-mono text-blue-600 hover:underline truncate block">{item.url_from ?? '—'}</a>
                <span className="text-[10px] text-slate-400">{item.domain_from}</span>
              </td>
              <td className="px-4 py-3 text-center"><RankBadge rank={item.page_from_rank} /></td>
              <td className="px-4 py-3 text-center hidden sm:table-cell"><SpamBadge score={item.backlinks_spam_score} /></td>
              <td className="px-4 py-3 text-right text-slate-500 tabular-nums hidden md:table-cell text-xs font-mono">{item.url_to?.length ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
