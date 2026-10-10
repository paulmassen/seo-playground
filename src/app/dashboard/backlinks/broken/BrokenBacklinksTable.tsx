'use client';

import { Fragment, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from 'lucide-react';
import { groupByBrokenPage, type BrokenLink, type BrokenPage } from './group';

type View = 'pages' | 'links';
type PageSort = 'domains' | 'links' | 'dofollow' | 'dr';
type LinkSort = 'dr' | 'source' | 'target' | 'seen';
type SortDir = 'asc' | 'desc';

function DRBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>;
  const color = value >= 70 ? 'bg-emerald-500 text-white' : value >= 40 ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400';
  return <span className={`inline-flex items-center justify-center w-8 h-5 rounded text-[10px] font-black ${color}`}>{value}</span>;
}

function StatusBadge({ code }: { code?: number | null }) {
  if (!code) return <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded" title="Not crawled yet">n/a</span>;
  const color = code >= 500
    ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/60'
    : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/60';
  return <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${color}`}>{code}</span>;
}

function DoBadge({ dofollow }: { dofollow?: boolean }) {
  return (
    <span className={`shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${dofollow ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/60' : 'text-slate-400 bg-slate-100 dark:bg-slate-800'}`}>
      {dofollow ? 'do' : 'no'}
    </span>
  );
}

function formatSeen(s?: string) {
  if (!s) return '—';
  const d = new Date(s.replace(' +00:00', 'Z').replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return s.split(' ')[0];
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300 dark:text-slate-600" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-600 dark:text-blue-400" />;
}

function useSort<K extends string>(initial: K) {
  const [key, setKey] = useState<K>(initial);
  const [dir, setDir] = useState<SortDir>('desc');
  const toggle = (k: K) => {
    if (k === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setKey(k); setDir('desc'); }
  };
  return { key, dir, toggle };
}

function cmp(a: number | string, b: number | string) {
  return typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b)) : a - b;
}

const TH = 'px-4 py-3 whitespace-nowrap text-[10px] font-black uppercase tracking-widest text-slate-400';

function SortHeader<K extends string>({ label, k, sort, align = 'left', className = '' }: {
  label: string; k: K; sort: { key: K; dir: SortDir; toggle: (k: K) => void }; align?: 'left' | 'right' | 'center'; className?: string;
}) {
  const active = sort.key === k;
  return (
    <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`${TH} ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${className}`}>
      <button type="button" onClick={() => sort.toggle(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-widest hover:text-slate-600 dark:hover:text-slate-200 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        <SortIcon active={active} dir={sort.dir} />
      </button>
    </th>
  );
}

function LinkSource({ link }: { link: BrokenLink }) {
  return (
    <>
      <a href={link.url_from} target="_blank" rel="noopener noreferrer"
        className="text-xs font-mono text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate block">
        {link.url_from}
      </a>
      <span className="text-[10px] text-slate-400">{link.domain_from}</span>
    </>
  );
}

function Anchor({ link }: { link: BrokenLink }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {link.anchor ? (
        <span className="text-xs text-slate-800 dark:text-slate-200 font-medium truncate">{link.anchor}</span>
      ) : link.image_url ? (
        <span className="text-[10px] text-slate-400 italic">Image</span>
      ) : (
        <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
      )}
      <DoBadge dofollow={link.dofollow} />
    </div>
  );
}

