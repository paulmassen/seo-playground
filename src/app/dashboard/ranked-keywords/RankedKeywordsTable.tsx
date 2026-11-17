'use client';

import { METRIC_HINTS } from '@/lib/metric-glossary';
import { Fragment, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { movementOf, pagePath, rankDelta, SERP_FEATURE_LABELS, type Movement, type RankedKwItem } from './types';

type SortKey = 'position' | 'change' | 'keyword' | 'volume' | 'etv' | 'kd' | 'intent' | 'cpc';
type SortDir = 'asc' | 'desc';
type Quick = 'all' | 'top3' | 'striking' | 'page2' | 'up' | 'down' | 'new' | 'lost' | 'featured';
type View = 'keywords' | 'pages';

function DifficultyBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-slate-300">—</span>;
  const color = value >= 70 ? 'text-red-600 bg-red-50' : value >= 40 ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50';
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-black tabular-nums ${color}`}>{value}</span>;
}

function IntentBadge({ value }: { value?: string }) {
  if (!value) return <span className="text-slate-300">—</span>;
  const map: Record<string, string> = {
    informational: 'text-blue-600 bg-blue-50',
    navigational: 'text-violet-600 bg-violet-50',
    transactional: 'text-emerald-600 bg-emerald-50',
    commercial: 'text-amber-600 bg-amber-50',
  };
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${map[value] ?? 'text-slate-500 bg-slate-100'}`}>{value.slice(0, 4)}</span>;
}

