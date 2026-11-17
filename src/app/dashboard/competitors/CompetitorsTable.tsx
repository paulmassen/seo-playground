'use client';

import { METRIC_HINTS } from '@/lib/metric-glossary';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import type { CompetitorItem, DomainMetricsOrganic } from './page';

type SortKey = 'domain' | 'intersections' | 'avg_position' | 'wins' | 'shared_traffic' | 'site_traffic' | 'total_kw';
type SortDir = 'asc' | 'desc';

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return Math.round(n).toLocaleString('en-GB');
}

function compact(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

function top10(o?: DomainMetricsOrganic) {
  return (o?.pos_1 ?? 0) + (o?.pos_2_3 ?? 0) + (o?.pos_4_10 ?? 0);
}

function top3(o?: DomainMetricsOrganic) {
  return (o?.pos_1 ?? 0) + (o?.pos_2_3 ?? 0);
}

function TrafficBadge({ value }: { value?: number }) {
  if (!value) return <span className="text-slate-300">—</span>;
  const color = value >= 10000 ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300'
    : value >= 1000 ? 'text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300'
    : 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300';
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-black tabular-nums ${color}`}>{compact(value)}</span>;
}

/** Their top-10 rankings against yours, on the keywords you share with them. */
function WinsCell({ theirs, yours, total }: { theirs: number; yours: number; total: number }) {
  const tPct = total ? (theirs / total) * 100 : 0;
  const yPct = total ? (yours / total) * 100 : 0;
  const lead = theirs > yours ? 'text-red-600 dark:text-red-400' : theirs < yours ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500';
  return (
    <div className="min-w-[110px]" title={`They rank top 10 on ${theirs} shared keywords, you on ${yours} (of ${total}).`}>
      <div className={`text-xs font-black tabular-nums ${lead}`}>{theirs} <span className="text-slate-300 font-normal">vs</span> <span className="text-slate-700 dark:text-slate-300">{yours}</span></div>
      <div className="flex gap-0.5 mt-1 h-1">
        <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-l-full overflow-hidden flex justify-end">
          <div className="h-full bg-red-400" style={{ width: `${tPct}%` }} />
        </div>
        <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-r-full overflow-hidden">
          <div className="h-full bg-emerald-400" style={{ width: `${yPct}%` }} />
        </div>
      </div>
    </div>
  );
}

function sortValue(item: CompetitorItem, key: SortKey): number | string {
  switch (key) {
    case 'domain': return item.domain?.toLowerCase() ?? '';
    case 'intersections': return item.intersections ?? -1;
    case 'avg_position': return item.avg_position ?? 1e9;
    case 'wins': return top10(item.competitor_metrics?.organic) - top10(item.metrics?.organic);
    case 'shared_traffic': return item.competitor_metrics?.organic?.etv ?? -1;
    case 'site_traffic': return item.full_domain_metrics?.organic?.etv ?? -1;
    case 'total_kw': return item.full_domain_metrics?.organic?.count ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

function qs(p: Record<string, string>) {
  return new URLSearchParams({ ...p, prefill: '1' }).toString();
}

const linkCls = 'text-[10px] font-bold text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors';

export default function CompetitorsTable({
  items, self, target, location, language,
}: {
  items: CompetitorItem[];
  self?: CompetitorItem;
  target: string;
  location: string;
  language: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('intersections');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [query, setQuery] = useState('');
  const [minCommon, setMinCommon] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const maxIntersections = Math.max(...items.map((i) => i.intersections ?? 0), 1);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) =>
      !hidden.has(i.domain ?? '')
      && (i.intersections ?? 0) >= minCommon
      && (!q || (i.domain ?? '').toLowerCase().includes(q)));
  }, [items, query, minCommon, hidden]);

  const sorted = useMemo(() => {
    return [...visible].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [visible, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'avg_position' || key === 'domain' ? 'asc' : 'desc'); }
  }

  function Header({ label, sortK, align, className, hint }: { label: string; sortK: SortKey; align: 'left' | 'right'; className?: string; hint?: string }) {
    const active = sortKey === sortK;
    return (
      <th title={hint} className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left' : 'text-right'} ${className ?? ''}`}
          onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          <span className={hint ? 'underline decoration-dotted decoration-slate-300 dark:decoration-slate-600 underline-offset-[3px] cursor-help' : undefined}>{label}</span>
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const selfOrganic = self?.full_domain_metrics?.organic;

  return (
    <div>
      {/* Baseline + filters */}
      <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-6 gap-y-3">
        {selfOrganic && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-black uppercase tracking-widest text-slate-400 mr-2">Your site</span>
            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{fmt(selfOrganic.count)}</span> keywords ·{' '}
            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{fmt(selfOrganic.etv)}</span> visits/mo ·{' '}
            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{top10(selfOrganic)}</span> in top 10
          </div>
        )}
        <div className="flex items-center gap-3 ml-auto flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter domains…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-44" />
          </div>
          <label className="text-[11px] text-slate-500 flex items-center gap-1.5">
            Min. common
            <input type="number" min={0} value={minCommon || ''} onChange={(e) => setMinCommon(Math.max(0, Number(e.target.value) || 0))} placeholder="0"
              className="w-16 px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          {hidden.size > 0 && (
            <button onClick={() => setHidden(new Set())} className="text-[11px] font-bold text-blue-600 hover:underline">
              Show {hidden.size} hidden
            </button>
          )}
          {visible.length !== items.length && <span className="text-[11px] text-slate-400">{visible.length} / {items.length}</span>}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-5 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 w-10">#</th>
              <Header label="Competitor" sortK="domain" align="left" />
              <Header label="Common keywords" hint={METRIC_HINTS.commonKeywords} sortK="intersections" align="left" />
              <Header label="Avg pos." hint={METRIC_HINTS.avgPosition} sortK="avg_position" align="right" />
              <Header label="Top 10: them vs you" hint={METRIC_HINTS.competitorWins} sortK="wins" align="left" className="hidden md:table-cell" />
              <Header label="Traffic on common" hint={METRIC_HINTS.competitorTraffic} sortK="shared_traffic" align="right" className="hidden sm:table-cell" />
              <Header label="Site traffic" hint={METRIC_HINTS.competitorSiteTraffic} sortK="site_traffic" align="right" className="hidden lg:table-cell" />
              <Header label="Total KW" hint={METRIC_HINTS.totalKeywords} sortK="total_kw" align="right" className="hidden lg:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {sorted.map((item, i) => {
              const domain = item.domain ?? '';
              const intersections = item.intersections ?? 0;
              const barPct = Math.round((intersections / maxIntersections) * 100);
              const theirs = item.competitor_metrics?.organic;
              const geo = { location, language };

              return (
                <tr key={domain || i} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors align-top">
                  <td className="px-5 py-3 text-center">
                    <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-black flex items-center justify-center mx-auto">
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer"
                        className="font-mono font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-sm">
                        {domain}
                      </a>
                      <button onClick={() => setHidden((h) => new Set(h).add(domain))} title="Hide this row (not a real competitor)"
                        className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-300 hover:text-red-500 transition">hide</button>
                    </div>
                    <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1">
                      <a className={linkCls} title="Keywords you both rank for"
                        href={`/dashboard/domain-intersection?${qs({ target1: target, target2: domain, mode: 'shared', ...geo })}`}>Shared</a>
                      <a className={linkCls} title="Keywords they rank for and you don't"
                        href={`/dashboard/domain-intersection?${qs({ target1: domain, target2: target, mode: 'gap', ...geo })}`}>Gap</a>
                      <a className={linkCls} href={`/dashboard/ranked-keywords?${qs({ target: domain, ...geo })}`}>Ranked KWs</a>
                      <a className={linkCls} href={`/dashboard/backlinks?${qs({ target: domain })}`}>Backlinks</a>
                      <a className={linkCls} href={`/dashboard/domain-analytics/technologies?${qs({ mode: 'domain', target: domain })}`}>Tech stack</a>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-900 dark:text-white tabular-nums w-10 shrink-0">{fmt(intersections)}</span>
                      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden min-w-[60px]">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${barPct}%` }} />
                      </div>
                    </div>
                    {theirs && (
                      <p className="text-[10px] text-slate-400 mt-1 tabular-nums whitespace-nowrap" title="Competitor's positions on the shared keywords">
                        #1: {theirs.pos_1 ?? 0} · top 3: {top3(theirs)} · top 10: {top10(theirs)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                    {item.avg_position ? item.avg_position.toFixed(1) : '—'}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <WinsCell theirs={top10(theirs)} yours={top10(item.metrics?.organic)} total={intersections} />
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <TrafficBadge value={theirs?.etv} />
                  </td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">
                    <TrafficBadge value={item.full_domain_metrics?.organic?.etv} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums hidden lg:table-cell">
                    {fmt(item.full_domain_metrics?.organic?.count)}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-400">No competitor matches these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
