'use client';

import { METRIC_HINTS } from '@/lib/metric-glossary';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { ageYears, daysUntil, fmtDate, parseApiDate, type WhoisResult } from './whois-shared';

type SortKey = 'domain' | 'expires' | 'created' | 'etv' | 'keywords' | 'rd' | 'backlinks';
type SortDir = 'asc' | 'desc';

function sortValue(i: WhoisResult, k: SortKey): number | string {
  switch (k) {
    case 'domain': return i.domain ?? '';
    case 'expires': return parseApiDate(i.expiration_datetime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    case 'created': return parseApiDate(i.created_datetime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    case 'etv': return i.metrics?.organic?.etv ?? -1;
    case 'keywords': return i.metrics?.organic?.count ?? -1;
    case 'rd': return i.backlinks_info?.referring_domains ?? -1;
    case 'backlinks': return i.backlinks_info?.backlinks ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

function n(v?: number) { return v == null ? '—' : Math.round(v).toLocaleString('en-GB'); }

function qs(p: Record<string, string>) { return new URLSearchParams({ ...p, prefill: '1' }).toString(); }

export default function WhoisFindTable({ items }: { items: WhoisResult[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => (i.domain ?? '').includes(q) || (i.registrar ?? '').toLowerCase().includes(q)) : items;
  }, [items, query]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' ? va.localeCompare(String(vb)) : (va as number) - (vb as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  function toggle(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'domain' || k === 'expires' || k === 'created' ? 'asc' : 'desc'); }
  }

  function Header({ label, k, hint, className, left }: { label: string; k: SortKey; hint?: string; className?: string; left?: boolean }) {
    return (
      <th title={hint} onClick={() => toggle(k)}
        className={`px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 whitespace-nowrap ${left ? 'text-left' : 'text-right'} ${className ?? ''}`}>
        <span className={`inline-flex items-center gap-1 ${left ? '' : 'flex-row-reverse'}`}>
          <span className={hint ? 'underline decoration-dotted decoration-slate-300 underline-offset-[3px] cursor-help' : undefined}>{label}</span>
          <SortIcon active={sortKey === k} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((i) => ({
    domain: i.domain ?? '', registrar: i.registrar ?? '', registered: i.registered ? 'yes' : 'no',
    created: i.created_datetime?.slice(0, 10) ?? '', expires: i.expiration_datetime?.slice(0, 10) ?? '',
    keywords: i.metrics?.organic?.count ?? '', etv: i.metrics?.organic?.etv != null ? Math.round(i.metrics.organic.etv) : '',
    paid_keywords: i.metrics?.paid?.count ?? '', referring_domains: i.backlinks_info?.referring_domains ?? '',
    backlinks: i.backlinks_info?.backlinks ?? '', epp: (i.epp_status_codes ?? []).join(' '),
  }));
  const csvColumns = [
    { key: 'domain', label: 'Domain' }, { key: 'registrar', label: 'Registrar' }, { key: 'registered', label: 'Registered' },
    { key: 'created', label: 'Created' }, { key: 'expires', label: 'Expires' }, { key: 'keywords', label: 'Keywords' },
    { key: 'etv', label: 'Organic ETV' }, { key: 'paid_keywords', label: 'Paid keywords' },
    { key: 'referring_domains', label: 'Referring domains' }, { key: 'backlinks', label: 'Backlinks' }, { key: 'epp', label: 'EPP status' },
  ];

  return (
    <div>
      <div className="px-6 py-2.5 border-b border-slate-100 dark:border-slate-700 flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter domain or registrar…"
            className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
        </div>
        {filtered.length !== items.length && <span className="text-[11px] text-slate-400">{filtered.length} / {items.length}</span>}
        <span className="text-[11px] text-slate-400">Column sorting reorders this page only; the API sort decides which domains are fetched.</span>
        <div className="ml-auto flex items-center gap-2">
          <CopyMarkdownButton data={csvData} columns={csvColumns} />
          <ExportCSVButton data={csvData} filename="whois-domains.csv" columns={csvColumns} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
              <Header label="Domain" k="domain" left />
              <Header label="Expires" k="expires" hint="Registration expiry date. Red = within 30 days." />
              <Header label="Created" k="created" hint="First registration date; age in years below." className="hidden md:table-cell" />
              <Header label="Keywords" k="keywords" hint={METRIC_HINTS.rankedKeywords} />
              <Header label="ETV" k="etv" hint={METRIC_HINTS.etv} />
              <Header label="Ref. domains" k="rd" hint={METRIC_HINTS.refDomains} className="hidden lg:table-cell" />
              <Header label="Backlinks" k="backlinks" hint={METRIC_HINTS.backlinks} className="hidden xl:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
            {sorted.map((i) => {
              const d = daysUntil(i.expiration_datetime);
              const expCls = d === null ? 'text-slate-400' : d < 0 ? 'text-slate-400 line-through' : d < 30 ? 'text-red-600 font-bold' : d < 90 ? 'text-amber-600' : 'text-slate-600 dark:text-slate-300';
              const age = ageYears(i.created_datetime);
              const domain = i.domain ?? '';
              return (
                <tr key={domain} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors align-top">
                  <td className="px-3 py-2.5 pl-6">
                    <div className="flex items-center gap-2">
                      <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="font-mono font-bold text-xs text-slate-900 dark:text-white hover:text-blue-600">{domain}</a>
                      {i.registered === false && <span className="text-[9px] font-black uppercase text-red-600 bg-red-50 px-1.5 rounded">expired</span>}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[260px]">{i.registrar ?? 'Unknown registrar'}</div>
                    <div className="flex gap-2 mt-0.5 text-[10px] font-bold">
                      <a className="text-slate-400 hover:text-blue-600" href={`/dashboard/domain-analytics/whois?domain=${encodeURIComponent(domain)}`} title="Open the full Whois card (free: this result is reused)">Details</a>
                      <a className="text-slate-400 hover:text-blue-600" href={`/dashboard/backlinks?${qs({ target: domain })}`}>Backlinks</a>
                      <a className="text-slate-400 hover:text-blue-600" href={`/dashboard/historical-rank?${qs({ target: domain })}`}>History</a>
                    </div>
                  </td>
                  <td className={`px-3 py-2.5 text-right text-xs whitespace-nowrap ${expCls}`}>
                    {fmtDate(i.expiration_datetime)}
                    {d !== null && <div className="text-[10px] font-normal">{d >= 0 ? `in ${d}d` : `${-d}d ago`}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-slate-500 whitespace-nowrap hidden md:table-cell">
                    {fmtDate(i.created_datetime)}
                    {age !== null && <div className="text-[10px]">{age.toFixed(1)} y</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">{n(i.metrics?.organic?.count)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">{n(i.metrics?.organic?.etv)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums hidden lg:table-cell">{n(i.backlinks_info?.referring_domains)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums hidden xl:table-cell">{n(i.backlinks_info?.backlinks)}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-400">No domain matches this filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
