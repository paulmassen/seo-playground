'use client';

import { Fragment, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Search, X } from 'lucide-react';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import type { BacklinkItem } from './query';
import {
  applyFilters, EMPTY_FILTERS, EXPORT_COLUMNS, exportRow, FLAG_DEFS, flagCounts, groupLinks, kindCounts,
  linkKind, MARKDOWN_COLUMNS, normalizeUrl, SPAM_RISK, CROWDED_PAGE,
  type Flag, type GroupBy, type LinkGroup, type LocalFilters,
} from './links';

type View = 'list' | GroupBy;
type SortKey = 'dr' | 'pr' | 'spam' | 'kw' | 'source' | 'anchor' | 'seen';
type GroupSortKey = 'count' | 'best' | 'dofollow' | 'spam' | 'key' | 'seen';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 100;

// ---- Small display pieces ----

function RankBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>;
  // 0–100 scale (rank_scale: one_hundred).
  const color = value >= 50 ? 'bg-emerald-500 text-white' : value >= 25 ? 'bg-blue-500 text-white' : value >= 10 ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-400';
  return <span className={`inline-flex items-center justify-center min-w-8 h-5 px-1 rounded text-[10px] font-black tabular-nums ${color}`}>{value}</span>;
}

function SpamPill({ value }: { value?: number | null }) {
  if (value === undefined || value === null) return <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>;
  const color = value >= SPAM_RISK ? 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400'
    : value >= 25 ? 'text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400'
    : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400';
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-black tabular-nums ${color}`}>{value}</span>;
}

function Tag({ children, tone = 'slate', title }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'red' | 'blue' | 'amber' | 'violet'; title?: string }) {
  const tones = {
    slate: 'text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400',
    green: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400',
    red: 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400',
    blue: 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400',
    amber: 'text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-400',
    violet: 'text-violet-600 bg-violet-50 dark:bg-violet-950 dark:text-violet-400',
  };
  return <span title={title} className={`shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${tones[tone]}`}>{children}</span>;
}

function fmtDate(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s.replace(' +00:00', 'Z').replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function fmt(n?: number | null) {
  return n === undefined || n === null ? '—' : n.toLocaleString('en-GB');
}

function LinkBadges({ l }: { l: BacklinkItem }) {
  const kind = linkKind(l);
  const sponsored = l.attributes?.find((a) => a === 'sponsored' || a === 'ugc');
  return (
    <>
      <Tag tone={l.dofollow ? 'green' : 'slate'} title={(l.attributes ?? []).join(', ') || undefined}>{l.dofollow ? 'do' : sponsored ?? 'no'}</Tag>
      {kind !== 'anchor' && <Tag tone="violet">{kind}</Tag>}
      {l.is_new && <Tag tone="blue">new</Tag>}
      {l.is_lost && <Tag tone="red">lost</Tag>}
      {l.is_broken && <Tag tone="red" title={`Target answers ${l.url_to_status_code ?? '4xx/5xx'}`}>broken {l.url_to_status_code ?? ''}</Tag>}
      {l.is_indirect_link && <Tag tone="amber" title={(l.indirect_link_path ?? []).map((h) => `${h.type} → ${h.url}`).join('\n')}>{l.indirect_link_path?.[0]?.type ?? 'indirect'}</Tag>}
    </>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300 dark:text-slate-600" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
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

function compare(va: number | string, vb: number | string, dir: SortDir) {
  const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
  return dir === 'asc' ? cmp : -cmp;
}

function Th({ label, active, dir, onClick, align = 'left', className = '', title }: {
  label: string; active?: boolean; dir?: SortDir; onClick?: () => void; align?: 'left' | 'center' | 'right'; className?: string; title?: string;
}) {
  const alignCls = align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right';
  return (
    <th title={title} onClick={onClick}
      className={`px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none whitespace-nowrap ${onClick ? 'cursor-pointer hover:text-slate-600 dark:hover:text-slate-200' : ''} ${alignCls} ${className}`}>
      {onClick ? (
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          <span className={title ? 'underline decoration-dotted decoration-slate-300 dark:decoration-slate-600 underline-offset-[3px] cursor-help' : undefined}>{label}</span><SortIcon active={!!active} dir={dir ?? 'desc'} />
        </span>
      ) : <span className={title ? 'underline decoration-dotted decoration-slate-300 dark:decoration-slate-600 underline-offset-[3px] cursor-help' : undefined}>{label}</span>}
    </th>
  );
}

// ---- Detail panel (expanded row) ----

function Detail({ l }: { l: BacklinkItem }) {
  const kw = l.ranked_keywords_info;
  const platforms = (l.domain_from_platform_type ?? []).filter((p) => p !== 'unknown');
  const facts: [string, React.ReactNode][] = [
    ['Link rank passed', fmt(l.rank)],
    ['Source page rank', fmt(l.page_from_rank)],
    ['Page keywords', kw ? `${fmt(kw.page_from_keywords_count_top_3)} top 3 · ${fmt(kw.page_from_keywords_count_top_10)} top 10 · ${fmt(kw.page_from_keywords_count_top_100)} top 100` : '—'],
    ['External links on page', l.page_from_external_links !== undefined && l.page_from_external_links !== null
      ? <span className={l.page_from_external_links > CROWDED_PAGE ? 'text-amber-600 font-bold' : ''}>{fmt(l.page_from_external_links)}</span> : '—'],
    ['Same link on page', fmt(l.links_count)],
    ['Location in HTML', l.semantic_location || '—'],
    ['Attributes', (l.attributes ?? []).join(', ') || '—'],
    ['Country · language', `${l.domain_from_country || '—'} · ${l.page_from_language || '—'}`],
    ['Platform', platforms.join(', ') || '—'],
    ['Target status', l.url_to_status_code ? String(l.url_to_status_code) : '—'],
    ['First · last seen', `${fmtDate(l.first_seen)} · ${fmtDate(l.last_seen)}`],
    ['Original', l.original ? 'Yes, present at first crawl' : 'No, added later'],
  ];
  return (
    <div className="px-6 py-4 bg-slate-50/70 dark:bg-slate-800/40 space-y-3 text-xs">
      {(l.text_pre || l.text_post) && (
        <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2">Context</span>
          …{l.text_pre} <mark className="bg-yellow-100 dark:bg-yellow-900/60 text-slate-900 dark:text-slate-100 px-0.5 rounded">{l.anchor || l.alt || '[link]'}</mark> {l.text_post}…
        </p>
      )}
      {l.image_url && (
        <p className="text-slate-500"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2">Image</span>
          <a href={l.image_url} target="_blank" rel="noopener noreferrer" className="font-mono hover:text-blue-600 break-all">{l.image_url}</a>{l.alt ? ` (alt: ${l.alt})` : ''}</p>
      )}
      {l.is_indirect_link && (l.indirect_link_path?.length ?? 0) > 0 && (
        <div className="text-slate-500 dark:text-slate-400">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2">Indirect path</span>
          <span className="font-mono break-all">{l.url_to}</span>
          {l.indirect_link_path!.map((h, i) => (
            <span key={i} className="font-mono break-all"> <span className="text-amber-600">→ {h.type}{h.status_code ? ` ${h.status_code}` : ''} →</span> {h.url}</span>
          ))}
        </div>
      )}
      {l.url_to_redirect_target && (
        <p className="text-slate-500"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2">Redirects to</span><span className="font-mono break-all">{l.url_to_redirect_target}</span></p>
      )}
      <dl className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">{k}</dt>
            <dd className="text-slate-700 dark:text-slate-300 mt-0.5">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---- List view ----

function linkSortValue(l: BacklinkItem, key: SortKey): number | string {
  switch (key) {
    case 'dr': return l.domain_from_rank ?? -1;
    case 'pr': return l.page_from_rank ?? -1;
    case 'spam': return l.backlink_spam_score ?? -1;
    case 'kw': return l.ranked_keywords_info?.page_from_keywords_count_top_100 ?? -1;
    case 'source': return l.domain_from?.toLowerCase() ?? '';
    case 'anchor': return (l.anchor || l.alt || '').toLowerCase();
    case 'seen': return l.first_seen ?? '';
  }
}

function LinkRow({ l, open, onToggle, showGroupCount, onPickDomain }: {
  l: BacklinkItem; open: boolean; onToggle: () => void; showGroupCount: boolean; onPickDomain: (d: string) => void;
}) {
  const kw = l.ranked_keywords_info;
  return (
    <>
      <tr className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${l.is_broken || l.is_lost ? 'opacity-60' : ''} ${open ? 'bg-slate-50 dark:bg-slate-800/50' : ''}`} onClick={onToggle}>
        <td className="pl-3 pr-1 py-3 w-6"><ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} /></td>
        <td className="px-3 py-3 text-center"><RankBadge value={l.domain_from_rank} /></td>
        <td className="px-3 py-3 text-center hidden md:table-cell"><span className="text-xs font-mono text-slate-500 tabular-nums">{fmt(l.page_from_rank)}</span></td>
        <td className="px-3 py-3 max-w-[300px]">
          {l.page_from_title && <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate" title={l.page_from_title}>{l.page_from_title}</p>}
          <a href={l.url_from} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="text-[11px] font-mono text-slate-500 dark:text-slate-400 hover:text-blue-600 truncate block" title={l.url_from}>{l.url_from}</a>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
            <button type="button" onClick={(e) => { e.stopPropagation(); onPickDomain(l.domain_from ?? ''); }}
              className="hover:text-blue-600 hover:underline" title="Show only this domain">{l.domain_from}</button>
            {showGroupCount && (l.group_count ?? 0) > 1 && <span className="font-bold text-blue-600 dark:text-blue-400" title="Total links from this domain">· {fmt(l.group_count)} links</span>}
            {l.domain_from_country && l.domain_from_country !== 'WW' && <span>· {l.domain_from_country}</span>}
          </div>
        </td>
        <td className="px-3 py-3 max-w-[240px]">
          <p className="text-xs text-slate-800 dark:text-slate-200 font-medium truncate" title={l.anchor || l.alt || undefined}>
            {l.anchor || (l.alt ? <span className="italic text-slate-500">{l.alt}</span> : <span className="text-slate-300 dark:text-slate-600">{l.image_url ? 'Image' : '—'}</span>)}
          </p>
          <div className="flex flex-wrap items-center gap-1 mt-1"><LinkBadges l={l} /></div>
        </td>
        <td className="px-3 py-3 max-w-[200px] hidden 2xl:table-cell">
          <a href={l.url_to} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="text-[11px] font-mono text-slate-500 hover:text-blue-600 truncate block" title={l.url_to}>{normalizeUrl(l.url_to) || '/'}</a>
        </td>
        <td className="px-3 py-3 text-center hidden sm:table-cell"><SpamPill value={l.backlink_spam_score} /></td>
        <td className="px-3 py-3 text-right hidden md:table-cell" title={kw ? `${kw.page_from_keywords_count_top_10 ?? 0} in top 10 · ${kw.page_from_keywords_count_top_100 ?? 0} in top 100` : undefined}>
          {kw?.page_from_keywords_count_top_100
            ? <span className="text-xs font-mono tabular-nums"><span className="font-bold text-slate-800 dark:text-slate-200">{fmt(kw.page_from_keywords_count_top_10)}</span><span className="text-slate-400"> / {fmt(kw.page_from_keywords_count_top_100)}</span></span>
            : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
        </td>
        <td className="px-3 py-3 text-right hidden md:table-cell whitespace-nowrap">
          <span className="text-[11px] text-slate-400 tabular-nums">{fmtDate(l.first_seen)}</span>
        </td>
      </tr>
      {open && (
        <tr><td colSpan={9} className="p-0 border-b border-slate-100 dark:border-slate-800"><Detail l={l} /></td></tr>
      )}
    </>
  );
}

