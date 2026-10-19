'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HistorySidebarProps {
  title: string;
  items: React.ReactNode[];
  /** How many entries to show per page before paginating. */
  perPage?: number;
  /** Narrower column for pages whose main content needs the width. */
  compact?: boolean;
}

export default function HistorySidebar({ title, items, perPage = 8, compact = false }: HistorySidebarProps) {
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * perPage;
  const visible = items.slice(start, start + perPage);

  return (
    <aside className={`w-full ${compact ? 'lg:w-64' : 'lg:w-80'} shrink-0 lg:sticky lg:top-0 lg:self-start`}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className={`${compact ? 'px-4 py-3' : 'px-5 py-4'} border-b border-slate-100 dark:border-slate-800 flex items-center justify-between`}>
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">{title}</h2>
          <span className="text-[11px] tabular-nums text-slate-400">{items.length}</span>
        </div>

        <div className="divide-y divide-slate-50 dark:divide-slate-800">
          {visible}
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:hover:text-slate-500 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-[11px] tabular-nums text-slate-400">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 disabled:hover:text-slate-500 transition-colors"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
