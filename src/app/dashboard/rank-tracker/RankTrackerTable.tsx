'use client';

import { METRIC_HINTS } from '@/lib/metric-glossary';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { TrackedKeyword, RankCheck, AiModeCheck } from '@/lib/db';
import KeywordRow from './KeywordRow';

interface Row {
  kw: TrackedKeyword;
  history: RankCheck[];
  latest: RankCheck | null;
  previous: RankCheck | null;
  aiModeHistory: AiModeCheck[];
}

type SortKey = 'keyword' | 'position' | 'aiMode' | 'trend' | 'checked';
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
    case 'aiMode': {
      const latest = row.aiModeHistory[0];
      if (!latest) return row.kw.aiMode ? 900 : 1000;
      return latest.status === 'cited' ? latest.citationPosition ?? 99 : latest.status === 'not_cited' ? 500 : 800;
    }
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300 dark:text-slate-600" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-600 dark:text-blue-400" />;
}

interface Props {
  rows: Row[];
  hasCreds: boolean;
  pendingKeywordIds: number[];
  pendingAiModeIds: number[];
  checkAction: (fd: FormData) => Promise<void>;
  removeAction: (fd: FormData) => Promise<void>;
  aiModeAction: (fd: FormData) => Promise<void>;
}

export default function RankTrackerTable({ rows, hasCreds, pendingKeywordIds, pendingAiModeIds, checkAction, removeAction, aiModeAction }: Props) {
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
    else { setSortKey(key); setSortDir(key === 'keyword' || key === 'aiMode' ? 'asc' : 'desc'); }
  }

  function Header({ label, sortK, align, className, hint }: { label: string; sortK: SortKey; align: 'left' | 'center'; className?: string; hint?: string }) {
    const active = sortKey === sortK;
    return (
      <th title={hint} className={`px-2 py-3 whitespace-nowrap text-[10px] font-black text-slate-400 uppercase tracking-widest select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 ${align === 'left' ? 'text-left' : 'text-center'} ${className ?? ''}`}
          onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'center' ? 'justify-center w-full' : ''}`}>
          <span className={hint ? 'underline decoration-dotted decoration-slate-300 dark:decoration-slate-600 underline-offset-[3px] cursor-help' : undefined}>{label}</span>
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto">
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-slate-50 dark:border-slate-800">
          <Header label="Keyword" sortK="keyword" align="left" className="!px-5" />
          <Header label="Pos." hint={METRIC_HINTS.position} sortK="position" align="center" />
          <Header label="AI Mode" hint="Google AI Mode: #n is the domain's rank among the sites the answer cites. Opt in per keyword." sortK="aiMode" align="center" />
          <Header label="Trend" hint={METRIC_HINTS.rankTrend} sortK="trend" align="center" />
          <th className="text-center px-2 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">14d</th>
          <Header label="Checked" sortK="checked" align="left" />
          <th className="px-2 py-3"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
        {sorted.map(({ kw, history, latest, previous, aiModeHistory }) => (
          <KeywordRow
            key={kw.id}
            kw={kw}
            history={history}
            latest={latest}
            previous={previous}
            aiModeHistory={aiModeHistory}
            hasCreds={hasCreds}
            pending={pendingKeywordIds.includes(kw.id)}
            aiModePending={pendingAiModeIds.includes(kw.id)}
            checkAction={checkAction}
            removeAction={removeAction}
            aiModeAction={aiModeAction}
          />
        ))}
      </tbody>
    </table>
    </div>
  );
}
