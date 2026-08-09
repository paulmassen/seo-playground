'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { TrackedKeyword, RankCheck } from '@/lib/db';
import KeywordRow from './KeywordRow';

interface Row {
  kw: TrackedKeyword;
  history: RankCheck[];
  latest: RankCheck | null;
  previous: RankCheck | null;
}

type SortKey = 'keyword' | 'position' | 'trend' | 'checked';
type SortDir = 'asc' | 'desc';

function sortValue(row: Row, key: SortKey): number | string {
  switch (key) {
    case 'keyword': return row.kw.keyword.toLowerCase();
    case 'position': return row.latest?.position ?? 9999;
    case 'trend': {
      const curr = row.latest?.position ?? null;
      const prev = row.previous?.position ?? null;
      if (curr === null || prev === null) return 0;
      return prev - curr;
    }
    case 'checked': return row.latest?.checkedAt ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

interface Props {
  rows: Row[];
  hasCreds: boolean;
  checkAction: (fd: FormData) => Promise<void>;
  removeAction: (fd: FormData) => Promise<void>;
}

export default function RankTrackerTable({ rows, hasCreds, checkAction, removeAction }: Props) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb))
        : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'keyword' ? 'asc' : 'desc'); }
  }

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'center'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest select-none cursor-pointer hover:text-slate-600 ${align === 'left' ? 'text-left' : 'text-center'} ${className ?? ''}`}
          onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'center' ? 'justify-center w-full' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-slate-50">
          <Header label="Keyword" sortK="keyword" align="left" className="!px-5" />
          <Header label="Pos." sortK="position" align="center" />
          <Header label="Trend" sortK="trend" align="center" />
          <th className="text-center px-3 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">14d</th>
          <Header label="Checked" sortK="checked" align="left" />
          <th className="px-3 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {sorted.map(({ kw, history, latest, previous }) => (
          <KeywordRow
            key={kw.id}
            kw={kw}
            history={history}
            latest={latest}
            previous={previous}
            hasCreds={hasCreds}
            checkAction={checkAction}
            removeAction={removeAction}
          />
        ))}
      </tbody>
    </table>
  );
}
