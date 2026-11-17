'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { LABS_LOCATIONS } from '@/lib/geo-options';
import { estimateFindPrice, formatLabel, LANGUAGE_CODES, ORDER_OPTIONS, PRICE_FIND_ITEM, PRICE_FIND_TASK, type FindParams, type TechCatalogGroup } from './tech-shared';

const input = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 transition-all';
const label = 'block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5';
const help = 'text-[11px] text-slate-400 mt-1 leading-snug';

const BY_OPTIONS = [
  { value: 'technology', label: 'Technology', help: 'Sites using one named technology, e.g. Shopify or HubSpot.' },
  { value: 'category', label: 'Category', help: 'Sites using any technology of a category, e.g. every e-commerce platform or every CRM.' },
  { value: 'group', label: 'Group', help: 'Broadest search: any technology of a whole group, e.g. Marketing or Security.' },
  { value: 'keyword', label: 'Keyword only', help: 'No technology condition: sites whose title, description or meta keywords contain the keyword.' },
] as const;

export default function FindFields({ groups, initial }: { groups: TechCatalogGroup[]; initial: FindParams }) {
  const [by, setBy] = useState(initial.by);
  const [tech, setTech] = useState(initial.by === 'technology' ? initial.value : '');
  const [path, setPath] = useState(initial.path);
  const [match, setMatch] = useState(initial.match);
  const [limit, setLimit] = useState(initial.limit);

  const names = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) for (const c of g.categories) for (const t of c.technologies) set.add(t.trim());
    return [...set].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  }, [groups]);

  // A full datalist of ~7,000 names is slow to render, so only the closest matches are offered.
  const suggestions = useMemo(() => {
    const q = tech.trim().toLowerCase();
    if (!q) return names.slice(0, 0);
    const starts = names.filter((n) => n.toLowerCase().startsWith(q));
    const contains = names.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q));
    return [...starts, ...contains].slice(0, 40);
  }, [names, tech]);

  const pathLabel = useMemo(() => {
    if (!path) return '';
    const [gid, cid] = path.split('.');
    const g = groups.find((x) => x.id === gid);
    const c = g?.categories.find((x) => x.id === cid);
    return `${g?.title ?? formatLabel(gid)} › ${c?.title ?? formatLabel(cid ?? '')}`;
  }, [groups, path]);

  const known = !tech.trim() || names.some((n) => n.toLowerCase() === tech.trim().toLowerCase());
  const byHelp = BY_OPTIONS.find((o) => o.value === by)?.help;

  return (
    <div className="space-y-4">
      <input type="hidden" name="mode" value="find" />

      <div>
        <span className={label}>Search by</span>
        <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl w-fit">
          {BY_OPTIONS.map((o) => (
            <label key={o.value} className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest cursor-pointer transition-all ${by === o.value ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              <input type="radio" name="by" value={o.value} checked={by === o.value} onChange={() => setBy(o.value)} className="sr-only" />
              {o.label}
            </label>
          ))}
        </div>
        <p className={help}>{byHelp}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {by === 'technology' && (
          <div>
            <label className={label} htmlFor="tech-input">Technology</label>
            <input
              id="tech-input" type="text" name="technology" list="tech-names" required autoComplete="off"
              value={tech} onChange={(e) => { setTech(e.target.value); setPath(''); }}
              placeholder="e.g. WordPress, Shopify, HubSpot…" className={input}
            />
            <datalist id="tech-names">
              {suggestions.map((n) => <option key={n} value={n} />)}
            </datalist>
            {path && (
              <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded-md">
                Only as {pathLabel}
                <button type="button" onClick={() => setPath('')} aria-label="Search this technology in every category" className="hover:text-blue-900"><X className="w-3 h-3" /></button>
              </span>
            )}
            <input type="hidden" name="path" value={path} />
            {!known && match === 'as_is' && (
              <p className="text-[11px] text-amber-600 mt-1">Not in DataForSEO&apos;s technology list: an exact search would return nothing. Pick a suggestion or switch to partial match.</p>
            )}
          </div>
        )}
        {by === 'category' && (
          <div>
            <label className={label} htmlFor="cat-input">Category</label>
            <select id="cat-input" name="category" defaultValue={initial.by === 'category' ? initial.value : ''} required className={input}>
              <option value="" disabled>Choose a category…</option>
              {groups.map((g) => (
                <optgroup key={g.id} label={g.title}>
                  {g.categories.map((c) => <option key={c.path} value={c.id}>{c.title} ({c.technologies.length})</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        )}
        {by === 'group' && (
          <div>
            <label className={label} htmlFor="group-input">Group</label>
            <select id="group-input" name="group" defaultValue={initial.by === 'group' ? initial.value : ''} required className={input}>
              <option value="" disabled>Choose a group…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.title} ({g.categories.length} categories)</option>)}
            </select>
          </div>
        )}
        <div className={by === 'keyword' ? 'sm:col-span-2' : ''}>
          <label className={label} htmlFor="kw-input">Keyword {by !== 'keyword' && <span className="normal-case tracking-normal font-bold">(optional)</span>}</label>
          <input id="kw-input" type="text" name="keyword" defaultValue={initial.keyword} required={by === 'keyword'}
            placeholder="e.g. plumbing, dentist…" className={input} />
          <p className={help}>Matched in the site&apos;s title, description and meta keywords, not in its body text.</p>
        </div>
      </div>

      {by !== 'keyword' && (
        <div>
          <span className={label}>Match</span>
          <div className="flex flex-wrap gap-4 text-sm text-slate-700 dark:text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="match" value="as_is" checked={match === 'as_is'} onChange={() => setMatch('as_is')} />
              Exact
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="match" value="entry" checked={match === 'entry'} onChange={() => setMatch('entry')} />
              Partial
            </label>
          </div>
          <p className={help}>
            Exact (<code>as_is</code>) only matches the name or id exactly as DataForSEO lists it. Partial (<code>entry</code>) also matches names containing your text,
            so &ldquo;Google&rdquo; finds Google Analytics, Google Tag Manager, Google Ads… Broader, but noisier.
          </p>
        </div>
      )}

      <details className="group rounded-xl border border-slate-100 dark:border-slate-700 px-4 py-3" open={Boolean(initial.country || initial.minDr || initial.lang)}>
        <summary className="text-xs font-black uppercase tracking-widest text-slate-400 cursor-pointer select-none">Filters &amp; sorting</summary>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-3">
          <div>
            <label className={label} htmlFor="country-input">Country</label>
            <select id="country-input" name="country" defaultValue={initial.country} className={input}>
              <option value="">Any</option>
              {[...LABS_LOCATIONS].sort((a, b) => a.name.localeCompare(b.name)).map((l) => <option key={l.iso} value={l.iso}>{l.name}</option>)}
            </select>
            <p className={help}>Country DataForSEO assigns to the site.</p>
          </div>
          <div>
            <label className={label} htmlFor="lang-input">Language</label>
            <select id="lang-input" name="lang" defaultValue={initial.lang} className={input}>
              <option value="">Any</option>
              {LANGUAGE_CODES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="mindr-input">Min. DR</label>
            <input id="mindr-input" type="number" name="min_dr" min={0} max={100} step={1} defaultValue={initial.minDr || ''} placeholder="0" className={input} />
            <p className={help}>Domain rank 0–100. 20+ skips most parked and tiny sites.</p>
          </div>
          <div>
            <label className={label} htmlFor="order-input">Sort by</label>
            <select id="order-input" name="order" defaultValue={initial.order} className={input}>
              {ORDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className={help}>Applied by DataForSEO, so it decides which domains you get.</p>
          </div>
        </div>
      </details>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <p className="text-[11px] text-slate-400">
          Cost: ${PRICE_FIND_TASK.toFixed(3)} per search + ${PRICE_FIND_ITEM.toFixed(4)} per domain returned
          {' '}(≈ ${estimateFindPrice(limit).toFixed(3)} for {limit}). Each page of results is a new paid call.
        </p>
        <div className="w-32">
          <label className={label} htmlFor="limit-input">Per page</label>
          <select id="limit-input" name="limit" value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))} className={input}>
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
