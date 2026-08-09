'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface AuditPage {
  url?: string;
  resource_type?: string;
  status_code?: number;
  onpage_score?: number;
  size?: number;
  meta?: {
    title?: string;
    description?: string;
    title_length?: number;
    description_length?: number;
    internal_links_count?: number;
    external_links_count?: number;
    images_count?: number;
  };
  page_timing?: { duration_time?: number; waiting_time?: number };
  content?: { plain_text_word_count?: number };
  checks?: Record<string, boolean | undefined>;
}

type Sev = 'error' | 'warning' | 'info' | 'good';

const PAGE_CHECKS: Record<string, { label: string; sev: Sev }> = {
  no_title: { label: 'Missing title', sev: 'error' },
  no_description: { label: 'Missing description', sev: 'error' },
  no_h1_tag: { label: 'Missing H1', sev: 'error' },
  is_4xx_code: { label: '4XX error', sev: 'error' },
  is_5xx_code: { label: '5XX error', sev: 'error' },
  is_broken: { label: 'Broken', sev: 'error' },
  duplicate_title_tag: { label: 'Duplicate title', sev: 'error' },
  has_micromarkup_errors: { label: 'Microdata errors', sev: 'error' },
  high_loading_time: { label: 'High load time', sev: 'warning' },
  high_waiting_time: { label: 'High TTFB', sev: 'warning' },
  https_to_http_links: { label: 'HTTPS→HTTP links', sev: 'warning' },
  no_image_alt: { label: 'Missing alt text', sev: 'warning' },
  no_favicon: { label: 'No favicon', sev: 'warning' },
  title_too_long: { label: 'Title too long', sev: 'warning' },
  title_too_short: { label: 'Title too short', sev: 'warning' },
  low_content_rate: { label: 'Low text rate', sev: 'warning' },
  has_render_blocking_resources: { label: 'Render-blocking', sev: 'warning' },
  large_page_size: { label: 'Large page', sev: 'warning' },
  low_character_count: { label: 'Low char count', sev: 'warning' },
  deprecated_html_tags: { label: 'Deprecated HTML', sev: 'warning' },
  duplicate_meta_tags: { label: 'Duplicate meta', sev: 'warning' },
  no_encoding_meta_tag: { label: 'Missing charset', sev: 'warning' },
  irrelevant_description: { label: 'Irrelevant desc.', sev: 'warning' },
  irrelevant_title: { label: 'Irrelevant title', sev: 'warning' },
  is_https: { label: 'HTTPS', sev: 'good' },
  has_html_doctype: { label: 'DOCTYPE', sev: 'good' },
  has_micromarkup: { label: 'Structured data', sev: 'good' },
  seo_friendly_url: { label: 'SEO URL', sev: 'good' },
  canonical: { label: 'Canonical set', sev: 'info' },
  is_redirect: { label: 'Has redirect', sev: 'info' },
};

function fmt(n?: number) { return n !== undefined && n !== null ? n.toLocaleString('en-GB') : '—'; }

function formatMs(ms?: number) {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function scoreBg(score?: number) {
  if (!score) return 'bg-slate-100 border-slate-200 text-slate-500';
  if (score >= 80) return 'bg-emerald-50 border-emerald-200 text-emerald-700';
  if (score >= 50) return 'bg-amber-50 border-amber-200 text-amber-700';
  return 'bg-red-50 border-red-200 text-red-700';
}

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

type SortKey = 'url' | 'score' | 'status' | 'issues' | 'load' | 'words';
type SortDir = 'asc' | 'desc';

function sortValue(page: AuditPage, key: SortKey): number | string {
  switch (key) {
    case 'url': return page.url?.toLowerCase() ?? '';
    case 'score': return page.onpage_score ?? -1;
    case 'status': return page.status_code ?? -1;
    case 'issues': {
      const { errors, warnings } = countPageIssues(page);
      return errors * 1000 + warnings;
    }
    case 'load': return page.page_timing?.duration_time ?? -1;
    case 'words': return page.content?.plain_text_word_count ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function SiteAuditPagesTable({ pages }: { pages: AuditPage[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('issues');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...pages].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb))
        : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [pages, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'center' | 'right'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? ''}`}
          onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : align === 'center' ? 'justify-center w-full' : ''}`}>
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
            <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">#</th>
            <Header label="URL" sortK="url" align="left" />
            <Header label="Score" sortK="score" align="center" />
            <Header label="HTTP" sortK="status" align="center" />
            <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell">Title</th>
            <Header label="Issues" sortK="issues" align="center" />
            <Header label="Load" sortK="load" align="right" className="hidden lg:table-cell" />
            <Header label="Words" sortK="words" align="right" className="hidden xl:table-cell" />
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
                    className="text-xs font-mono text-blue-600 hover:text-blue-800 truncate block hover:underline">
                    {path}
                  </a>
                </td>
                <td className="px-4 py-3 text-center">
                  {page.onpage_score !== undefined ? (
                    <span className={`inline-flex items-center justify-center w-12 h-6 rounded text-[11px] font-black border ${scoreBg(page.onpage_score)}`}>
                      {page.onpage_score.toFixed(0)}
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3 text-center">{httpBadge(page.status_code)}</td>
                <td className="px-4 py-3 max-w-[200px] hidden md:table-cell">
                  <span className="text-xs text-slate-700 dark:text-slate-300 truncate block">{page.meta?.title ?? <span className="text-slate-300 italic">no title</span>}</span>
                  {page.meta?.title_length !== undefined && (
                    <span className={`text-[10px] ${page.meta.title_length > 65 || page.meta.title_length < 30 ? 'text-amber-500' : 'text-slate-400'}`}>{page.meta.title_length} chars</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {errCount > 0 && <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">{errCount}</span>}
                    {warnCount > 0 && <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">{warnCount}</span>}
                    {errCount === 0 && warnCount === 0 && <span className="text-emerald-500 text-xs">✓</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden lg:table-cell text-xs">
                  {formatMs(page.page_timing?.duration_time)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden xl:table-cell text-xs">
                  {fmt(page.content?.plain_text_word_count)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
