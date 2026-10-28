'use client';

import { lazy, Suspense, useState } from 'react';
import { LANGUAGES } from '@/lib/geo-options';
import { LEADER_COUNTS, RADIUS_OPTIONS_KM } from '@/lib/category-audit';
import type { BusinessResult } from '../local-finder/MapPicker';

const MapPicker = lazy(() => import('../local-finder/MapPicker'));

export interface CategoryAuditFormDefaults {
  keyword: string;
  center: string;
  language: string;
  radiusKm: string;
  depth: string;
  leaders: string;
  target: { cid: string; title: string; primary: string; additional: string } | null;
}

const inputCls = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800';
const labelCls = 'block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5';

export default function CategoryAuditForm({ defaults }: { defaults: CategoryAuditFormDefaults }) {
  const [center, setCenter] = useState(defaults.center);
  const [language, setLanguage] = useState(defaults.language);
  const [target, setTarget] = useState(defaults.target);
  const [loading, setLoading] = useState(false);

  function pickBusiness(business: BusinessResult) {
    setTarget({
      cid: business.cid,
      title: business.title,
      primary: business.category,
      additional: (business.additionalCategories ?? []).join('|'),
    });
  }

  return (
    <form method="GET" onSubmit={() => setLoading(true)} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
      <div className="grid gap-x-8 gap-y-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          <div>
            <label htmlFor="ca-keyword" className={labelCls}>Keyword <span className="text-red-600" aria-hidden="true">*</span></label>
            <input id="ca-keyword" name="keyword" required defaultValue={defaults.keyword} placeholder="e.g. roofer, dentist, italian restaurant…" className={inputCls} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="ca-center" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Area center <span className="text-red-600" aria-hidden="true">*</span>
              </label>
              {center && (
                <button type="button" onClick={() => setCenter('')} className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-red-700 transition-colors">Clear</button>
              )}
            </div>
            <div className="space-y-2">
              <Suspense fallback={<div className="h-64 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />}>
                <MapPicker coordinate={center} onChange={setCenter} language={language} onBusinessSelect={pickBusiness} />
              </Suspense>
              <input
                id="ca-center" name="center" required value={center} onChange={(e) => setCenter(e.target.value)}
                inputMode="decimal" autoComplete="off" placeholder="Click on the map — or type lat,lng"
                className={`${inputCls} font-mono`}
              />
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Searching your business by name above also sets it as the profile to compare.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="ca-language" className={labelCls}>Search results language</label>
            <select id="ca-language" name="language" value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls}>
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Category names come back in this language.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="ca-radius" className={labelCls}>Area radius</label>
              <select id="ca-radius" name="radius_km" defaultValue={defaults.radiusKm} className={inputCls}>
                {RADIUS_OPTIONS_KM.map((km) => <option key={km} value={km}>{km} km</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ca-depth" className={labelCls}>Listings fetched</label>
              <select id="ca-depth" name="depth" defaultValue={defaults.depth} className={inputCls}>
                <option value="20">20</option>
                <option value="40">40</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="ca-leaders" className={labelCls}>Leaders = the top…</label>
            <select id="ca-leaders" name="leaders" defaultValue={defaults.leaders} className={inputCls}>
              {LEADER_COUNTS.map((n) => <option key={n} value={n}>Top {n}</option>)}
            </select>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Suggestions are based on the categories these listings use. Changing it later is free.</p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Your business (optional)</p>
            {target ? (
              <div className="mt-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{target.title}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {[target.primary, ...target.additional.split('|')].filter(Boolean).join(' · ') || 'No category found'}
                  </p>
                </div>
                <button type="button" onClick={() => setTarget(null)} className="shrink-0 text-xs font-bold text-slate-600 hover:text-red-700 dark:text-slate-400">Remove</button>
                <input type="hidden" name="target_cid" value={target.cid} />
                <input type="hidden" name="target_title" value={target.title} />
                <input type="hidden" name="target_primary" value={target.primary} />
                <input type="hidden" name="target_additional" value={target.additional} />
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Find your listing with the map search, or pick it in the results afterwards, to get a “you vs. the leaders” comparison.
              </p>
            )}
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            One Google Maps search (Live): about $0.002 for up to 100 listings.
          </p>
          <button
            type="submit" disabled={loading}
            className="w-full bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-bold text-sm py-3 rounded-xl hover:bg-blue-700 dark:hover:bg-blue-200 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-70 disabled:cursor-wait"
          >
            {loading ? 'Analysing…' : 'Analyse categories'}
          </button>
        </div>
      </div>
    </form>
  );
}
