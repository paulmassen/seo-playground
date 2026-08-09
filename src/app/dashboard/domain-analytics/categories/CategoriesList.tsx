'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface ResolvedCategoryItem {
  categoryPaths: string[];
  count: number;
  etv: number;
}

type SortKey = 'etv' | 'count';
type SortDir = 'asc' | 'desc';

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function CategoriesList({ items }: { items: ResolvedCategoryItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('etv');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const totalEtv = items.reduce((sum, i) => sum + i.etv, 0);
  const maxEtv = Math.max(...items.map((i) => i.etv), 1);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const cmp = a[sortKey] - b[sortKey];
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortButton({ label, sortK }: { label: string; sortK: SortKey }) {
    const active = sortKey === sortK;
    return (
      <button
        type="button"
        onClick={() => toggleSort(sortK)}
        className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg transition-colors ${
          active ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
      >
        {label}
        <SortIcon active={active} dir={sortDir} />
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-6 py-2.5 border-b border-slate-50 dark:border-slate-800/50">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 mr-1">Sort</span>
        <SortButton label="ETV" sortK="etv" />
        <SortButton label="Keywords" sortK="count" />
      </div>
      <div className="divide-y divide-slate-50 dark:divide-slate-800">
        {sorted.map((item, i) => {
          const barW = Math.round((item.etv / maxEtv) * 100);
          const share = totalEtv > 0 ? ((item.etv / totalEtv) * 100).toFixed(1) : '0.0';
          return (
            <div key={i} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div className="w-10 text-right text-[11px] font-mono text-slate-400 tabular-nums shrink-0">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {item.categoryPaths.map((p, ci) => (
                    <span key={ci} className="text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded">{p}</span>
                  ))}
                  <span className="text-[11px] text-slate-400">{item.count.toLocaleString('en-GB')} keywords</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${barW}%` }} />
                  </div>
                  <span className="text-[11px] font-black text-slate-500 tabular-nums shrink-0">{share}%</span>
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">{Math.round(item.etv).toLocaleString('en-GB')} ETV</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
