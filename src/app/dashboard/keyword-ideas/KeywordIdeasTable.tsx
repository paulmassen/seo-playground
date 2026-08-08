'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface IdeaItem {
  keyword?: string;
  keyword_info?: { search_volume?: number; cpc?: number; competition?: number; competition_level?: string };
  keyword_properties?: { keyword_difficulty?: number };
  search_intent_info?: { main_intent?: string };
  avg_backlinks_info?: { referring_domains?: number };
}

type SortKey = 'keyword' | 'kd' | 'volume' | 'cpc' | 'intent' | 'competition' | 'ref_domains';
type SortDir = 'asc' | 'desc';

function KdBadge({ v }: { v?: number }) {
  if (v == null) return <span className="text-slate-300 text-xs">—</span>;
  const cls = v >= 70 ? 'bg-red-100 text-red-700' : v >= 50 ? 'bg-orange-100 text-orange-700' : v >= 30 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
  return <span className={`inline-flex items-center justify-center w-9 h-5 rounded text-[10px] font-black ${cls}`}>{v}</span>;
}

function IntentBadge({ intent }: { intent?: string }) {
  if (!intent) return null;
  const map: Record<string, string> = { informational: 'bg-blue-50 text-blue-600', navigational: 'bg-violet-50 text-violet-600', commercial: 'bg-amber-50 text-amber-700', transactional: 'bg-emerald-50 text-emerald-700' };
  return <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${map[intent] ?? 'bg-slate-100 text-slate-500'}`}>{intent.slice(0, 4)}</span>;
}

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }

function sortValue(item: IdeaItem, key: SortKey): number | string {
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

export default function KeywordIdeasTable({ items }: { items: IdeaItem[] }) {
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
            <Header label="KD" sortK="kd" align="center" />
            <Header label="Volume" sortK="volume" align="right" />
            <Header label="CPC" sortK="cpc" align="right" />
            <Header label="Intent" sortK="intent" align="center" className="hidden sm:table-cell" />
            <Header label="Competition" sortK="competition" align="right" className="hidden md:table-cell" />
            <Header label="Ref. Domains" sortK="ref_domains" align="right" className="hidden lg:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map((item, i) => {
            const ki = item.keyword_info;
            return (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-200 max-w-[220px]"><span className="truncate block">{item.keyword ?? '—'}</span></td>
                <td className="px-4 py-3 text-center"><KdBadge v={item.keyword_properties?.keyword_difficulty} /></td>
                <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">{fmt(ki?.search_volume)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">{ki?.cpc != null ? `$${ki.cpc.toFixed(2)}` : '—'}</td>
                <td className="px-4 py-3 text-center hidden sm:table-cell"><IntentBadge intent={item.search_intent_info?.main_intent} /></td>
                <td className="px-4 py-3 text-right text-slate-500 tabular-nums hidden md:table-cell text-xs">{ki?.competition_level ?? '—'}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden lg:table-cell">{fmt(item.avg_backlinks_info?.referring_domains)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
