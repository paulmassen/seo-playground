'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface MonthlyAiSearch {
  year: number;
  month: number;
  ai_search_volume: number;
}

interface AiKeywordItem {
  keyword?: string;
  ai_search_volume?: number;
  ai_monthly_searches?: MonthlyAiSearch[];
}

type SortKey = 'keyword' | 'volume';
type SortDir = 'asc' | 'desc';

function Sparkline({ monthly }: { monthly?: MonthlyAiSearch[] }) {
  const data = [...(monthly ?? [])].reverse().slice(-12);
  if (data.length === 0) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const max = Math.max(...data.map((m) => m.ai_search_volume ?? 0), 1);
  return (
    <div className="flex items-end gap-0.5 h-6"
      title={data.map((m) => `${m.month}/${m.year}: ${m.ai_search_volume?.toLocaleString('en-GB')}`).join(' · ')}>
      {data.map((m, i) => (
        <div
          key={i}
          className="w-1.5 bg-violet-300 dark:bg-violet-500 rounded-sm"
          style={{ height: `${Math.max(2, Math.round(((m.ai_search_volume ?? 0) / max) * 24))}px` }}
        />
      ))}
    </div>
  );
}

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-GB');
}

function sortValue(item: AiKeywordItem, key: SortKey): number | string {
  switch (key) {
    case 'keyword': return item.keyword?.toLowerCase() ?? '';
    case 'volume': return item.ai_search_volume ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function AiKeywordDataTable({ items }: { items: AiKeywordItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('volume');
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
            <Header label="Keyword" sortK="keyword" align="left" />
            <Header label="AI volume" sortK="volume" align="right" />
            <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">12mo trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map((item, i) => (
            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
              <td className="px-6 py-3 font-medium text-slate-900 dark:text-white max-w-xs">{item.keyword ?? '—'}</td>
              <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                {fmt(item.ai_search_volume)}
              </td>
              <td className="px-4 py-3">
                <Sparkline monthly={item.ai_monthly_searches} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
