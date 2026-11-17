'use client';

import { METRIC_HINTS } from '@/lib/metric-glossary';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';

import { pagePosition, type PageIntersectionItem } from './items';

export type { PageIntersectionItem };

function kdOf(item: PageIntersectionItem) {
  return item.keyword_data?.keyword_properties?.keyword_difficulty ?? item.keyword_difficulty;
}

type SortKey = 'keyword' | 'kd' | 'volume' | 'cpc' | number; // number = page index
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

function sortValue(item: PageIntersectionItem, key: SortKey): number | string {
  if (typeof key === 'number') return pagePosition(item, key) ?? Number.MAX_SAFE_INTEGER;
  switch (key) {
    case 'keyword': return item.keyword_data?.keyword?.toLowerCase() ?? '';
    case 'kd': return kdOf(item) ?? -1;
    case 'volume': return item.keyword_data?.keyword_info?.search_volume ?? -1;
    case 'cpc': return item.keyword_data?.keyword_info?.cpc ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

function shortUrl(u: string) {
  try { const x = new URL(u.replace(/\*$/, '')); return `${x.hostname.replace(/^www\./, '')}${x.pathname === '/' ? '' : x.pathname}${u.endsWith('*') ? '*' : ''}`; } catch { return u; }
}

export default function PageIntersectionTable({ items, pageList }: { items: PageIntersectionItem[]; pageList: string[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [query, setQuery] = useState('');
  const [top10Only, setTop10Only] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) =>
      (!q || (i.keyword_data?.keyword ?? '').toLowerCase().includes(q))
      && (!top10Only || pageList.some((_, pi) => (pagePosition(i, pi) ?? 999) <= 10)));
  }, [items, query, top10Only, pageList]);

  const sorted = useMemo(() => {
    if (sortKey === null) return filtered;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb))
        : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(typeof key === 'number' || key === 'kd' || key === 'keyword' ? 'asc' : 'desc'); }
  }

  function Header({ label, sortK, align, className, title, hint }: { label: string; sortK: SortKey; align: 'left' | 'center' | 'right'; className?: string; title?: string; hint?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? ''}`}
          title={hint ?? title} onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center justify-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          <span className={hint ? 'underline decoration-dotted decoration-slate-300 dark:decoration-slate-600 underline-offset-[3px] cursor-help' : undefined}>{label}</span>
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  return (
    <div>
      <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4 flex-wrap">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          {pageList.map((p, i) => <span key={i} title={p}><span className="font-black text-slate-400">P{i + 1}</span> <span className="font-mono">{shortUrl(p)}</span></span>)}
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <label className="text-[11px] text-slate-500 flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={top10Only} onChange={(e) => setTop10Only(e.target.checked)} /> A page in top 10
          </label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter keywords…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-44" />
          </div>
          {filtered.length !== items.length && <span className="text-[11px] text-slate-400">{filtered.length} / {items.length}</span>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <Header label="Keyword" sortK="keyword" align="left" className="!px-6" />
              <Header label="KD" hint={METRIC_HINTS.kd} sortK="kd" align="center" />
              <Header label="Volume" hint={METRIC_HINTS.volume} sortK="volume" align="right" />
              <Header label="CPC" hint={METRIC_HINTS.cpc} sortK="cpc" align="right" className="hidden md:table-cell" />
              {pageList.map((p, i) => (
                <Header key={i} label={`P${i + 1}`} sortK={i} align="center" className="max-w-[100px]" title={p} />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {sorted.map((item, i) => (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-200 max-w-[260px]"><span className="truncate block">{item.keyword_data?.keyword ?? '—'}</span></td>
                <td className="px-4 py-3 text-center"><KdBadge v={kdOf(item)} /></td>
                <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">{fmt(item.keyword_data?.keyword_info?.search_volume)}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-400 tabular-nums hidden md:table-cell">{item.keyword_data?.keyword_info?.cpc != null ? `$${item.keyword_data.keyword_info.cpc.toFixed(2)}` : '—'}</td>
                {pageList.map((_, pi) => (
                  <td key={pi} className="px-4 py-3 text-center"><RankBadge rank={pagePosition(item, pi)} /></td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={4 + pageList.length} className="px-6 py-10 text-center text-sm text-slate-400">No keyword matches these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
