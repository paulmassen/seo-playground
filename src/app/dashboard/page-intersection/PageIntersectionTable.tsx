'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface RankedItem { url?: string; rank_absolute?: number; }
interface IntersectionItem {
  keyword_data?: { keyword?: string; keyword_info?: { search_volume?: number; cpc?: number } };
  ranked_serp_element?: { items?: RankedItem[] };
  keyword_difficulty?: number;
}

type SortKey = 'keyword' | 'kd' | 'volume' | number; // number = page index

type SortDir = 'asc' | 'desc';

function KdBadge({ v }: { v?: number }) {
  if (v == null) return <span className="text-slate-300 text-xs">—</span>;
  const cls = v >= 70 ? 'bg-red-100 text-red-700' : v >= 50 ? 'bg-orange-100 text-orange-700' : v >= 30 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
  return <span className={`inline-flex items-center justify-center w-9 h-5 rounded text-[10px] font-black ${cls}`}>{v}</span>;
}

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }

function RankBadge({ rank }: { rank?: number }) {
  if (rank == null) return <span className="text-slate-300">—</span>;
  const cls = rank <= 3 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : rank <= 10 ? 'bg-blue-50 text-blue-700 border-blue-200' : rank <= 30 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200';
  return <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${cls}`}>#{rank}</span>;
}

function sortValue(item: IntersectionItem, key: SortKey): number | string {
  if (typeof key === 'number') return item.ranked_serp_element?.items?.[key]?.rank_absolute ?? Number.MAX_SAFE_INTEGER;
  switch (key) {
    case 'keyword': return item.keyword_data?.keyword?.toLowerCase() ?? '';
    case 'kd': return item.keyword_difficulty ?? -1;
    case 'volume': return item.keyword_data?.keyword_info?.search_volume ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function PageIntersectionTable({ items, pageList }: { items: IntersectionItem[]; pageList: string[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    if (sortKey === null) return items;
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
    else { setSortKey(key); setSortDir(typeof key === 'number' ? 'asc' : 'desc'); }
  }

  function Header({ label, sortK, align, className, title }: { label: string; sortK: SortKey; align: 'left' | 'center' | 'right'; className?: string; title?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? ''}`}
          title={title} onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center justify-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
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
            <Header label="Keyword" sortK="keyword" align="left" className="!px-6" />
            <Header label="KD" sortK="kd" align="center" />
            <Header label="Volume" sortK="volume" align="right" />
            {pageList.map((p, i) => (
              <Header key={i} label={`Page ${i + 1}`} sortK={i} align="center" className="max-w-[100px]" title={p} />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map((item, i) => {
            const ranked = item.ranked_serp_element?.items ?? [];
            return (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-200 max-w-[200px]"><span className="truncate block">{item.keyword_data?.keyword ?? '—'}</span></td>
                <td className="px-4 py-3 text-center"><KdBadge v={item.keyword_difficulty} /></td>
                <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">{fmt(item.keyword_data?.keyword_info?.search_volume)}</td>
                {pageList.map((_, pi) => (
                  <td key={pi} className="px-4 py-3 text-center"><RankBadge rank={ranked[pi]?.rank_absolute} /></td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