function LinkList({ links, showGroupCount, onPickDomain }: { links: BacklinkItem[]; showGroupCount: boolean; onPickDomain: (d: string) => void }) {
  const sort = useSort<SortKey>('dr');
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [shown, setShown] = useState(PAGE_SIZE);
  const sorted = useMemo(
    () => links.map((l, i) => ({ l, i })).sort((a, b) => compare(linkSortValue(a.l, sort.key), linkSortValue(b.l, sort.key), sort.dir)),
    [links, sort.key, sort.dir],
  );
  const toggle = (i: number) => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const h = (label: string, k: SortKey, align: 'left' | 'center' | 'right' = 'left', className = '', title?: string) =>
    <Th label={label} active={sort.key === k} dir={sort.dir} onClick={() => sort.toggle(k)} align={align} className={className} title={title} />;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="w-6" />
              {h('DR', 'dr', 'center', '', 'Domain rank of the source (0–100)')}
              {h('PR', 'pr', 'center', 'hidden md:table-cell', 'Page rank of the source page (0–100)')}
              {h('Source page', 'source')}
              {h('Anchor', 'anchor')}
              <Th label="Target page" className="hidden 2xl:table-cell" />
              {h('Spam', 'spam', 'center', 'hidden sm:table-cell', 'Backlink spam score (0–100)')}
              {h('KW', 'kw', 'right', 'hidden md:table-cell', 'Keywords the source page ranks for: top 10 / top 100')}
              {h('First seen', 'seen', 'right', 'hidden md:table-cell')}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {sorted.slice(0, shown).map(({ l, i }) => (
              <LinkRow key={i} l={l} open={open.has(i)} onToggle={() => toggle(i)} showGroupCount={showGroupCount} onPickDomain={onPickDomain} />
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > shown && (
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 text-center">
          <button type="button" onClick={() => setShown((s) => s + PAGE_SIZE * 2)}
            className="text-[11px] font-black uppercase tracking-widest text-blue-600 hover:underline">
            Show more ({fmt(sorted.length - shown)} remaining)
          </button>
        </div>
      )}
    </>
  );
}

// ---- Grouped views ----

function groupSortValue(g: LinkGroup, key: GroupSortKey): number | string {
  switch (key) {
    case 'count': return g.totalKnown;
    case 'best': return g.bestRank ?? -1;
    case 'dofollow': return g.count ? g.dofollow / g.count : -1;
    case 'spam': return g.maxSpam ?? -1;
    case 'key': return g.key;
    case 'seen': return g.firstSeen ?? '';
  }
}

function GroupTable({ groups, by, onPickDomain }: { groups: LinkGroup[]; by: GroupBy; onPickDomain: (d: string) => void }) {
  const sort = useSort<GroupSortKey>(by === 'domain' ? 'best' : 'count');
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const sorted = useMemo(() => [...groups].sort((a, b) => compare(groupSortValue(a, sort.key), groupSortValue(b, sort.key), sort.dir)), [groups, sort.key, sort.dir]);
  const maxCount = Math.max(1, ...groups.map((g) => g.totalKnown));
  const h = (label: string, k: GroupSortKey, align: 'left' | 'center' | 'right' = 'left', className = '', title?: string) =>
    <Th label={label} active={sort.key === k} dir={sort.dir} onClick={() => sort.toggle(k)} align={align} className={className} title={title} />;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="w-6" />
              {h(by === 'domain' ? 'Referring domain' : 'Target page', 'key')}
              {h('Links', 'count', 'left')}
              {h(by === 'domain' ? 'DR' : 'Best DR', 'best', 'center')}
              {h('Dofollow', 'dofollow', 'right', 'hidden sm:table-cell')}
              {h('Max spam', 'spam', 'center', 'hidden md:table-cell')}
              <Th label={by === 'domain' ? 'Pages linked' : 'Domains'} align="right" className="hidden md:table-cell" />
              <Th label="Top anchors" className="hidden 2xl:table-cell" />
              {h('First seen', 'seen', 'right', 'hidden md:table-cell')}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {sorted.slice(0, shown).map((g) => {
              const isOpen = open === g.key;
              const dfPct = g.count ? Math.round((g.dofollow / g.count) * 100) : 0;
              return (
                <Fragment key={g.key}>
                  <tr className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer ${isOpen ? 'bg-slate-50 dark:bg-slate-800/50' : ''}`} onClick={() => setOpen(isOpen ? null : g.key)}>
                    <td className="pl-3 pr-1 py-3"><ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} /></td>
                    <td className="px-3 py-3 max-w-[280px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 truncate" title={g.key}>{g.key || '/'}</span>
                        {g.hasNew && <Tag tone="blue">new</Tag>}
                      </div>
                      {by === 'domain' && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onPickDomain(g.key); }} className="text-[10px] text-slate-400 hover:text-blue-600 hover:underline">Filter list on this domain</button>
                      )}
                    </td>
                    <td className="px-3 py-3 min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums w-10 text-right">{fmt(g.totalKnown)}</span>
                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden min-w-[40px]">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.max(3, Math.round((g.totalKnown / maxCount) * 100))}%` }} />
                        </div>
                      </div>
                      {g.totalKnown > g.count && <p className="text-[10px] text-slate-400 mt-0.5 text-right pr-[calc(100%-2.5rem)] whitespace-nowrap">{fmt(g.count)} loaded</p>}
                    </td>
                    <td className="px-3 py-3 text-center"><RankBadge value={g.bestRank} /></td>
                    <td className="px-3 py-3 text-right hidden sm:table-cell"><span className={`text-xs font-mono tabular-nums ${dfPct >= 50 ? 'text-emerald-600' : 'text-slate-400'}`}>{dfPct}%</span></td>
                    <td className="px-3 py-3 text-center hidden md:table-cell"><SpamPill value={g.maxSpam} /></td>
                    <td className="px-3 py-3 text-right hidden md:table-cell"><span className="text-xs font-mono text-slate-500 tabular-nums">{by === 'domain' ? g.targets : g.domains}</span></td>
                    <td className="px-3 py-3 max-w-[240px] hidden 2xl:table-cell">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={g.anchors.join(' · ')}>{g.anchors.slice(0, 3).join(' · ') || '—'}</p>
                    </td>
                    <td className="px-3 py-3 text-right hidden md:table-cell whitespace-nowrap"><span className="text-[11px] text-slate-400 tabular-nums">{fmtDate(g.firstSeen)}</span></td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={9} className="p-0 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800 pl-12 pr-6 py-1">
                          {g.links.map((l, i) => (
                            <li key={i} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                              <RankBadge value={l.domain_from_rank} />
                              <a href={l.url_from} target="_blank" rel="noopener noreferrer" className="font-mono text-slate-600 dark:text-slate-300 hover:text-blue-600 truncate max-w-[380px]" title={l.url_from}>{by === 'domain' ? normalizeUrl(l.url_from) : l.domain_from}</a>
                              <span className="text-slate-400">→</span>
                              <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[220px]" title={l.anchor ?? undefined}>{l.anchor || l.alt || '—'}</span>
                              {by === 'domain' && <span className="font-mono text-slate-400 truncate max-w-[220px]" title={l.url_to}>{normalizeUrl(l.url_to)}</span>}
                              <span className="flex items-center gap-1"><LinkBadges l={l} /></span>
                              <SpamPill value={l.backlink_spam_score} />
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
      </div>
      {sorted.length > shown && (
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 text-center">
          <button type="button" onClick={() => setShown((s) => s + PAGE_SIZE * 2)} className="text-[11px] font-black uppercase tracking-widest text-blue-600 hover:underline">
            Show more ({fmt(sorted.length - shown)} remaining)
          </button>
        </div>
      )}
    </>
  );
}

// ---- Root ----

export default function BacklinksTable({ links, total, filename, groupedByDomain }: {
  links: BacklinkItem[];
  /** All backlinks DataForSEO matched for the request (links holds one page of them). */
  total: number;
  filename: string;
  /** The API already returned one link per domain (mode one_per_domain): group_count is meaningful. */
  groupedByDomain: boolean;
}) {
  const [filters, setFilters] = useState<LocalFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<View>('list');

  const filtered = useMemo(() => applyFilters(links, filters), [links, filters]);
  const counts = useMemo(() => flagCounts(links), [links]);
  const kinds = useMemo(() => kindCounts(links), [links]);
  const groups = useMemo(() => (view === 'list' ? [] : groupLinks(filtered, view)), [filtered, view]);
  const exportData = useMemo(() => filtered.map(exportRow), [filtered]);
  const domains = useMemo(() => new Set(filtered.map((l) => l.domain_from)).size, [filtered]);

  const toggleFlag = (f: Flag) => setFilters((s) => {
    let flags = s.flags.includes(f) ? s.flags.filter((x) => x !== f) : [...s.flags, f];
    // Mutually exclusive pair: picking one drops the other instead of yielding an empty list.
    if (f === 'dofollow') flags = flags.filter((x) => x !== 'nofollow');
    if (f === 'nofollow') flags = flags.filter((x) => x !== 'dofollow');
    return { ...s, flags };
  });
  const pickDomain = (d: string) => { setFilters((s) => ({ ...s, text: d })); setView('list'); };
  const active = filters.text !== '' || filters.flags.length > 0 || filters.itemType !== '';

  return (
    <div>
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="search" value={filters.text} onChange={(e) => setFilters((s) => ({ ...s, text: e.target.value }))}
              placeholder="Search URL, domain, anchor, title, context…"
              aria-label="Search loaded backlinks"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-500 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <select value={filters.itemType} onChange={(e) => setFilters((s) => ({ ...s, itemType: e.target.value }))} aria-label="Link type"
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All types</option>
            {kinds.map(([k, n]) => <option key={k} value={k}>{k} ({n})</option>)}
          </select>
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800" role="tablist" aria-label="View">
            {([['list', 'Links'], ['domain', 'By domain'], ['target', 'By target page']] as [View, string][]).map(([v, label]) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors ${view === v ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FLAG_DEFS.map((d) => {
            const on = filters.flags.includes(d.key);
            const n = counts[d.key];
            if (!on && n === 0) return null;
            return (
              <button key={d.key} type="button" onClick={() => toggleFlag(d.key)} title={d.hint} aria-pressed={on}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${on
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400'}`}>
                {d.label} <span className={on ? 'text-blue-100' : 'text-slate-400'}>{n}</span>
              </button>
            );
          })}
          {active && (
            <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="ml-1 inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-red-500">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            <span className="font-black text-slate-700 dark:text-slate-200">{fmt(filtered.length)}</span>
            {active && <> of {fmt(links.length)}</>} loaded links · <span className="font-bold text-slate-600 dark:text-slate-300">{fmt(domains)}</span> domains
            {total > links.length && <span className="text-slate-300 dark:text-slate-500"> · {fmt(total)} match on DataForSEO</span>}
          </p>
          {filtered.length > 0 && (
            <div className="flex items-center gap-2">
              <CopyMarkdownButton data={exportData} columns={MARKDOWN_COLUMNS} />
              <ExportCSVButton data={exportData} filename={filename} columns={EXPORT_COLUMNS} />
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-slate-400">
          {links.length === 0 ? 'No backlinks match these settings.' : 'No loaded link matches these quick filters.'}
        </div>
      ) : view === 'list' ? (
        <LinkList key={`${filters.text}|${filters.flags.join()}|${filters.itemType}`} links={filtered} showGroupCount={groupedByDomain} onPickDomain={pickDomain} />
      ) : (
        <GroupTable key={view} groups={groups} by={view} onPickDomain={pickDomain} />
      )}
    </div>
  );
}
