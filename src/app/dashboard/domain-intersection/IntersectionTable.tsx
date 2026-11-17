'use client';

import { METRIC_HINTS } from '@/lib/metric-glossary';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';

interface SerpElement {
  type?: string;
  rank_group?: number;
  rank_absolute?: number;
  url?: string;
  etv?: number;
}

export interface IntersectionItem {
  keyword_data: {
    keyword: string;
    location_code: number;
    language_code: string;
    keyword_info?: {
      search_volume?: number;
      competition?: number;
      cpc?: number;
    };
    keyword_properties?: {
      keyword_difficulty?: number;
    };
    search_intent_info?: {
      main_intent?: string;
    };
  };
  first_domain_serp_element?: SerpElement;
  second_domain_serp_element?: SerpElement;
}

type SortKey = 'keyword' | 'volume' | 'kd' | 'cpc' | 'pos1' | 'pos2' | 'gap' | 'etv1';
type SortDir = 'asc' | 'desc';
type Quick = 'all' | 'd1_ahead' | 'd2_ahead' | 'd1_page1_only' | 'd2_page1_only' | 'easy';

/** Organic position within organic results (rank_group); falls back to the absolute rank on old saves. */
function pos(e?: SerpElement) {
  return e?.rank_group ?? e?.rank_absolute;
}

function PosBadge({ pos }: { pos: number | undefined }) {
  if (!pos) return <span className="text-slate-300">—</span>;
  const cls = pos <= 3 ? 'text-emerald-600 font-black' : pos <= 10 ? 'text-blue-600 font-bold' : 'text-slate-500';
  return <span className={`font-mono tabular-nums text-xs ${cls}`}>#{pos}</span>;
}

