'use client';

import { METRIC_HINTS } from '@/lib/metric-glossary';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';

interface TrafficMetrics { count?: number; etv?: number; impressions_etv?: number; estimated_paid_traffic_cost?: number }
export interface TrafficItem {
  target?: string;
  metrics?: { organic?: TrafficMetrics; paid?: TrafficMetrics; featured_snippet?: TrafficMetrics; local_pack?: TrafficMetrics };
}

type SortKey = 'target' | 'traffic' | 'keywords' | 'per_kw' | 'paid' | 'paid_keywords' | 'snippet' | 'local';
type SortDir = 'asc' | 'desc';

function fmt(n?: number) { return n != null ? Math.round(n).toLocaleString('en-GB') : '—'; }

function sortValue(item: TrafficItem, key: SortKey): number | string {
  const m = item.metrics;
  switch (key) {
    case 'target': return item.target?.toLowerCase() ?? '';
    case 'traffic': return m?.organic?.etv ?? -1;
    case 'keywords': return m?.organic?.count ?? -1;
    case 'per_kw': return m?.organic?.count ? (m.organic.etv ?? 0) / m.organic.count : -1;
    case 'paid': return m?.paid?.etv ?? -1;
    case 'paid_keywords': return m?.paid?.count ?? -1;
    case 'snippet': return m?.featured_snippet?.count ?? -1;
    case 'local': return m?.local_pack?.etv ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function TrafficEstimationTable({ items, cost, fromHistory, location, language }: {
  items: TrafficItem[]; cost?: number; fromHistory?: boolean; location: string; language: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('traffic');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [query, setQuery] = useState('');
  const [hideEmpty, setHideEmpty] = useState(false);

  const totalEtv = items.reduce((s, i) => s + (i.metrics?.organic?.etv ?? 0), 0);
  const maxEtv = Math.max(...items.map((i) => i.metrics?.organic?.etv ?? 0), 1);
  const empty = items.filter((i) => !(i.metrics?.organic?.count)).length;
  const hasPaid = items.some((i) => (i.metrics?.paid?.count ?? 0) > 0);
  const hasSnippet = items.some((i) => (i.metrics?.featured_snippet?.count ?? 0) > 0);
  const hasLocal = items.some((i) => (i.metrics?.local_pack?.count ?? 0) > 0);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => (!q || (i.target ?? '').toLowerCase().includes(q)) && (!hideEmpty || (i.metrics?.organic?.count ?? 0) > 0))
      .sort((a, b) => {
        const va = sortValue(a, sortKey);
        const vb = sortValue(b, sortKey);
        const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [items, sortKey, sortDir, query, hideEmpty]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'target' ? 'asc' : 'desc'); }
  }

  function Header({ label, sortK, align, className, hint }: { label: string; sortK: SortKey; align: 'left' | 'center' | 'right'; className?: string; hint?: string }) {
    const active = sortKey === sortK;
    return (
      <th title={hint} className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? ''}`}
          onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          <span className={hint ? 'underline decoration-dotted decoration-slate-300 dark:decoration-slate-600 underline-offset-[3px] cursor-help' : undefined}>{label}</span>
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((item) => {
    const m = item.metrics;
    return {
      target: item.target ?? '',
      keywords: m?.organic?.count ?? '',
      traffic: m?.organic?.etv != null ? Math.round(m.organic.etv) : '',
      share: totalEtv > 0 && m?.organic?.etv != null ? `${((m.organic.etv / totalEtv) * 100).toFixed(1)}%` : '',
      paid_keywords: m?.paid?.count ?? '',
      paid_traffic: m?.paid?.etv != null ? Math.round(m.paid.etv) : '',
      snippets: m?.featured_snippet?.count ?? '',
      local_keywords: m?.local_pack?.count ?? '',
      local_traffic: m?.local_pack?.etv != null ? Math.round(m.local_pack.etv) : '',
    };
  });
  const csvColumns = [
    { key: 'target', label: 'Target' }, { key: 'keywords', label: 'Organic KWs' }, { key: 'traffic', label: 'Organic traffic (ETV)' },
    { key: 'share', label: 'Share' }, { key: 'paid_keywords', label: 'Ads KWs' }, { key: 'paid_traffic', label: 'Ads traffic' },
    { key: 'snippets', label: 'Featured snippets' }, { key: 'local_keywords', label: 'Local pack KWs' }, { key: 'local_traffic', label: 'Local pack traffic' },
  ];

  const isDomain = (t?: string) => !!t && !t.startsWith('http');
  const competitorsList = items.filter((i) => isDomain(i.target) && (i.metrics?.organic?.count ?? 0) > 0).map((i) => i.target as string);

  return (
    <div>
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">{items.length} targets</span>
          {fromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
          <span className="text-[11px] text-slate-400">{location} · {language} · {fmt(totalEtv)} visits/mo in total</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
          <CopyMarkdownButton data={csvData} columns={csvColumns} />
          <ExportCSVButton data={csvData} filename="traffic-estimation.csv" columns={csvColumns} />
        </div>
      </div>

      <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-4 flex-wrap">
        {empty > 0 && (
          <label className="text-[11px] text-slate-500 flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> Hide {empty} target{empty > 1 ? 's' : ''} with no rankings
          </label>
        )}
        {competitorsList.length >= 2 && competitorsList.length <= 20 && (
          <a className="text-[11px] font-bold text-slate-400 hover:text-blue-600"
            href={`/dashboard/domain-intersection?${new URLSearchParams({ target1: competitorsList[0], target2: competitorsList[1], mode: 'gap', location, language, prefill: '1' })}`}>
            Keyword gap between the top two →
          </a>
        )}
        <div className="relative ml-auto">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter targets…"
            className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-44" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-4 py-3 w-10 text-[10px] font-black text-slate-400">#</th>
              <Header label="Target" sortK="target" align="left" />
              <Header label="Organic traffic" hint={METRIC_HINTS.etv} sortK="traffic" align="left" />
              <Header label="Keywords" hint={METRIC_HINTS.rankedKeywords} sortK="keywords" align="right" />
              <Header label="Visits / KW" hint="Organic traffic divided by ranked keywords: how much each ranking is worth on average. Low = many rankings far from the top." sortK="per_kw" align="right" className="hidden xl:table-cell" />
              {hasPaid && <Header label="Ads" hint={METRIC_HINTS.paidEtv} sortK="paid" align="right" className="hidden sm:table-cell" />}
              {hasSnippet && <Header label="Snippets" hint="Keywords where the target holds the featured snippet." sortK="snippet" align="right" className="hidden 2xl:table-cell" />}
              {hasLocal && <Header label="Local pack" hint="Estimated visits from the Google Maps local pack (keywords in brackets)." sortK="local" align="right" className="hidden lg:table-cell" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {sorted.map((item, i) => {
              const m = item.metrics;
              const etv = m?.organic?.etv ?? 0;
              const share = totalEtv > 0 ? (etv / totalEtv) * 100 : 0;
              const perKw = m?.organic?.count ? etv / m.organic.count : null;
              const domain = isDomain(item.target);
              return (
                <tr key={item.target ?? i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 text-center text-xs text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3 max-w-[240px]">
                    <a href={domain ? `https://${item.target}` : item.target} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-slate-900 dark:text-white hover:text-blue-600 truncate block">{item.target ?? '—'}</a>
                    {domain && (
                      <div className="flex gap-2.5 mt-0.5">
                        <a className="text-[10px] font-bold text-slate-400 hover:text-blue-600" href={`/dashboard/ranked-keywords?${new URLSearchParams({ target: item.target!, location, language, prefill: '1' })}`}>Ranked KWs</a>
                        <a className="text-[10px] font-bold text-slate-400 hover:text-blue-600" href={`/dashboard/competitors?${new URLSearchParams({ target: item.target!, location, language, prefill: '1' })}`}>Competitors</a>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden hidden sm:block">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.round((etv / maxEtv) * 100)}%` }} />
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums whitespace-nowrap">{fmt(etv)}</span>
                      <span className="text-[10px] text-slate-400 tabular-nums">{share.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums">{fmt(m?.organic?.count)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden xl:table-cell">{perKw != null ? perKw.toFixed(1) : '—'}</td>
                  {hasPaid && <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden sm:table-cell">{m?.paid?.count ? <>{fmt(m.paid.etv)} <span className="text-[10px] text-slate-400">({m.paid.count})</span></> : '—'}</td>}
                  {hasSnippet && <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden 2xl:table-cell">{m?.featured_snippet?.count || '—'}</td>}
                  {hasLocal && <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden lg:table-cell">{m?.local_pack?.count ? <>{fmt(m.local_pack.etv)} <span className="text-[10px] text-slate-400">({m.local_pack.count})</span></> : '—'}</td>}
                </tr>
              );
            })}
            {sorted.length === 0 && <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-400">No target matches.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