function PagesView({ pages }: { pages: BrokenPage[] }) {
  const sort = useSort<PageSort>('domains');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const val = (p: BrokenPage): number => {
      switch (sort.key) {
        case 'domains': return p.domains;
        case 'links': return p.links.length;
        case 'dofollow': return p.dofollow;
        case 'dr': return p.bestDr ?? -1;
      }
    };
    return [...pages].sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * cmp(val(a), val(b)));
  }, [pages, sort.key, sort.dir]);

  const toggle = (url: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(url)) next.delete(url); else next.add(url);
    return next;
  });

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
          <th className={`${TH} text-left`}>Broken page</th>
          <th className={`${TH} text-center w-16`}>Status</th>
          <SortHeader label="Domains" k="domains" sort={sort} align="right" className="w-24" />
          <SortHeader label="Links" k="links" sort={sort} align="right" className="w-20" />
          <SortHeader label="Dofollow" k="dofollow" sort={sort} align="right" className="w-24 hidden sm:table-cell" />
          <SortHeader label="Best DR" k="dr" sort={sort} align="center" className="w-24" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
        {sorted.map((p) => {
          const isOpen = open.has(p.url);
          return (
            <Fragment key={p.url}>
              <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3 max-w-0 w-full">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button type="button" onClick={() => toggle(p.url)} aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Hide' : 'Show'} the ${p.links.length} links to ${p.url}`}
                      className="shrink-0 p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    </button>
                    <a href={p.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 truncate">
                      {p.url || '—'}
                    </a>
                  </div>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  {p.statuses.length ? p.statuses.map((s) => <StatusBadge key={s} code={s} />) : <StatusBadge />}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300 tabular-nums">{p.domains.toLocaleString('en-GB')}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums">{p.links.length.toLocaleString('en-GB')}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums hidden sm:table-cell">{p.dofollow.toLocaleString('en-GB')}</td>
                <td className="px-4 py-3 text-center"><DRBadge value={p.bestDr} /></td>
              </tr>
              {isOpen && (
                <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                  <td colSpan={6} className="px-4 pb-3 pt-1">
                    <ul className="ml-6 border-l border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                      {p.links.map((l, i) => (
                        <li key={`${l.url_from}-${i}`} className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,14rem)] items-center gap-3 pl-3 py-2">
                          <DRBadge value={l.domain_from_rank} />
                          <div className="min-w-0"><LinkSource link={l} /></div>
                          <Anchor link={l} />
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function LinksView({ links }: { links: BrokenLink[] }) {
  const sort = useSort<LinkSort>('dr');
  const sorted = useMemo(() => {
    const val = (l: BrokenLink): number | string => {
      switch (sort.key) {
        case 'dr': return l.domain_from_rank ?? -1;
        case 'source': return l.domain_from?.toLowerCase() ?? '';
        case 'target': return l.url_to?.toLowerCase() ?? '';
        case 'seen': return l.first_seen ?? '';
      }
    };
    return [...links].sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * cmp(val(a), val(b)));
  }, [links, sort.key, sort.dir]);

  return (
    <table className="w-full text-sm table-fixed">
      <thead>
        <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
          <SortHeader label="DR" k="dr" sort={sort} align="center" className="w-16" />
          <SortHeader label="Source page" k="source" sort={sort} />
          <th className={`${TH} text-left w-48 hidden md:table-cell`}>Anchor</th>
          <SortHeader label="Broken page" k="target" sort={sort} />
          <SortHeader label="First seen" k="seen" sort={sort} align="right" className="w-32 hidden lg:table-cell" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
        {sorted.map((l, i) => (
          <tr key={`${l.url_from}-${l.url_to}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <td className="px-4 py-3 text-center"><DRBadge value={l.domain_from_rank} /></td>
            <td className="px-4 py-3 min-w-0"><LinkSource link={l} /></td>
            <td className="px-4 py-3 hidden md:table-cell"><Anchor link={l} /></td>
            <td className="px-4 py-3 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <StatusBadge code={l.url_to_status_code} />
                <a href={l.url_to} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-mono text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 truncate">
                  {l.url_to}
                </a>
              </div>
            </td>
            <td className="px-4 py-3 text-right hidden lg:table-cell">
              <span className="text-[11px] text-slate-400 tabular-nums">{formatSeen(l.first_seen)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function BrokenBacklinksTable({ links }: { links: BrokenLink[] }) {
  const [view, setView] = useState<View>('pages');
  const pages = useMemo(() => groupByBrokenPage(links), [links]);

  const tab = (v: View, label: string, count: number) => (
    <button type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${view === v
        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
      {label} <span className="font-mono text-slate-400 ml-0.5">{count.toLocaleString('en-GB')}</span>
    </button>
  );

  return (
    <div>
      <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 flex-wrap">
        <div role="tablist" aria-label="Group results" className="inline-flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          {tab('pages', 'By broken page', pages.length)}
          {tab('links', 'All links', links.length)}
        </div>
        <p className="text-[11px] text-slate-400">
          {view === 'pages' ? 'Fix the pages with the most referring domains first.' : 'Every live link landing on a 4xx/5xx page.'}
        </p>
      </div>
      <div className="overflow-x-auto">
        {view === 'pages' ? <PagesView pages={pages} /> : <LinksView links={links} />}
      </div>
    </div>
  );
}