function KdBadge({ kd }: { kd: number | undefined }) {
  if (kd === undefined || kd === null) return <span className="text-slate-300">—</span>;
  const cls = kd >= 70 ? 'bg-red-50 text-red-500 border-red-200' : kd >= 40 ? 'bg-yellow-50 text-yellow-600 border-yellow-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200';
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-black border ${cls}`}>{kd}</span>;
}

function GapBadge({ gap }: { gap: number | null }) {
  if (gap === null) return <span className="text-slate-300">—</span>;
  if (gap === 0) return <span className="text-slate-400 font-mono text-xs">0</span>;
  const cls = gap > 0 ? 'text-emerald-600' : 'text-red-500';
  return <span className={`font-mono tabular-nums text-xs font-bold ${cls}`}>{gap > 0 ? `+${gap}` : gap}</span>;
}

const INTENT_CLS: Record<string, string> = {
  informational: 'text-blue-600 bg-blue-50',
  navigational: 'text-violet-600 bg-violet-50',
  commercial: 'text-amber-600 bg-amber-50',
  transactional: 'text-emerald-600 bg-emerald-50',
};

function urlPath(url?: string) {
  if (!url) return '';
  try { const u = new URL(url); return `${u.pathname}${u.search}`; } catch { return url; }
}

function gapOf(item: IntersectionItem): number | null {
  const p1 = pos(item.first_domain_serp_element);
  const p2 = pos(item.second_domain_serp_element);
  return p1 && p2 ? p2 - p1 : null;
}

function sortValue(item: IntersectionItem, key: SortKey): number | string {
  switch (key) {
    case 'keyword': return item.keyword_data.keyword.toLowerCase();
    case 'volume': return item.keyword_data.keyword_info?.search_volume ?? -1;
    case 'kd': return item.keyword_data.keyword_properties?.keyword_difficulty ?? -1;
    case 'cpc': return item.keyword_data.keyword_info?.cpc ?? -1;
    case 'pos1': return pos(item.first_domain_serp_element) ?? 1e9;
    case 'pos2': return pos(item.second_domain_serp_element) ?? 1e9;
    case 'gap': return gapOf(item) ?? -1e9;
    case 'etv1': return item.first_domain_serp_element?.etv ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

function matchesQuick(item: IntersectionItem, quick: Quick): boolean {
  const p1 = pos(item.first_domain_serp_element) ?? 999;
  const p2 = pos(item.second_domain_serp_element) ?? 999;
  switch (quick) {
    case 'all': return true;
    case 'd1_ahead': return p1 < p2;
    case 'd2_ahead': return p2 < p1;
    case 'd1_page1_only': return p1 <= 10 && p2 > 10;
    case 'd2_page1_only': return p2 <= 10 && p1 > 10;
    case 'easy': return (item.keyword_data.keyword_properties?.keyword_difficulty ?? 100) < 30;
  }
}

export default function IntersectionTable({
  items, target1, target2, mode = 'shared',
}: { items: IntersectionItem[]; target1: string; target2: string; mode?: 'shared' | 'gap' }) {
  const gapMode = mode === 'gap';
  const [sortKey, setSortKey] = useState<SortKey>('volume');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [query, setQuery] = useState('');
  const [quick, setQuick] = useState<Quick>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => matchesQuick(i, quick) && (!q || i.keyword_data.keyword.toLowerCase().includes(q)));
  }, [items, query, quick]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb))
        : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(['keyword', 'kd', 'pos1', 'pos2'].includes(key) ? 'asc' : 'desc'); }
  }

  function Header({ label, sortK, align, className, hint }: { label: string; sortK: SortKey; align: 'left' | 'center' | 'right'; className?: string; hint?: string }) {
    const active = sortKey === sortK;
    return (
      <th title={hint} className={`px-3 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? ''}`}
          onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : align === 'center' ? 'justify-center' : ''}`}>
          <span className={hint ? 'underline decoration-dotted decoration-slate-300 dark:decoration-slate-600 underline-offset-[3px] cursor-help' : undefined}>{label}</span>
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((i) => ({
    keyword: i.keyword_data.keyword,
    volume: i.keyword_data.keyword_info?.search_volume ?? '',
    kd: i.keyword_data.keyword_properties?.keyword_difficulty ?? '',
    cpc: i.keyword_data.keyword_info?.cpc ?? '',
    intent: i.keyword_data.search_intent_info?.main_intent ?? '',
    pos_target1: pos(i.first_domain_serp_element) ?? '',
    url_target1: i.first_domain_serp_element?.url ?? '',
    etv_target1: i.first_domain_serp_element?.etv != null ? Math.round(i.first_domain_serp_element.etv) : '',
    pos_target2: pos(i.second_domain_serp_element) ?? '',
    url_target2: i.second_domain_serp_element?.url ?? '',
  }));

  const csvColumns = [
    { key: 'keyword', label: 'Keyword' },
    { key: 'volume', label: 'Volume' },
    { key: 'kd', label: 'KD' },
    { key: 'cpc', label: 'CPC' },
    { key: 'intent', label: 'Intent' },
    { key: 'pos_target1', label: `Pos ${target1}` },
    { key: 'url_target1', label: `URL ${target1}` },
    { key: 'etv_target1', label: `Traffic ${target1}` },
    ...(gapMode ? [] : [
      { key: 'pos_target2', label: `Pos ${target2}` },
      { key: 'url_target2', label: `URL ${target2}` },
    ]),
  ];

  const quickOptions: Array<{ value: Quick; label: string }> = gapMode
    ? [
      { value: 'all', label: 'All' },
      { value: 'easy', label: 'KD < 30' },
    ]
    : [
      { value: 'all', label: 'All' },
      { value: 'd1_ahead', label: 'D1 ahead' },
      { value: 'd2_ahead', label: 'D2 ahead' },
      { value: 'd1_page1_only', label: 'Only D1 on page 1' },
      { value: 'd2_page1_only', label: 'Only D2 on page 1' },
      { value: 'easy', label: 'KD < 30' },
    ];

  const quickCount = (qv: Quick) => items.filter((i) => matchesQuick(i, qv)).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {quickOptions.map((o) => (
            <button key={o.value} onClick={() => setQuick(o.value)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${quick === o.value
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}>
              {o.label} <span className="opacity-60 tabular-nums">{quickCount(o.value)}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter keywords…"
            className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-44" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 -mt-1">
        <CopyMarkdownButton data={csvData} columns={csvColumns} />
        <ExportCSVButton data={csvData} filename={`${gapMode ? 'keyword-gap' : 'intersection'}-${target1}-${target2}.csv`} columns={csvColumns} />
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <Header label="Keyword" sortK="keyword" align="left" className="!px-5" />
              <Header label="Vol." hint={METRIC_HINTS.volume} sortK="volume" align="right" />
              <Header label="KD" hint={METRIC_HINTS.kd} sortK="kd" align="center" />
              <Header label="CPC" hint={METRIC_HINTS.cpc} sortK="cpc" align="right" className="hidden 2xl:table-cell" />
              <Header label="D1" hint={`${target1}: ${METRIC_HINTS.position}`} sortK="pos1" align="center" className="!text-blue-400" />
              {gapMode
                ? <Header label="D1 traffic" hint={METRIC_HINTS.etv} sortK="etv1" align="right" />
                : (
                  <>
                    <Header label="D2" hint={`${target2}: ${METRIC_HINTS.position}`} sortK="pos2" align="center" />
                    <Header label="Gap" hint={METRIC_HINTS.positionGap} sortK="gap" align="center" />
                  </>
                )}
              <th className="px-3 py-3.5 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hidden lg:table-cell">
                {gapMode ? 'D1 page' : 'Pages (D1 / D2)'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {sorted.map((item, i) => {
              const intent = item.keyword_data.search_intent_info?.main_intent;
              const u1 = item.first_domain_serp_element?.url;
              const u2 = item.second_domain_serp_element?.url;
              return (
                <tr key={`${item.keyword_data.keyword}-${i}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-3">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{item.keyword_data.keyword}</span>
                    {intent && <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${INTENT_CLS[intent] ?? 'text-slate-500 bg-slate-100'}`}>{intent.slice(0, 5)}</span>}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-500 dark:text-slate-400">
                    {(item.keyword_data.keyword_info?.search_volume ?? 0).toLocaleString('en-GB')}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <KdBadge kd={item.keyword_data.keyword_properties?.keyword_difficulty} />
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-slate-400 hidden 2xl:table-cell">
                    {item.keyword_data.keyword_info?.cpc != null ? `$${item.keyword_data.keyword_info.cpc.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <PosBadge pos={pos(item.first_domain_serp_element)} />
                  </td>
                  {gapMode ? (
                    <td className="px-3 py-3 text-right font-mono text-slate-500">
                      {item.first_domain_serp_element?.etv != null ? Math.round(item.first_domain_serp_element.etv).toLocaleString('en-GB') : '—'}
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-3 text-center"><PosBadge pos={pos(item.second_domain_serp_element)} /></td>
                      <td className="px-3 py-3 text-center"><GapBadge gap={gapOf(item)} /></td>
                    </>
                  )}
                  <td className="px-3 py-3 hidden lg:table-cell max-w-[180px]">
                    {u1 && <a href={u1} target="_blank" rel="noopener noreferrer" className="block truncate font-mono text-[11px] text-blue-500 hover:text-blue-700" title={u1}>{urlPath(u1)}</a>}
                    {!gapMode && u2 && <a href={u2} target="_blank" rel="noopener noreferrer" className="block truncate font-mono text-[11px] text-slate-400 hover:text-slate-700" title={u2}>{urlPath(u2)}</a>}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-400">No keyword matches these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
