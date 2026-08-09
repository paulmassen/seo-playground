'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface RelatedKeywordItem {
  keyword_data?: {
    keyword?: string;
    search_volume?: number;
    cpc?: number;
    competition?: number;
    competition_index?: number;
    monthly_searches?: { year: number; month: number; search_volume: number }[];
  };
  related_keywords?: string[];
  keyword_difficulty?: number;
  avg_backlinks_info?: {
    referring_domains?: number;
  };
}

type SortKey = 'keyword' | 'kd' | 'volume' | 'cpc' | 'competition' | 'ref_domains' | 'related';
type SortDir = 'asc' | 'desc';

function DifficultyBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-slate-300 text-xs">—</span>;
  const color = value >= 70 ? 'bg-red-100 text-red-700'
    : value >= 50 ? 'bg-orange-100 text-orange-700'
    : value >= 30 ? 'bg-amber-100 text-amber-700'
    : 'bg-emerald-100 text-emerald-700';
  return <span className={`inline-flex items-center justify-center w-9 h-5 rounded text-[10px] font-black ${color}`}>{value}</span>;
}

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-GB');
}

function sortValue(item: RelatedKeywordItem, key: SortKey): number | string {
  switch (key) {
    case 'keyword': return item.keyword_data?.keyword?.toLowerCase() ?? '';
    case 'kd': return item.keyword_difficulty ?? -1;
    case 'volume': return item.keyword_data?.search_volume ?? -1;
    case 'cpc': return item.keyword_data?.cpc ?? -1;
    case 'competition': return item.keyword_data?.competition_index ?? -1;
    case 'ref_domains': return item.avg_backlinks_info?.referring_domains ?? -1;
    case 'related': return item.related_keywords?.length ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function RelatedKeywordsTable({ items }: { items: RelatedKeywordItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    if (!sortKey) return items;
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
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? ''}`}
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
          <tr className="border-b border-slate-100 bg-slate-50">
            <Header label="Keyword" sortK="keyword" align="left" className="!px-6" />
            <Header label="KD" sortK="kd" align="center" />
            <Header label="Vol." sortK="volume" align="right" />
            <Header label="CPC" sortK="cpc" align="right" />
            <Header label="Comp." sortK="competition" align="right" className="hidden sm:table-cell" />
            <Header label="Ref. domains" sortK="ref_domains" align="right" className="hidden md:table-cell" />
            <Header label="Related" sortK="related" align="right" className="hidden lg:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {sorted.map((item, i) => {
            const kd = item.keyword_data;
            return (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-3 font-medium text-slate-900 max-w-[200px]">
                  <span className="truncate block">{kd?.keyword ?? '—'}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <DifficultyBadge value={item.keyword_difficulty} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                  {fmt(kd?.search_volume)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">
                  {kd?.cpc != null ? `$${kd.cpc.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden sm:table-cell">
                  {kd?.competition_index ?? '—'}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden md:table-cell">
                  {fmt(item.avg_backlinks_info?.referring_domains)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">
                  {item.related_keywords && item.related_keywords.length > 0 ? (
                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {item.related_keywords.length}
                    </span>
                  ) : (
                    <span className="text-slate-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
