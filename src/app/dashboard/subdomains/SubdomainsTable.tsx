'use client';

import { METRIC_HINTS } from '@/lib/metric-glossary';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';

interface Organic {
  count?: number;
  etv?: number;
  estimated_paid_traffic_cost?: number;
  pos_1?: number;
  pos_2_3?: number;
  pos_4_10?: number;
  pos_11_20?: number;
  is_new?: number;
  is_up?: number;
  is_down?: number;
  is_lost?: number;
}

export interface SubdomainItem {
  subdomain?: string;
  metrics?: { organic?: Organic; paid?: Organic };
}

type SortKey = 'subdomain' | 'keywords' | 'top10' | 'traffic' | 'traffic_cost' | 'net' | 'paid';
type SortDir = 'asc' | 'desc';

function fmt(n?: number) { return n != null ? Math.round(n).toLocaleString('en-GB') : '—'; }
function compact(n = 0) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
const top3 = (o?: Organic) => (o?.pos_1 ?? 0) + (o?.pos_2_3 ?? 0);
const top10 = (o?: Organic) => top3(o) + (o?.pos_4_10 ?? 0);
const net = (o?: Organic) => (o?.is_new ?? 0) + (o?.is_up ?? 0) - (o?.is_down ?? 0) - (o?.is_lost ?? 0);

function sortValue(item: SubdomainItem, key: SortKey): number | string {
  const org = item.metrics?.organic;
  switch (key) {
    case 'subdomain': return item.subdomain?.toLowerCase() ?? '';
    case 'keywords': return org?.count ?? -1;
    case 'top10': return top10(org);
    case 'traffic': return org?.etv ?? -1;
    case 'traffic_cost': return org?.estimated_paid_traffic_cost ?? -1;
    case 'net': return net(org);
    case 'paid': return item.metrics?.paid?.count ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

export default function SubdomainsTable({ items, totalEtv, location, language }: { items: SubdomainItem[]; totalEtv: number; location: string; language: string }) {
  const [sortKey, setSortKey] = useState<SortKey>('traffic');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [query, setQuery] = useState('');
  const hasPaid = items.some((i) => (i.metrics?.paid?.count ?? 0) > 0);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => !q || (i.subdomain ?? '').toLowerCase().includes(q)).sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortKey, sortDir, query]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'subdomain' ? 'asc' : 'desc'); }
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

  return (
    <div>
      {items.length > 8 && (
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-end">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter subdomains…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" />
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <Header label="Subdomain" sortK="subdomain" align="left" className="!px-6" />
              <Header label="Keywords" hint={METRIC_HINTS.rankedKeywords} sortK="keywords" align="right" />
              <Header label="Top 10" hint="Keywords in positions 1–10 (top 3 in brackets)." sortK="top10" align="right" className="hidden sm:table-cell" />
              <Header label="Traffic" hint={METRIC_HINTS.etv} sortK="traffic" align="right" />
              <th title={METRIC_HINTS.subdomainShare} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell w-36">
                <span className="underline decoration-dotted decoration-slate-300 underline-offset-[3px] cursor-help">Share</span>
              </th>
              <Header label="Movements" hint="Keywords new / up / down / lost since the previous check. Sorting uses the net balance." sortK="net" align="center" className="hidden lg:table-cell" />
              <Header label="Value" hint={METRIC_HINTS.trafficValue} sortK="traffic_cost" align="right" className="hidden xl:table-cell" />
              {hasPaid && <Header label="Ads KWs" hint={METRIC_HINTS.paidKeywords} sortK="paid" align="right" className="hidden xl:table-cell" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {sorted.map((item, i) => {
              const org = item.metrics?.organic;
              const etv = org?.etv ?? 0;
              const share = totalEtv > 0 ? (etv / totalEtv) * 100 : 0;
              const rkHref = `/dashboard/ranked-keywords?${new URLSearchParams({ target: item.subdomain ?? '', location, language, prefill: '1' })}`;
              return (
                <tr key={item.subdomain ?? i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-3 max-w-[260px]">
                    <a href={`https://${item.subdomain}`} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-blue-600 dark:text-blue-400 hover:underline truncate block">{item.subdomain ?? '—'}</a>
                    <a href={rkHref} className="text-[10px] font-bold text-slate-400 hover:text-blue-600">Ranked keywords →</a>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">{fmt(org?.count)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums hidden sm:table-cell">
                    {fmt(top10(org))} <span className="text-slate-400 text-[11px]">({fmt(top3(org))})</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900 dark:text-white tabular-nums font-bold">{fmt(etv)}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(100, share)}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-500 tabular-nums">{share < 0.1 && share > 0 ? '<0.1' : share.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-[11px] tabular-nums hidden lg:table-cell whitespace-nowrap"
                    title={`${fmt(org?.is_new)} new · ${fmt(org?.is_up)} up · ${fmt(org?.is_down)} down · ${fmt(org?.is_lost)} lost`}>
                    <span className="text-blue-600">+{compact(org?.is_new)}</span>{' '}
                    <span className="text-emerald-600">▲{compact(org?.is_up)}</span>{' '}
                    <span className="text-red-500">▼{compact(org?.is_down)}</span>
                    {(org?.is_lost ?? 0) > 0 && <>{' '}<span className="text-slate-400">−{compact(org?.is_lost)}</span></>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden xl:table-cell">
                    {org?.estimated_paid_traffic_cost != null ? `$${Math.round(org.estimated_paid_traffic_cost).toLocaleString('en-GB')}` : '—'}
                  </td>
                  {hasPaid && <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden xl:table-cell">{fmt(item.metrics?.paid?.count)}</td>}
                </tr>
              );
            })}
            {sorted.length === 0 && <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-400">No subdomain matches.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