function PositionBadge({ pos }: { pos?: number }) {
  if (!pos) return <span className="text-slate-300">—</span>;
  const color = pos <= 3 ? 'bg-emerald-500 text-white' : pos <= 10 ? 'bg-blue-500 text-white' : pos <= 20 ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500';
  return <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-black ${color}`}>{pos}</span>;
}

function ChangeBadge({ item }: { item: RankedKwItem }) {
  const m = movementOf(item);
  if (m === 'new') return <span className="text-[9px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">new</span>;
  if (m === 'lost') return <span className="text-[9px] font-black uppercase text-red-600 bg-red-50 px-1.5 py-0.5 rounded">lost</span>;
  const d = rankDelta(item);
  if (!d) return <span className="text-slate-300 text-xs">—</span>;
  const it = item.ranked_serp_element?.serp_item;
  // Absolute positions count ads, maps, AI overview…: a drop can come from a new SERP feature above an unchanged #1.
  const title = `Absolute position (all SERP elements): #${it?.rank_changes?.previous_rank_absolute} → #${it?.rank_absolute}`;
  return <span title={title} className={`text-xs font-black tabular-nums cursor-help ${d > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>;
}

const pos = (i: RankedKwItem) => i.ranked_serp_element?.serp_item?.rank_group ?? 999;
const etvOf = (i: RankedKwItem) => i.ranked_serp_element?.serp_item?.etv ?? 0;

function sortValue(item: RankedKwItem, key: SortKey): number | string {
  switch (key) {
    case 'position': return item.ranked_serp_element?.serp_item?.rank_group ?? Number.MAX_SAFE_INTEGER;
    case 'change': return rankDelta(item) ?? (movementOf(item) === 'new' ? 1000 : movementOf(item) === 'lost' ? -1000 : 0);
    case 'keyword': return item.keyword_data?.keyword?.toLowerCase() ?? '';
    case 'volume': return item.keyword_data?.keyword_info?.search_volume ?? -1;
    case 'etv': return etvOf(item);
    case 'kd': return item.keyword_data?.keyword_properties?.keyword_difficulty ?? -1;
    case 'intent': return item.keyword_data?.search_intent_info?.main_intent ?? '';
    case 'cpc': return item.keyword_data?.keyword_info?.cpc ?? -1;
  }
}

function matches(item: RankedKwItem, quick: Quick): boolean {
  const p = pos(item);
  const m: Movement = movementOf(item);
  switch (quick) {
    case 'all': return true;
    case 'top3': return p <= 3;
    case 'striking': return p >= 4 && p <= 20;
    case 'page2': return p >= 11 && p <= 20;
    case 'up': return m === 'up';
    case 'down': return m === 'down';
    case 'new': return m === 'new';
    case 'lost': return m === 'lost';
    case 'featured': return !!item.ranked_serp_element?.serp_item?.is_featured_snippet || item.ranked_serp_element?.serp_item?.type === 'featured_snippet';
  }
}

const QUICK: Array<{ value: Quick; label: string; hint?: string }> = [
  { value: 'all', label: 'All' },
  { value: 'top3', label: 'Top 3' },
  { value: 'striking', label: 'Striking distance', hint: 'Positions 4–20: close to the top' },
  { value: 'page2', label: 'Page 2' },
  { value: 'up', label: 'Improved' },
  { value: 'down', label: 'Declined' },
  { value: 'new', label: 'New' },
  { value: 'lost', label: 'Lost' },
  { value: 'featured', label: 'Featured snippet' },
];

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

function Features({ item }: { item: RankedKwItem }) {
  const types = (item.ranked_serp_element?.serp_item_types ?? item.keyword_data?.serp_info?.serp_item_types ?? [])
    .filter((t) => SERP_FEATURE_LABELS[t]);
  if (types.length === 0) return null;
  return (
    <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[320px]" title={`SERP also shows: ${types.map((t) => SERP_FEATURE_LABELS[t]).join(', ')}`}>
      {types.map((t) => SERP_FEATURE_LABELS[t]).join(' · ')}
    </p>
  );
}

interface PageGroup { path: string; url: string; items: RankedKwItem[]; etv: number; top10: number; best: number }

export default function RankedKeywordsTable({ items, showType = false }: { items: RankedKwItem[]; showType?: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [query, setQuery] = useState('');
  const [quick, setQuick] = useState<Quick>('all');
  const [view, setView] = useState<View>('keywords');
  const [openPage, setOpenPage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => matches(i, quick)
      && (!q || (i.keyword_data?.keyword ?? '').toLowerCase().includes(q) || pagePath(i).toLowerCase().includes(q)));
  }, [items, query, quick]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const pages = useMemo(() => {
    const map = new Map<string, PageGroup>();
    for (const i of filtered) {
      const path = pagePath(i) || '(unknown)';
      const g = map.get(path) ?? { path, url: i.ranked_serp_element?.serp_item?.url ?? '', items: [], etv: 0, top10: 0, best: 999 };
      g.items.push(i);
      g.etv += etvOf(i);
      if (pos(i) <= 10) g.top10 += 1;
      g.best = Math.min(g.best, pos(i));
      map.set(path, g);
    }
    return [...map.values()].sort((a, b) => b.etv - a.etv);
  }, [filtered]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'position' || key === 'keyword' || key === 'kd' ? 'asc' : 'desc'); }
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

  const counts = useMemo(() => Object.fromEntries(QUICK.map((o) => [o.value, items.filter((i) => matches(i, o.value)).length])) as Record<Quick, number>, [items]);

  return (
    <div>
      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
            {(['keywords', 'pages'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1 rounded-md text-[11px] font-black uppercase tracking-widest ${view === v ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                {v === 'keywords' ? 'By keyword' : 'By page'}
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter keyword or URL…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-52" />
          </div>
          {filtered.length !== items.length && <span className="text-[11px] text-slate-400">{filtered.length} / {items.length}</span>}
        </div>
        <div className="flex gap-1 flex-wrap">
          {QUICK.filter((o) => o.value === 'all' || counts[o.value] > 0).map((o) => (
            <button key={o.value} title={o.hint} onClick={() => setQuick(o.value)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${quick === o.value
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}>
              {o.label} <span className="opacity-60 tabular-nums">{counts[o.value]}</span>
            </button>
          ))}
        </div>
      </div>

      {view === 'keywords' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <Header label="Pos." hint={METRIC_HINTS.position} sortK="position" align="center" className="w-12" />
                <Header label="Change" hint={METRIC_HINTS.rankChange} sortK="change" align="center" className="w-16" />
                <Header label="Keyword" sortK="keyword" align="left" />
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hidden lg:table-cell">URL</th>
                <Header label="Vol." hint={METRIC_HINTS.volume} sortK="volume" align="right" />
                <Header label="Traffic" hint={METRIC_HINTS.keywordEtv} sortK="etv" align="right" />
                <Header label="KD" hint={METRIC_HINTS.kd} sortK="kd" align="center" />
                <Header label="Intent" hint={METRIC_HINTS.intent} sortK="intent" align="center" className="hidden sm:table-cell" />
                <Header label="CPC" hint={METRIC_HINTS.cpc} sortK="cpc" align="right" className="hidden xl:table-cell" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {sorted.map((item, i) => {
                const kw = item.keyword_data;
                const serp = item.ranked_serp_element?.serp_item;
                const url = serp?.url ?? '';
                return (
                  <tr key={`${kw?.keyword}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 text-center"><PositionBadge pos={serp?.rank_group} /></td>
                    <td className="px-4 py-3 text-center"><ChangeBadge item={item} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 dark:text-white">{kw?.keyword ?? '—'}</span>
                        {serp?.is_featured_snippet && <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded shrink-0">featured</span>}
                        {showType && serp?.type && serp.type !== 'organic' && <span className="text-[9px] font-black uppercase tracking-widest text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded shrink-0">{serp.type.replace(/_/g, ' ')}</span>}
                      </div>
                      <Features item={item} />
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" title={url}
                          className="text-[11px] font-mono text-slate-400 hover:text-blue-600 truncate max-w-[220px] block transition-colors">{pagePath(item)}</a>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">{kw?.keyword_info?.search_volume?.toLocaleString('en-GB') ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">{serp?.etv != null ? Math.round(serp.etv).toLocaleString('en-GB') : '—'}</td>
                    <td className="px-4 py-3 text-center"><DifficultyBadge value={kw?.keyword_properties?.keyword_difficulty} /></td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell"><IntentBadge value={kw?.search_intent_info?.main_intent} /></td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums hidden xl:table-cell">{kw?.keyword_info?.cpc != null ? `$${kw.keyword_info.cpc.toFixed(2)}` : '—'}</td>
                  </tr>
                );
              })}
              {sorted.length === 0 && <tr><td colSpan={9} className="px-6 py-10 text-center text-sm text-slate-400">No keyword matches these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-6 py-3 text-left">Page</th>
                <th className="px-4 py-3 text-right">Keywords</th>
                <th className="px-4 py-3 text-right">Top 10</th>
                <th className="px-4 py-3 text-right">Best pos.</th>
                <th className="px-4 py-3 text-right" title={METRIC_HINTS.keywordEtv}>Traffic</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Top keyword</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {pages.map((g) => {
                const top = [...g.items].sort((a, b) => etvOf(b) - etvOf(a))[0];
                const open = openPage === g.path;
                return (
                  <Fragment key={g.path}>
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => setOpenPage(open ? null : g.path)}>
                      <td className="px-6 py-3 max-w-[340px]">
                        <span className="text-slate-400 mr-1.5 text-xs">{open ? '▾' : '▸'}</span>
                        <span className="font-mono text-xs text-slate-800 dark:text-slate-200 break-all">{g.path}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{g.items.length}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{g.top10}</td>
                      <td className="px-4 py-3 text-right"><PositionBadge pos={g.best === 999 ? undefined : g.best} /></td>
                      <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">{Math.round(g.etv).toLocaleString('en-GB')}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell truncate max-w-[220px]">{top?.keyword_data?.keyword}</td>
                    </tr>
                    {open && [...g.items].sort((a, b) => etvOf(b) - etvOf(a)).map((item, k) => (
                      <tr key={`${g.path}-${k}`} className="bg-slate-50/60 dark:bg-slate-800/30 text-xs">
                        <td className="pl-12 pr-4 py-2 text-slate-700 dark:text-slate-300">{item.keyword_data?.keyword}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-500">{item.keyword_data?.keyword_info?.search_volume?.toLocaleString('en-GB') ?? '—'}</td>
                        <td className="px-4 py-2 text-right"><ChangeBadge item={item} /></td>
                        <td className="px-4 py-2 text-right font-mono">#{pos(item)}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-500">{Math.round(etvOf(item)).toLocaleString('en-GB')}</td>
                        <td className="hidden md:table-cell" />
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              {pages.length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">No page matches these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
