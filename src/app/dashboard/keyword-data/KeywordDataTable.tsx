'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';

interface KeywordItem {
  keyword?: string;
  search_volume?: number;
  competition?: string | number;
  competition_index?: number;
  cpc?: number;
  low_top_of_page_bid?: number;
  high_top_of_page_bid?: number;
  monthly_searches?: { year: number; month: number; search_volume: number }[];
}

type SortKey = 'keyword' | 'volume' | 'competition' | 'index' | 'cpc' | 'bid_low' | 'bid_high';
type SortDir = 'asc' | 'desc';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function CompetitionBadge({ value }: { value?: string | number }) {
  if (value === undefined || value === null) return <span className="text-slate-300">—</span>;
  const label = typeof value === 'string' ? value : value > 0.66 ? 'HIGH' : value > 0.33 ? 'MEDIUM' : 'LOW';
  const color = label === 'HIGH' ? 'text-red-500 bg-red-50' : label === 'MEDIUM' ? 'text-amber-500 bg-amber-50' : 'text-emerald-600 bg-emerald-50';
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${color}`}>{label}</span>;
}

function competitionSortValue(value?: string | number): number {
  if (value === undefined || value === null) return -1;
  if (typeof value === 'number') return value;
  return value === 'HIGH' ? 2 : value === 'MEDIUM' ? 1 : 0;
}

function sortValue(item: KeywordItem, key: SortKey): number | string {
  switch (key) {
    case 'keyword': return item.keyword?.toLowerCase() ?? '';
    case 'volume': return item.search_volume ?? -1;
    case 'competition': return competitionSortValue(item.competition);
    case 'index': return item.competition_index ?? -1;
    case 'cpc': return item.cpc ?? -1;
    case 'bid_low': return item.low_top_of_page_bid ?? -1;
    case 'bid_high': return item.high_top_of_page_bid ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function KeywordDataTable({ items }: { items: KeywordItem[] }) {
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
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : align === 'center' ? 'justify-center' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((item) => ({
    keyword: item.keyword ?? '',
    volume: item.search_volume ?? '',
    competition: typeof item.competition === 'number' ? item.competition : (item.competition ?? ''),
    index: item.competition_index ?? '',
    cpc: item.cpc != null ? item.cpc.toFixed(2) : '',
    bid_low: item.low_top_of_page_bid != null ? item.low_top_of_page_bid.toFixed(2) : '',
    bid_high: item.high_top_of_page_bid != null ? item.high_top_of_page_bid.toFixed(2) : '',
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end px-6 pt-4">
        <CopyMarkdownButton
          data={csvData}
          columns={[
            { key: 'keyword', label: 'Keyword' },
            { key: 'volume', label: 'Volume' },
            { key: 'competition', label: 'Competition' },
            { key: 'index', label: 'Index' },
            { key: 'cpc', label: 'CPC' },
            { key: 'bid_low', label: 'Bid Low' },
            { key: 'bid_high', label: 'Bid High' },
          ]}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <Header label="Keyword" sortK="keyword" align="left" className="!px-6" />
              <Header label="Vol." sortK="volume" align="right" />
              <Header label="Competition" sortK="competition" align="center" />
              <Header label="Index" sortK="index" align="right" />
              <Header label="CPC" sortK="cpc" align="right" />
              <Header label="Bid Low" sortK="bid_low" align="right" />
              <Header label="Bid High" sortK="bid_high" align="right" />
              <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hidden xl:table-cell">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {sorted.map((item, i) => {
              const monthly = item.monthly_searches?.slice(-12) ?? [];
              const maxVol = Math.max(...monthly.map((m) => m.search_volume ?? 0), 1);
              return (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-900 max-w-xs">{item.keyword ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">{item.search_volume?.toLocaleString("en-GB") ?? '—'}</td>
                  <td className="px-4 py-3 text-center"><CompetitionBadge value={item.competition} /></td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">{item.competition_index ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">{item.cpc != null ? `$${item.cpc.toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">{item.low_top_of_page_bid != null ? `$${item.low_top_of_page_bid.toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">{item.high_top_of_page_bid != null ? `$${item.high_top_of_page_bid.toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    {monthly.length > 0 ? (
                      <div className="flex items-end gap-0.5 h-7">
                        {monthly.map((m, j) => (
                          <div key={j} title={`${MONTHS[m.month - 1]} ${m.year}: ${m.search_volume?.toLocaleString("en-GB")}`}
                            className="w-2.5 bg-blue-400 rounded-sm hover:bg-blue-600 transition-colors"
                            style={{ height: `${Math.max(2, Math.round(((m.search_volume ?? 0) / maxVol) * 28))}px` }} />
                        ))}
                      </div>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
