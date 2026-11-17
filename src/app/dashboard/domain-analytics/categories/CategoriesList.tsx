'use client';

import { METRIC_HINTS } from '@/lib/metric-glossary';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';

export interface ResolvedCategoryItem {
  code: number;
  /** Full breadcrumb, e.g. "Food & Groceries > Beverages > Coffee". */
  path: string;
  depth: number;
  count: number;
  etv: number;
  value: number;
  pos1: number;
  top3: number;
  top10: number;
  isNew: number;
  isUp: number;
  isDown: number;
  isLost: number;
  paidCount: number;
  paidEtv: number;
}

type SortKey = 'path' | 'etv' | 'count' | 'top10' | 'value' | 'paidCount';
type SortDir = 'asc' | 'desc';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

function n(v: number) { return Math.round(v).toLocaleString('en-GB'); }

export default function CategoriesList({
  items, target,
}: { items: ResolvedCategoryItem[]; target: string }) {
  const [sortKey, setSortKey] = useState<SortKey>('etv');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [query, setQuery] = useState('');
  const [leafOnly, setLeafOnly] = useState(false);
  const [hideUnknown, setHideUnknown] = useState(false);

  const maxDepth = Math.max(...items.map((i) => i.depth), 1);
  const totalEtv = items.filter((i) => i.depth === 1).reduce((s, i) => s + i.etv, 0) || items.reduce((s, i) => s + i.etv, 0);
  const hasPaid = items.some((i) => i.paidCount > 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // "Leaf" = no other listed category nested under this one.
    const paths = items.map((i) => i.path);
    return items.filter((i) =>
      (!q || i.path.toLowerCase().includes(q))
      && (!hideUnknown || !/^unknown$/i.test(i.path))
      && (!leafOnly || !paths.some((p) => p !== i.path && p.startsWith(`${i.path} > `))));
  }, [items, query, leafOnly, hideUnknown]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const va = a[sortKey];
    const vb = b[sortKey];
    const cmp = typeof va === 'string' ? va.localeCompare(String(vb)) : (va as number) - (vb as number);
    return sortDir === 'asc' ? cmp : -cmp;
  }), [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'path' ? 'asc' : 'desc'); }
  }

  function Header({ label, sortK, hint, className }: { label: string; sortK: SortKey; hint?: string; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th title={hint} onClick={() => toggleSort(sortK)}
        className={`px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 ${sortK === 'path' ? 'text-left' : 'text-right'} ${className ?? ''}`}>
        <span className={`inline-flex items-center gap-1 ${sortK === 'path' ? '' : 'flex-row-reverse'}`}>
          <span className={hint ? 'underline decoration-dotted decoration-slate-300 underline-offset-[3px] cursor-help' : undefined}>{label}</span>
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((i) => ({
    category: i.path, code: i.code, keywords: i.count, top10: i.top10, pos1: i.pos1,
    etv: Math.round(i.etv), value: Math.round(i.value),
    new: i.isNew, up: i.isUp, down: i.isDown, lost: i.isLost,
    paid_keywords: i.paidCount, paid_etv: Math.round(i.paidEtv),
  }));
  const csvColumns = [
    { key: 'category', label: 'Category' }, { key: 'code', label: 'Code' }, { key: 'keywords', label: 'Keywords' },
    { key: 'top10', label: 'Top 10' }, { key: 'pos1', label: '#1' }, { key: 'etv', label: 'ETV' },
    { key: 'value', label: 'Traffic value ($)' }, { key: 'new', label: 'New' }, { key: 'up', label: 'Up' },
    { key: 'down', label: 'Down' }, { key: 'lost', label: 'Lost' }, { key: 'paid_keywords', label: 'Paid keywords' },
    { key: 'paid_etv', label: 'Paid ETV' },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 px-6 py-2.5 border-b border-slate-100 dark:border-slate-800 flex-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter categories…"
            className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" />
        </div>
        {maxDepth > 1 && (
          <label className="text-[11px] text-slate-500 flex items-center gap-1.5 cursor-pointer" title="Hide parent categories whose subcategories are listed, to avoid counting the same keywords twice.">
            <input type="checkbox" checked={leafOnly} onChange={(e) => setLeafOnly(e.target.checked)} /> Most specific only
          </label>
        )}
        <label className="text-[11px] text-slate-500 flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={hideUnknown} onChange={(e) => setHideUnknown(e.target.checked)} /> Hide “Unknown”
        </label>
        {filtered.length !== items.length && <span className="text-[11px] text-slate-400">{filtered.length} / {items.length}</span>}
        <div className="ml-auto flex items-center gap-2">
          <CopyMarkdownButton data={csvData} columns={csvColumns} />
          <ExportCSVButton data={csvData} filename={`categories-${target}.csv`} columns={csvColumns} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <Header label="Category" sortK="path" />
              <Header label="Keywords" sortK="count" hint={METRIC_HINTS.rankedKeywords} />
              <Header label="Top 10" sortK="top10" hint="Keywords of this category ranking on page one (#1 count in brackets)." />
              <Header label="Traffic (ETV)" sortK="etv" hint={`${METRIC_HINTS.etv} Share = part of the total listed.`} />
              <Header label="Value" sortK="value" hint={METRIC_HINTS.trafficValue} className="hidden md:table-cell" />
              <th title="Keyword movements in this category since the previous update: new / up / down / lost." className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden lg:table-cell">
                <span className="underline decoration-dotted decoration-slate-300 underline-offset-[3px] cursor-help">Moves</span>
              </th>
              {hasPaid && <Header label="Paid KW" sortK="paidCount" hint={METRIC_HINTS.paidKeywords} className="hidden md:table-cell" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {sorted.map((item) => {
              const parts = item.path.split(' > ');
              const share = totalEtv > 0 ? (item.etv / totalEtv) * 100 : 0;
              return (
                <tr key={`${item.code}-${item.path}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-3 py-3 pl-6 max-w-[360px]">
                    <div className="text-[11px] text-slate-400 truncate">{parts.slice(0, -1).join(' › ')}</div>
                    <div className="font-bold text-slate-900 dark:text-slate-100 truncate">{parts[parts.length - 1]}</div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">{n(item.count)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">
                    <span className="text-blue-600">{n(item.top10)}</span>
                    <span className="text-[10px] text-emerald-600 ml-1">({item.pos1})</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="font-mono text-slate-700 dark:text-slate-300 tabular-nums">{n(item.etv)}</div>
                    <div className="flex items-center justify-end gap-1.5 mt-1">
                      <div className="w-16 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(100, share)}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-400 tabular-nums w-10 text-right">{share.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-500 tabular-nums hidden md:table-cell">${n(item.value)}</td>
                  <td className="px-3 py-3 text-right font-mono text-[11px] whitespace-nowrap hidden lg:table-cell">
                    <span className="text-emerald-600">+{item.isNew}</span>{' '}
                    <span className="text-blue-500">↑{item.isUp}</span>{' '}
                    <span className="text-amber-600">↓{item.isDown}</span>{' '}
                    <span className="text-red-500">−{item.isLost}</span>
                  </td>
                  {hasPaid && <td className="px-3 py-3 text-right font-mono text-violet-600 tabular-nums hidden md:table-cell">{n(item.paidCount)}</td>}
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-400">No category matches these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
