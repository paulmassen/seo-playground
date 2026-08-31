'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { KwOverviewItem } from './page';

type SortKey = 'keyword' | 'volume' | 'kd' | 'intent' | 'competition' | 'cpc';
type SortDir = 'asc' | 'desc';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const COMPETITION_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function DifficultyBar({ value }: { value?: number }) {
  if (value === undefined) return <span className="text-slate-300">—</span>;
  const color = value >= 70 ? 'bg-red-500' : value >= 40 ? 'bg-amber-400' : 'bg-emerald-400';
  const textColor = value >= 70 ? 'text-red-600' : value >= 40 ? 'text-amber-600' : 'text-emerald-600';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-[11px] font-black tabular-nums ${textColor}`}>{value}</span>
    </div>
  );
}

function IntentBadge({ value }: { value?: string }) {
  if (!value) return <span className="text-slate-300">—</span>;
  const map: Record<string, string> = {
    informational: 'text-blue-600 bg-blue-50 border-blue-100',
    navigational: 'text-violet-600 bg-violet-50 border-violet-100',
    transactional: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    commercial: 'text-amber-600 bg-amber-50 border-amber-100',
  };
  const labels: Record<string, string> = {
    informational: 'Info',
    navigational: 'Nav',
    transactional: 'Transac',
    commercial: 'Commercial',
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${map[value] ?? 'text-slate-500 bg-slate-100 border-slate-200'}`}>
      {labels[value] ?? value}
    </span>
  );
}

function CompetitionBadge({ level }: { level?: string }) {
  if (!level) return <span className="text-slate-300">—</span>;
  const map: Record<string, string> = {
    HIGH: 'text-red-600 bg-red-50',
    MEDIUM: 'text-amber-600 bg-amber-50',
    LOW: 'text-emerald-600 bg-emerald-50',
  };
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${map[level] ?? 'text-slate-500 bg-slate-100'}`}>{level}</span>;
}

interface MonthlySearch { year: number; month: number; search_volume: number }

function Sparkline({ monthly }: { monthly?: MonthlySearch[] }) {
  const data = monthly?.slice(-12) ?? [];
  if (data.length === 0) return <span className="text-slate-300 text-xs">—</span>;
  const max = Math.max(...data.map((m) => m.search_volume ?? 0), 1);
  return (
    <div className="flex items-end gap-0.5 h-7" title={data.map((m) => `${MONTHS[m.month - 1]}: ${m.search_volume?.toLocaleString('en-GB')}`).join(' · ')}>
      {data.map((m, i) => (
        <div
          key={i}
          className="w-2 bg-blue-400 rounded-sm hover:bg-blue-600 transition-colors"
          style={{ height: `${Math.max(2, Math.round(((m.search_volume ?? 0) / max) * 28))}px` }}
        />
      ))}
    </div>
  );
}

function sortValue(item: KwOverviewItem, key: SortKey): number | string {
  switch (key) {
    case 'keyword': return item.keyword?.toLowerCase() ?? '';
    case 'volume': return item.keyword_info?.search_volume ?? -1;
    case 'kd': return item.keyword_properties?.keyword_difficulty ?? -1;
    case 'intent': return item.search_intent_info?.main_intent ?? '';
    case 'competition': return item.keyword_info?.competition_level ? COMPETITION_RANK[item.keyword_info.competition_level] ?? -1 : -1;
    case 'cpc': return item.keyword_info?.cpc ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function KeywordOverviewTable({ items }: { items: KwOverviewItem[] }) {
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
            <Header label="Keyword" sortK="keyword" align="left" className="!px-6" />
            <Header label="Vol." sortK="volume" align="right" />
            <Header label="Difficulty KD" sortK="kd" align="left" />
            <Header label="Intent" sortK="intent" align="center" />
            <Header label="Competition" sortK="competition" align="center" className="hidden sm:table-cell" />
            <Header label="CPC" sortK="cpc" align="right" className="hidden md:table-cell" />
            <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hidden xl:table-cell">Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map((item, i) => (
            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <td className="px-6 py-3 font-medium text-slate-900 dark:text-white max-w-xs">{item.keyword ?? '—'}</td>
              <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                {item.keyword_info?.search_volume?.toLocaleString('en-GB') ?? '—'}
              </td>
              <td className="px-4 py-3">
                <DifficultyBar value={item.keyword_properties?.keyword_difficulty} />
              </td>
              <td className="px-4 py-3 text-center">
                <IntentBadge value={item.search_intent_info?.main_intent} />
              </td>
              <td className="px-4 py-3 text-center hidden sm:table-cell">
                <CompetitionBadge level={item.keyword_info?.competition_level} />
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden md:table-cell">
                {item.keyword_info?.cpc != null ? `$${item.keyword_info.cpc.toFixed(2)}` : '—'}
              </td>
              <td className="px-4 py-3 hidden xl:table-cell">
                <Sparkline monthly={item.keyword_info?.monthly_searches} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
