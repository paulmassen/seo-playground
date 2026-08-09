'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface AnchorItem {
  anchor: string;
  backlinks: number;
  referring_domains: number;
  broken_backlinks: number;
  broken_pages: number;
  dofollow: number;
  nofollow: number;
  first_seen: string;
  last_seen: string;
}

type SortKey = 'anchor' | 'backlinks' | 'referring_domains' | 'dofollow_pct' | 'first_seen';
type SortDir = 'asc' | 'desc';

function sortValue(item: AnchorItem, key: SortKey): number | string {
  switch (key) {
    case 'anchor': return item.anchor?.toLowerCase() ?? '';
    case 'backlinks': return item.backlinks ?? -1;
    case 'referring_domains': return item.referring_domains ?? -1;
    case 'dofollow_pct': return item.backlinks > 0 ? item.dofollow / item.backlinks : -1;
    case 'first_seen': return item.first_seen ?? '';
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function AnchorsTable({ items }: { items: AnchorItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('backlinks');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const maxLinks = items[0]?.backlinks ?? 1;

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
      <th className={`px-3 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest select-none cursor-pointer hover:text-slate-600 ${align === 'left' ? 'text-left !px-5' : 'text-right'}`}
        onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-slate-100">
          <Header label="Anchor Text" sortK="anchor" align="left" />
          <Header label="Links" sortK="backlinks" align="right" />
          <Header label="Domains" sortK="referring_domains" align="right" />
          <Header label="Split" sortK="dofollow_pct" align="left" />
          <Header label="First Seen" sortK="first_seen" align="left" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {sorted.map((item, i) => {
          const pct = Math.round((item.backlinks / maxLinks) * 100);
          const dfPct = item.backlinks > 0 ? Math.round((item.dofollow / item.backlinks) * 100) : 0;
          return (
            <tr key={i} className="hover:bg-slate-50/50">
              <td className="px-5 py-3">
                <div className="font-bold text-slate-800 max-w-xs truncate">{item.anchor || <span className="text-slate-400 italic">empty</span>}</div>
                <div className="mt-1 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </td>
              <td className="px-3 py-3 text-right font-mono font-bold text-slate-700">{item.backlinks.toLocaleString()}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-500">{item.referring_domains.toLocaleString()}</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-black text-emerald-600">{dfPct}% do</span>
                  <span className="text-[9px] text-slate-300">/</span>
                  <span className="text-[9px] font-black text-slate-400">{100 - dfPct}% no</span>
                </div>
              </td>
              <td className="px-3 py-3 text-slate-400">{item.first_seen?.split('T')[0] ?? '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
