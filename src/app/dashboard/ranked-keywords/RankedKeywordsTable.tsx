'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { RankedKwItem } from './page';

type SortKey = 'position' | 'keyword' | 'volume' | 'kd' | 'intent' | 'cpc';
type SortDir = 'asc' | 'desc';

function DifficultyBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-slate-300">—</span>;
  const color =
    value >= 70 ? 'text-red-600 bg-red-50' :
    value >= 40 ? 'text-amber-600 bg-amber-50' :
    'text-emerald-600 bg-emerald-50';
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-black tabular-nums ${color}`}>{value}</span>;
}

function IntentBadge({ value }: { value?: string }) {
  if (!value) return <span className="text-slate-300">—</span>;
  const map: Record<string, string> = {
    informational: 'text-blue-600 bg-blue-50',
    navigational: 'text-violet-600 bg-violet-50',
    transactional: 'text-emerald-600 bg-emerald-50',
    commercial: 'text-amber-600 bg-amber-50',
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${map[value] ?? 'text-slate-500 bg-slate-100'}`}>
      {value.slice(0, 4)}
    </span>
  );
}

function PositionBadge({ pos }: { pos?: number }) {
  if (!pos) return <span className="text-slate-300">—</span>;
  const color =
    pos <= 3 ? 'bg-emerald-500 text-white' :
    pos <= 10 ? 'bg-blue-500 text-white' :
    pos <= 20 ? 'bg-slate-700 text-white' :
    'bg-slate-100 text-slate-500';
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-black ${color}`}>
      {pos}
    </span>
  );
}

function sortValue(item: RankedKwItem, key: SortKey): number | string {
  switch (key) {
    case 'position': return item.ranked_serp_element?.serp_item?.rank_group ?? Number.MAX_SAFE_INTEGER;
    case 'keyword': return item.keyword_data?.keyword?.toLowerCase() ?? '';
    case 'volume': return item.keyword_data?.keyword_info?.search_volume ?? -1;
    case 'kd': return item.keyword_data?.keyword_properties?.keyword_difficulty ?? -1;
    case 'intent': return item.keyword_data?.search_intent_info?.main_intent ?? '';
    case 'cpc': return item.keyword_data?.keyword_info?.cpc ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function RankedKeywordsTable({ items }: { items: RankedKwItem[] }) {
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
    else { setSortKey(key); setSortDir(key === 'position' ? 'asc' : 'desc'); }
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
            <Header label="Pos." sortK="position" align="center" className="w-12" />
            <Header label="Keyword" sortK="keyword" align="left" />
            <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hidden lg:table-cell">URL</th>
            <Header label="Vol." sortK="volume" align="right" />
            <Header label="KD" sortK="kd" align="center" />
            <Header label="Intent" sortK="intent" align="center" className="hidden sm:table-cell" />
            <Header label="CPC" sortK="cpc" align="right" className="hidden md:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map((item, i) => {
            const kw = item.keyword_data;
            const serp = item.ranked_serp_element?.serp_item;
            const pos = serp?.rank_group;
            const url = serp?.url ?? '';
            let urlDisplay = '';
            try {
              const u = new URL(url);
              urlDisplay = u.pathname === '/' ? u.hostname : u.pathname;
            } catch { urlDisplay = url; }

            return (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3 text-center">
                  <PositionBadge pos={pos} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 dark:text-white">{kw?.keyword ?? '—'}</span>
                    {serp?.is_featured_snippet && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded shrink-0">featured</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] font-mono text-slate-400 hover:text-blue-600 truncate max-w-[200px] block transition-colors">
                      {urlDisplay}
                    </a>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                  {kw?.keyword_info?.search_volume?.toLocaleString('en-GB') ?? '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <DifficultyBadge value={kw?.keyword_properties?.keyword_difficulty} />
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <IntentBadge value={kw?.search_intent_info?.main_intent} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums hidden md:table-cell">
                  {kw?.keyword_info?.cpc != null ? `$${kw.keyword_info.cpc.toFixed(2)}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
