'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface MonthlySearch {
  year: number;
  month: number;
  search_volume: number;
}

interface TopSearchItem {
  keyword: string;
  keyword_info?: {
    search_volume?: number;
    cpc?: number;
    competition?: number;
    competition_level?: string;
    monthly_searches?: MonthlySearch[];
  };
  keyword_properties?: {
    keyword_difficulty?: number;
    word_count?: number;
    detected_language?: string;
  };
  search_intent_info?: {
    main_intent?: string;
  };
  avg_backlinks_info?: {
    referring_domains?: number;
  };
}

type SortKey = 'keyword' | 'kd' | 'volume' | 'cpc' | 'intent' | 'competition' | 'ref_domains';
type SortDir = 'asc' | 'desc';

function DifficultyBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-slate-300 text-xs">—</span>;
  const color = value >= 70 ? 'bg-red-100 text-red-700'
    : value >= 50 ? 'bg-orange-100 text-orange-700'
    : value >= 30 ? 'bg-amber-100 text-amber-700'
    : 'bg-emerald-100 text-emerald-700';
  return <span className={`inline-flex items-center justify-center w-9 h-5 rounded text-[10px] font-black ${color}`}>{value}</span>;
}

function IntentBadge({ intent }: { intent?: string }) {
  if (!intent) return <span className="text-slate-300 text-xs">—</span>;
  const map: Record<string, string> = {
    informational: 'bg-blue-50 text-blue-600',
    navigational: 'bg-purple-50 text-purple-600',
    commercial: 'bg-amber-50 text-amber-700',
    transactional: 'bg-emerald-50 text-emerald-700',
  };
  const cls = map[intent] ?? 'bg-slate-100 text-slate-500';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide ${cls}`}>{intent.slice(0, 5)}</span>;
}

function TrendSparkline({ monthly }: { monthly?: MonthlySearch[] }) {
  if (!monthly || monthly.length === 0) return <span className="text-slate-300 text-xs">—</span>;
  const sorted = [...monthly].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  const values = sorted.map((m) => m.search_volume);
  const max = Math.max(...values, 1);
  const w = 60, h = 20;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('en-GB');
}

function sortValue(item: TopSearchItem, key: SortKey): number | string {
  switch (key) {
    case 'keyword': return item.keyword?.toLowerCase() ?? '';
    case 'kd': return item.keyword_properties?.keyword_difficulty ?? -1;
    case 'volume': return item.keyword_info?.search_volume ?? -1;
    case 'cpc': return item.keyword_info?.cpc ?? -1;
    case 'intent': return item.search_intent_info?.main_intent ?? '';
    case 'competition': return item.keyword_info?.competition ?? -1;
    case 'ref_domains': return item.avg_backlinks_info?.referring_domains ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function TopSearchesTable({ items }: { items: TopSearchItem[] }) {
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
            <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">#</th>
            <Header label="Keyword" sortK="keyword" align="left" />
            <Header label="KD" sortK="kd" align="center" />
            <Header label="Vol." sortK="volume" align="right" />
            <Header label="CPC" sortK="cpc" align="right" />
            <Header label="Intent" sortK="intent" align="center" className="hidden sm:table-cell" />
            <Header label="Comp." sortK="competition" align="center" className="hidden md:table-cell" />
            <Header label="Ref. Dom." sortK="ref_domains" align="right" className="hidden lg:table-cell" />
            <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden xl:table-cell">Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map((item, i) => {
            const ki = item.keyword_info;
            const kp = item.keyword_properties;
            const compLevel = ki?.competition_level;
            const compColor = compLevel === 'HIGH' ? 'text-red-500 bg-red-50 dark:bg-red-950'
              : compLevel === 'MEDIUM' ? 'text-amber-600 bg-amber-50 dark:bg-amber-950'
              : compLevel === 'LOW' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950'
              : 'text-slate-400 bg-slate-100 dark:bg-slate-800';
            return (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-3 text-[11px] font-mono text-slate-400 tabular-nums">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-[220px]">
                  <span className="truncate block">{item.keyword}</span>
                  {kp?.word_count !== undefined && (
                    <span className="text-[10px] text-slate-400">{kp.word_count} word{kp.word_count !== 1 ? 's' : ''}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <DifficultyBadge value={kp?.keyword_difficulty} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                  {fmt(ki?.search_volume)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">
                  {ki?.cpc != null ? `$${ki.cpc.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <IntentBadge intent={item.search_intent_info?.main_intent} />
                </td>
                <td className="px-4 py-3 text-center hidden md:table-cell">
                  {compLevel ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black ${compColor}`}>
                      {compLevel}
                    </span>
                  ) : <span className="text-slate-300 text-xs">—</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden lg:table-cell">
                  {fmt(item.avg_backlinks_info?.referring_domains)}
                </td>
                <td className="px-4 py-3 text-right hidden xl:table-cell">
                  <TrendSparkline monthly={ki?.monthly_searches} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
