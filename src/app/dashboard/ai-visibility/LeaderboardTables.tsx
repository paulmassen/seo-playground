'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from 'lucide-react';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import ExportCSVButton from '@/components/ExportCSVButton';
import { labsLocationLabel } from '@/lib/geo-options';
import type { AggMetric, AggregatedMetrics, LeaderboardItem } from './page';

type SortKey = 'name' | 'mentions' | 'volume';
type SortDir = 'asc' | 'desc';

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }

function sortValue(item: LeaderboardItem, key: SortKey, nameOf: (i: LeaderboardItem) => string): number | string {
  switch (key) {
    case 'name': return nameOf(item).toLowerCase();
    case 'mentions': return item.total?.mentions ?? -1;
    case 'volume': return item.total?.ai_search_volume ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-violet-600" /> : <ArrowDown className="w-3 h-3 text-violet-600" />;
}

const METRIC_GROUPS: Array<{ key: Exclude<keyof LeaderboardItem, 'domain' | 'brand' | 'total'>; label: string; location?: boolean }> = [
  { key: 'location', label: 'Location', location: true },
  { key: 'language', label: 'Language' },
  { key: 'platform', label: 'Platform' },
  { key: 'sources_domain', label: 'Source domains' },
  { key: 'search_results_domain', label: 'Search-result domains' },
  { key: 'brand_entities_title', label: 'Brand entities' },
  { key: 'brand_entities_category', label: 'Brand categories' },
];

function MetricGroup({ label, items, isLocation = false }: { label: string; items?: AggMetric[]; isLocation?: boolean }) {
  if (!items?.length) return null;
  return (
    <section className="border-t border-slate-100 dark:border-slate-800 pt-3 first:border-t-0 first:pt-0">
      <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">{label}</h4>
      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div key={`${item.key}-${index}`} className="flex items-start justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{isLocation ? labsLocationLabel(item.key) : String(item.key)}</span>
            <span className="shrink-0 font-mono text-[10px] text-slate-500 tabular-nums">
              {fmt(item.mentions)} · {fmt(item.ai_search_volume)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ItemDetails({ item }: { item: LeaderboardItem }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4 py-4">
      {METRIC_GROUPS.map((group) => (
        <MetricGroup key={group.key} label={group.label} items={item[group.key]} isLocation={group.location} />
      ))}
    </div>
  );
}

function AggregatePanel({ title, metrics, totalCount }: { title: string; metrics?: AggregatedMetrics; totalCount?: number }) {
  if (!metrics) return null;
  return (
    <details className="group border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/70 dark:bg-slate-900/50" open>
      <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-3 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">
        <ChevronDown className="w-4 h-4 text-violet-500 transition-transform group-open:rotate-180" />
        {title}
        {totalCount !== undefined && <span className="ml-auto font-mono text-[10px] normal-case tracking-normal text-slate-400">{fmt(totalCount)} results</span>}
      </summary>
      <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4">
        {METRIC_GROUPS.map((group) => (
          <MetricGroup key={group.key} label={group.label} items={metrics[group.key]} isLocation={group.location} />
        ))}
      </div>
    </details>
  );
}

function LeaderboardTable({
  title, items, nameLabel, nameOf, filenamePrefix,
}: {
  title: string;
  items: LeaderboardItem[];
  nameLabel: string;
  nameOf: (i: LeaderboardItem) => string;
  filenamePrefix: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('mentions');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<number | null>(null);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const va = sortValue(a, sortKey, nameOf);
      const vb = sortValue(b, sortKey, nameOf);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortKey, sortDir, nameOf]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function Header({ label, sortK, align }: { label: string; sortK: SortKey; align: 'left' | 'right' }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left !px-6' : 'text-right'}`}
        onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((item) => ({
    [nameLabel.toLowerCase()]: nameOf(item),
    mentions: item.total?.mentions ?? '',
    ai_search_volume: item.total?.ai_search_volume ?? '',
  }));
  const columns = [
    { key: nameLabel.toLowerCase(), label: nameLabel },
    { key: 'mentions', label: 'Mentions' },
    { key: 'ai_search_volume', label: 'AI Search Volume' },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">{title}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-slate-400">{items.length}</span>
          {items.length > 0 && (
            <>
              <CopyMarkdownButton data={csvData} columns={columns} />
              <ExportCSVButton data={csvData} filename={`${filenamePrefix}.csv`} columns={columns} />
            </>
          )}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-slate-400">No results found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <Header label={nameLabel} sortK="name" align="left" />
                <Header label="Mentions" sortK="mentions" align="right" />
                <Header label="AI Search Volume" sortK="volume" align="right" />
              </tr>
            </thead>
            {sorted.map((item, i) => {
                const isExpanded = expanded === i;
                const hasDetails = METRIC_GROUPS.some((group) => item[group.key]?.length);
                return (
                  <tbody key={i} className="border-b border-slate-50 dark:border-slate-800 last:border-b-0">
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-200 max-w-[240px]">
                        {hasDetails ? (
                          <button type="button" onClick={() => setExpanded(isExpanded ? null : i)} className="w-full flex items-center gap-2 text-left group">
                            <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            <span className="truncate">{nameOf(item)}</span>
                          </button>
                        ) : <span className="truncate block">{nameOf(item)}</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">{fmt(item.total?.mentions)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">{fmt(item.total?.ai_search_volume)}</td>
                    </tr>
                    {isExpanded && hasDetails && (
                      <tr className="bg-slate-50/70 dark:bg-slate-950/30">
                        <td colSpan={3} className="px-6"><ItemDetails item={item} /></td>
                      </tr>
                    )}
                  </tbody>
                );
            })}
          </table>
        </div>
      )}
    </div>
  );
}

export default function LeaderboardTables({
  domains, brands, domainAggregates, brandAggregates, domainsTotalCount, brandsTotalCount, topic,
}: {
  domains: LeaderboardItem[];
  brands: LeaderboardItem[];
  domainAggregates?: AggregatedMetrics;
  brandAggregates?: AggregatedMetrics;
  domainsTotalCount?: number;
  brandsTotalCount?: number;
  topic: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeaderboardTable
          title="Top Mentioned Domains"
          items={domains}
          nameLabel="Domain"
          nameOf={(i) => i.domain ?? '—'}
          filenamePrefix={`ai-visibility-domains-${topic}`}
        />
        <LeaderboardTable
          title="Top Mentioned Brands"
          items={brands}
          nameLabel="Brand"
          nameOf={(i) => i.brand ?? '—'}
          filenamePrefix={`ai-visibility-brands-${topic}`}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AggregatePanel title="Domain leaderboard dataset" metrics={domainAggregates} totalCount={domainsTotalCount} />
        <AggregatePanel title="Brand leaderboard dataset" metrics={brandAggregates} totalCount={brandsTotalCount} />
      </div>
    </div>
  );
}
