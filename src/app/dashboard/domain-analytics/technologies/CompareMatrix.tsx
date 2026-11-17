'use client';

import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import ExportCSVButton from '@/components/ExportCSVButton';
import { findByTechHref, flattenTechs, formatLabel, type TechCategories } from './tech-shared';

export interface CompareColumn { domain: string; technologies?: TechCategories | null; savedAt?: number; fromHistory: boolean }

interface Row { name: string; group: string; category: string; path: string; has: boolean[] }

export default function CompareMatrix({ columns }: { columns: CompareColumn[] }) {
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    columns.forEach((col, ci) => {
      for (const t of flattenTechs(col.technologies)) {
        const row = map.get(t.name) ?? { ...t, has: columns.map(() => false) };
        row.has[ci] = true;
        map.set(t.name, row);
      }
    });
    return [...map.values()].sort((a, b) => a.group.localeCompare(b.group) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [columns]);

  const shared = rows.filter((r) => r.has.every(Boolean)).length;
  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => (!onlyDiff || !r.has.every(Boolean)) && (!q || `${r.name} ${r.group} ${r.category}`.toLowerCase().includes(q)));

  const exportData = rows.map((r) => ({
    group: formatLabel(r.group),
    category: formatLabel(r.category),
    technology: r.name,
    ...Object.fromEntries(columns.map((c, i) => [c.domain, r.has[i] ? 'yes' : ''])),
  }));
  const exportColumns = [
    { key: 'group', label: 'Group' },
    { key: 'category', label: 'Category' },
    { key: 'technology', label: 'Technology' },
    ...columns.map((c) => ({ key: c.domain, label: c.domain })),
  ];

  let lastGroup = '';
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Stack comparison</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">{rows.length} technologies in total · {shared} used by every domain</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter technologies…" aria-label="Filter technologies"
            className="w-48 px-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-300 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 cursor-pointer">
            <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} className="rounded" />
            Only differences
          </label>
          <CopyMarkdownButton data={exportData} columns={exportColumns} />
          <ExportCSVButton data={exportData} columns={exportColumns} filename={`tech-compare-${columns.map((c) => c.domain).join('-vs-')}.csv`} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
              <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Technology</th>
              {columns.map((c) => (
                <th key={c.domain} className="px-3 py-3 text-center text-[10px] font-black tracking-widest text-slate-500 font-mono normal-case">
                  {c.domain}
                  <div className="text-[9px] font-bold text-slate-400 font-sans mt-0.5">{flattenTechs(c.technologies).length} techs</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
            {visible.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-6 py-10 text-center text-sm text-slate-400">Nothing to show.</td></tr>
            )}
            {visible.flatMap((r) => {
              const out = [];
              if (r.group !== lastGroup) {
                lastGroup = r.group;
                out.push(
                  <tr key={`g-${r.group}`} className="bg-slate-50/60 dark:bg-slate-900/30">
                    <td colSpan={columns.length + 1} className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">{formatLabel(r.group)}</td>
                  </tr>,
                );
              }
              out.push(
                <tr key={r.name} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="px-4 py-2">
                    <a href={findByTechHref(r.name, r.path)} className="text-xs font-bold text-slate-800 dark:text-slate-200 hover:text-blue-600" title="Find other domains using it (prefilled, not charged until you search)">{r.name}</a>
                    <span className="text-[10px] text-slate-400 ml-2">{formatLabel(r.category)}</span>
                  </td>
                  {r.has.map((h, i) => (
                    <td key={i} className="px-3 py-2 text-center">
                      {h ? <Check className="w-4 h-4 text-emerald-500 inline" /> : <span className="text-slate-200 dark:text-slate-600">—</span>}
                    </td>
                  ))}
                </tr>,
              );
              return out;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
