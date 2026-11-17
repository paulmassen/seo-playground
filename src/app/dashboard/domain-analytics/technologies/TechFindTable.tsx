'use client';

import { METRIC_HINTS } from '@/lib/metric-glossary';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Cpu, Mail, Phone, Share2 } from 'lucide-react';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import ExportCSVButton from '@/components/ExportCSVButton';
import { analyzeDomainHref, findByTechHref, flattenTechs, type TechDomainItem } from './tech-shared';

type SortKey = 'dr' | 'domain' | 'title' | 'country' | 'lang' | 'techs' | 'last_seen';
type SortDir = 'asc' | 'desc';

const VISIBLE_TECHS = 6;

function DrBadge({ value }: { value?: number }) {
  if (!value) return <span className="text-slate-300 text-xs">—</span>;
  const color = value >= 70 ? 'bg-emerald-500 text-white' : value >= 40 ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500';
  return <span className={`inline-flex items-center justify-center w-9 h-5 rounded text-[10px] font-black ${color}`}>{value}</span>;
}

/** DataForSEO dates look like "2022-10-10 12:57:46 +00:00". */
function fmtVisited(s?: string) {
  if (!s) return '—';
  const d = new Date(s.replace(' +00:00', 'Z').replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return s.split(' ')[0];
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function sortValue(item: TechDomainItem, key: SortKey): number | string {
  switch (key) {
    case 'dr': return item.domain_rank ?? -1;
    case 'domain': return item.domain?.toLowerCase() ?? '';
    case 'title': return item.title?.toLowerCase() ?? '';
    case 'country': return item.country_iso_code ?? '';
    case 'lang': return item.content_language_code ?? item.language_code ?? '';
    case 'techs': return flattenTechs(item.technologies).length;
    case 'last_seen': return item.last_visited ?? '';
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />;
}

function TechList({ item, highlight }: { item: TechDomainItem; highlight?: string }) {
  const [open, setOpen] = useState(false);
  const techs = flattenTechs(item.technologies);
  if (techs.length === 0) return null;
  const hl = highlight?.toLowerCase();
  // The searched technology goes first so it is visible without expanding.
  const ordered = hl ? [...techs].sort((a, b) => Number(b.name.toLowerCase().includes(hl)) - Number(a.name.toLowerCase().includes(hl))) : techs;
  const shown = open ? ordered : ordered.slice(0, VISIBLE_TECHS);
  const hidden = ordered.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {shown.map((t) => {
        const isHit = hl && t.name.toLowerCase().includes(hl);
        return (
          <a key={t.name} href={findByTechHref(t.name, t.path)} title={`${t.path} · find other domains using ${t.name}`}
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${isHit ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600'}`}>
            {t.name}
          </a>
        );
      })}
      {hidden > 0 && (
        <button type="button" onClick={() => setOpen(true)} className="text-[9px] font-black text-blue-600 hover:text-blue-800 px-1.5 py-0.5">+{hidden}</button>
      )}
      {open && ordered.length > VISIBLE_TECHS && (
        <button type="button" onClick={() => setOpen(false)} className="text-[9px] font-black text-slate-400 hover:text-slate-600 px-1.5 py-0.5">less</button>
      )}
    </div>
  );
}

function Contacts({ item }: { item: TechDomainItem }) {
  const emails = item.emails ?? [];
  const phones = item.phone_numbers ?? [];
  const social = item.social_graph_urls ?? [];
  if (!emails.length && !phones.length && !social.length) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <div className="space-y-0.5 text-[11px] max-w-[220px]">
      {emails.slice(0, 2).map((e) => (
        <a key={e} href={`mailto:${e}`} className="flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 truncate"><Mail className="w-3 h-3 shrink-0 text-slate-400" />{e}</a>
      ))}
      {phones.slice(0, 1).map((p) => (
        <span key={p} className="flex items-center gap-1 text-slate-600 dark:text-slate-300 truncate"><Phone className="w-3 h-3 shrink-0 text-slate-400" />{p}</span>
      ))}
      {social.length > 0 && (
        <span className="flex items-center gap-1 text-slate-400 truncate" title={social.join('\n')}><Share2 className="w-3 h-3 shrink-0" />{social.length} social link{social.length > 1 ? 's' : ''}</span>
      )}
    </div>
  );
}

export default function TechFindTable({ items, highlight, filename }: { items: TechDomainItem[]; highlight?: string; filename: string }) {
  const [sortKey, setSortKey] = useState<SortKey>('dr');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [query, setQuery] = useState('');
  const [withContacts, setWithContacts] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (withContacts && !(item.emails?.length || item.phone_numbers?.length)) return false;
      if (!q) return true;
      const hay = [item.domain, item.title, item.description, item.country_iso_code, ...flattenTechs(item.technologies).map((t) => t.name)]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, withContacts]);

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

  const hasContacts = items.some((i) => i.emails?.length || i.phone_numbers?.length || i.social_graph_urls?.length);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'domain' || key === 'title' || key === 'country' || key === 'lang' ? 'asc' : 'desc'); }
  }

  function Header({ label, sortK, align, className, hint }: { label: string; sortK: SortKey; align: 'left' | 'center' | 'right'; className?: string; hint?: string }) {
    const active = sortKey === sortK;
    return (
      <th title={hint} className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 select-none cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? ''}`}
          onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : align === 'center' ? 'justify-center' : ''}`}>
          <span className={hint ? 'underline decoration-dotted decoration-slate-300 dark:decoration-slate-600 underline-offset-[3px] cursor-help' : undefined}>{label}</span>
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const exportData = sorted.map((item) => ({
    dr: item.domain_rank ?? '',
    domain: item.domain ?? '',
    title: item.title ?? '',
    country: item.country_iso_code ?? '',
    language: item.content_language_code ?? item.language_code ?? '',
    last_seen: item.last_visited ? item.last_visited.split(' ')[0].split('T')[0] : '',
    emails: (item.emails ?? []).join('; '),
    phones: (item.phone_numbers ?? []).join('; '),
    social: (item.social_graph_urls ?? []).join('; '),
    technologies: flattenTechs(item.technologies).map((t) => t.name).join('; '),
  }));
  const csvColumns = [
    { key: 'dr', label: 'DR' },
    { key: 'domain', label: 'Domain' },
    { key: 'title', label: 'Title' },
    { key: 'country', label: 'Country' },
    { key: 'language', label: 'Language' },
    { key: 'last_seen', label: 'Last Seen' },
    { key: 'emails', label: 'Emails' },
    { key: 'phones', label: 'Phones' },
    { key: 'social', label: 'Social' },
    { key: 'technologies', label: 'Technologies' },
  ];
  const mdColumns = csvColumns.filter((c) => c.key !== 'technologies' && c.key !== 'social');

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Matching domains</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter domain, title, tech…"
            aria-label="Filter results"
            className="w-56 px-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-300 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {hasContacts && (
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 cursor-pointer">
              <input type="checkbox" checked={withContacts} onChange={(e) => setWithContacts(e.target.checked)} className="rounded" />
              With email/phone
            </label>
          )}
          <span className="text-xs font-black text-slate-400">{sorted.length === items.length ? `${items.length} shown` : `${sorted.length} / ${items.length}`}</span>
          <CopyMarkdownButton data={exportData} columns={mdColumns} />
          <ExportCSVButton data={exportData} columns={csvColumns} filename={filename} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
              <Header label="DR" hint={METRIC_HINTS.domainRank} sortK="dr" align="center" className="w-14" />
              <Header label="Domain · technologies" sortK="domain" align="left" />
              <Header label="Techs" hint="Number of distinct technologies detected on the domain." sortK="techs" align="right" className="hidden sm:table-cell w-16" />
              <Header label="Title" sortK="title" align="left" className="hidden md:table-cell" />
              {hasContacts && <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 hidden lg:table-cell" title="Emails, phone numbers and social profiles DataForSEO found on the site.">Contacts</th>}
              <Header label="Country" sortK="country" align="center" className="hidden sm:table-cell w-16" />
              <Header label="Lang" hint="Language of the site's content." sortK="lang" align="center" className="hidden md:table-cell w-14" />
              <Header label="Last crawled" hint="Last time DataForSEO's crawler visited the domain; the stack is as of that date." sortK="last_seen" align="right" className="hidden lg:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
            {sorted.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-400">No domain matches this filter.</td></tr>
            )}
            {sorted.map((item, i) => (
              <tr key={item.domain ?? i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors align-top">
                <td className="px-4 py-3 text-center"><DrBadge value={item.domain_rank} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <a href={`https://${item.domain}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 hover:text-blue-600 transition-colors">
                      {item.domain}
                    </a>
                    {item.domain && (
                      <a href={analyzeDomainHref(item.domain)} title="Open in Analyze Domain (prefilled; nothing is charged until you click Analyze)"
                        className="text-slate-300 hover:text-blue-600 transition-colors"><Cpu className="w-3 h-3" /></a>
                    )}
                  </div>
                  <TechList item={item} highlight={highlight} />
                </td>
                <td className="px-4 py-3 text-right hidden sm:table-cell font-mono text-xs text-slate-500 tabular-nums">{flattenTechs(item.technologies).length || '—'}</td>
                <td className="px-4 py-3 max-w-[220px] hidden md:table-cell">
                  <span className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2" title={item.description ?? undefined}>{item.title ?? '—'}</span>
                </td>
                {hasContacts && <td className="px-4 py-3 hidden lg:table-cell"><Contacts item={item} /></td>}
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{item.country_iso_code ?? '—'}</span>
                </td>
                <td className="px-4 py-3 text-center hidden md:table-cell">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{item.content_language_code ?? item.language_code ?? '—'}</span>
                </td>
                <td className="px-4 py-3 text-right hidden lg:table-cell">
                  <span className="text-[11px] text-slate-400 tabular-nums">{fmtVisited(item.last_visited)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
