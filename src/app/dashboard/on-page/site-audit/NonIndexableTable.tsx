'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import ExportCSVButton from '@/components/ExportCSVButton';

interface AuditPage {
  url?: string;
  status_code?: number;
  onpage_score?: number;
  meta?: { title?: string };
  checks?: Record<string, boolean | undefined>;
}

type Sev = 'error' | 'warning' | 'info' | 'good';

const PAGE_CHECKS: Record<string, { sev: Sev }> = {
  no_title: { sev: 'error' }, no_description: { sev: 'error' }, no_h1_tag: { sev: 'error' },
  is_4xx_code: { sev: 'error' }, is_5xx_code: { sev: 'error' }, is_broken: { sev: 'error' },
  duplicate_title_tag: { sev: 'error' }, has_micromarkup_errors: { sev: 'error' },
  high_loading_time: { sev: 'warning' }, high_waiting_time: { sev: 'warning' },
  https_to_http_links: { sev: 'warning' }, no_image_alt: { sev: 'warning' }, no_favicon: { sev: 'warning' },
  title_too_long: { sev: 'warning' }, title_too_short: { sev: 'warning' }, low_content_rate: { sev: 'warning' },
  has_render_blocking_resources: { sev: 'warning' }, large_page_size: { sev: 'warning' },
  low_character_count: { sev: 'warning' }, deprecated_html_tags: { sev: 'warning' },
  duplicate_meta_tags: { sev: 'warning' }, no_encoding_meta_tag: { sev: 'warning' },
  irrelevant_description: { sev: 'warning' }, irrelevant_title: { sev: 'warning' },
};

function httpBadge(code?: number) {
  if (!code) return null;
  const cls = code < 300 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : code < 400 ? 'bg-blue-50 text-blue-700 border-blue-200'
    : code < 500 ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-red-50 text-red-700 border-red-200';
  return <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${cls}`}>{code}</span>;
}

function countPageIssues(page: AuditPage) {
  if (!page.checks) return { errors: 0, warnings: 0 };
  let errors = 0, warnings = 0;
  for (const [k, v] of Object.entries(page.checks)) {
    if (!v) continue;
    const sev = PAGE_CHECKS[k]?.sev;
    if (sev === 'error') errors++;
    else if (sev === 'warning') warnings++;
  }
  return { errors, warnings };
}

type SortKey = 'url' | 'status' | 'title' | 'issues';
type SortDir = 'asc' | 'desc';

function sortValue(page: AuditPage, key: SortKey): number | string {
  switch (key) {
    case 'url': return page.url?.toLowerCase() ?? '';
    case 'status': return page.status_code ?? -1;
    case 'title': return page.meta?.title?.toLowerCase() ?? '';
    case 'issues': {
      const { errors, warnings } = countPageIssues(page);
      return errors * 1000 + warnings;
    }
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function NonIndexableTable({ pages }: { pages: AuditPage[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('issues');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...pages].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [pages, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'center'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left' : 'text-center'} ${className ?? ''}`}
        onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'center' ? 'justify-center w-full' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((page) => {
    const { errors, warnings } = countPageIssues(page);
    return {
      url: page.url ?? '',
      status: page.status_code ?? '',
      title: page.meta?.title ?? '',
      errors,
      warnings,
    };
  });
  const columns = [
    { key: 'url', label: 'URL' },
    { key: 'status', label: 'HTTP' },
    { key: 'title', label: 'Title' },
    { key: 'errors', label: 'Errors' },
    { key: 'warnings', label: 'Warnings' },
  ];

  return (
    <div>
      <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
        <CopyMarkdownButton data={csvData} columns={columns} />
        <ExportCSVButton data={csvData} filename="site-audit-non-indexable.csv" columns={columns} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">#</th>
              <Header label="URL" sortK="url" align="left" />
              <Header label="HTTP" sortK="status" align="center" />
              <Header label="Title" sortK="title" align="left" className="hidden md:table-cell" />
              <Header label="Issues" sortK="issues" align="center" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {sorted.map((page, i) => {
              const { errors: errCount, warnings: warnCount } = countPageIssues(page);
              const path = page.url ? (() => { try { return new URL(page.url).pathname; } catch { return page.url; } })() : '—';
              return (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 text-[11px] font-mono text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3 max-w-[280px]">
                    <a href={page.url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-mono text-blue-600 hover:underline truncate block">{path}</a>
                  </td>
                  <td className="px-4 py-3 text-center">{httpBadge(page.status_code)}</td>
                  <td className="px-4 py-3 max-w-[200px] hidden md:table-cell">
                    <span className="text-xs text-slate-700 dark:text-slate-300 truncate block">{page.meta?.title ?? <span className="text-slate-300 italic">no title</span>}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {errCount > 0 && <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">{errCount}</span>}
                      {warnCount > 0 && <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">{warnCount}</span>}
                      {errCount === 0 && warnCount === 0 && <span className="text-emerald-500 text-xs">✓</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
