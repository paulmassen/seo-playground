'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface IntentItem {
  keyword?: string;
  keyword_intent?: { label?: string; probability?: number } | null;
  secondary_keyword_intents?: Array<{ label?: string; probability?: number }> | null;
}

type SortKey = 'keyword' | 'intent';
type SortDir = 'asc' | 'desc';

const INTENT_CONFIG: Record<string, { label: string; cls: string }> = {
  informational: { label: 'Informational', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  navigational:  { label: 'Navigational',  cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  commercial:    { label: 'Commercial',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  transactional: { label: 'Transactional', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

function IntentBadge({ intent }: { intent?: string }) {
  if (!intent) return <span className="text-slate-300 text-xs">—</span>;
  const cfg = INTENT_CONFIG[intent];
  if (!cfg) return <span className="text-xs text-slate-500">{intent}</span>;
  return <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${cfg.cls}`}>{cfg.label}</span>;
}

function getMainIntent(item: IntentItem) { return item.keyword_intent?.label; }
function getSecondaryIntents(item: IntentItem) {
  return item.secondary_keyword_intents?.map((s) => s.label).filter(Boolean) as string[] | undefined;
}

function sortValue(item: IntentItem, key: SortKey): string {
  switch (key) {
    case 'keyword': return item.keyword?.toLowerCase() ?? '';
    case 'intent': return getMainIntent(item)?.toLowerCase() ?? '';
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function SearchIntentTable({ items }: { items: IntentItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    if (!sortKey) return items;
    return [...items].sort((a, b) => {
      const cmp = sortValue(a, sortKey).localeCompare(sortValue(b, sortKey));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'center'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left' : 'text-center'} ${className ?? ''}`}
          onClick={() => toggleSort(sortK)}>
        <span className="inline-flex items-center justify-center gap-1">
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
            <Header label="Main intent" sortK="intent" align="center" />
            <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell">Secondary intents</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
          {sorted.map((item, i) => {
            const secondary = getSecondaryIntents(item);
            return (
              <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-3 text-[11px] font-mono text-slate-400 tabular-nums">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-200">{item.keyword ?? '—'}</td>
                <td className="px-4 py-3 text-center"><IntentBadge intent={getMainIntent(item)} /></td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="flex gap-1 flex-wrap">
                    {secondary?.map((s) => <IntentBadge key={s} intent={s} />)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
