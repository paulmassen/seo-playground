'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';

interface DifficultyItem {
  keyword?: string;
  keyword_difficulty?: number;
  avg_backlinks_info?: {
    referring_domains?: number;
    referring_pages?: number;
  };
  serp_info?: {
    se_results_count?: number;
    last_updated_time?: string;
  };
  keyword_info?: {
    search_volume?: number;
    cpc?: number;
    competition?: number;
  };
}

type SortKey = 'keyword' | 'difficulty' | 'volume' | 'cpc' | 'ref_domains' | 'results';
type SortDir = 'asc' | 'desc';

function DifficultyBar({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-slate-300">—</span>;
  const color = value >= 70 ? 'bg-red-500'
    : value >= 50 ? 'bg-orange-400'
    : value >= 30 ? 'bg-amber-400'
    : 'bg-emerald-400';
  const textColor = value >= 70 ? 'text-red-600'
    : value >= 50 ? 'text-orange-600'
    : value >= 30 ? 'text-amber-600'
    : 'text-emerald-600';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs font-black tabular-nums ${textColor}`}>{value}</span>
    </div>
  );
}

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString("en-GB");
}

function sortValue(item: DifficultyItem, key: SortKey): number | string {
  switch (key) {
    case 'keyword': return item.keyword?.toLowerCase() ?? '';
    case 'difficulty': return item.keyword_difficulty ?? -1;
    case 'volume': return item.keyword_info?.search_volume ?? -1;
    case 'cpc': return item.keyword_info?.cpc ?? -1;
    case 'ref_domains': return item.avg_backlinks_info?.referring_domains ?? -1;
    case 'results': return item.serp_info?.se_results_count ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function KeywordDifficultyTable({ items }: { items: DifficultyItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('difficulty');
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
    keyword: item.keyword ?? '',
    difficulty: item.keyword_difficulty ?? '',
    volume: item.keyword_info?.search_volume ?? '',
    cpc: item.keyword_info?.cpc != null ? item.keyword_info.cpc.toFixed(2) : '',
    ref_domains: item.avg_backlinks_info?.referring_domains ?? '',
    results: item.serp_info?.se_results_count ?? '',
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end px-6 pt-4">
        <CopyMarkdownButton
          data={csvData}
          columns={[
            { key: 'keyword', label: 'Keyword' },
            { key: 'difficulty', label: 'Difficulty' },
            { key: 'volume', label: 'Volume' },
            { key: 'cpc', label: 'CPC' },
            { key: 'ref_domains', label: 'Ref. Domains' },
            { key: 'results', label: 'Results' },
          ]}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <Header label="Keyword" sortK="keyword" align="left" className="!px-6" />
              <Header label="Difficulty" sortK="difficulty" align="left" />
              <Header label="Vol." sortK="volume" align="right" />
              <Header label="CPC" sortK="cpc" align="right" />
              <Header label="Ref. domains" sortK="ref_domains" align="right" className="hidden md:table-cell" />
              <Header label="Results" sortK="results" align="right" className="hidden lg:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {sorted.map((item, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-3 font-medium text-slate-900 dark:text-white max-w-xs">
                  {item.keyword ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <DifficultyBar value={item.keyword_difficulty} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                  {fmt(item.keyword_info?.search_volume)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">
                  {item.keyword_info?.cpc != null ? `$${item.keyword_info.cpc.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden md:table-cell">
                  {fmt(item.avg_backlinks_info?.referring_domains)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden lg:table-cell">
                  {item.serp_info?.se_results_count != null
                    ? item.serp_info.se_results_count.toLocaleString("en-GB")
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
