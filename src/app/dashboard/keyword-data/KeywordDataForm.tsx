'use client';

import { useState } from 'react';

type SE = 'google_ads' | 'bing';
type SEType =
  | 'search_volume'
  | 'keywords_for_site'
  | 'keywords_for_keywords'
  | 'ad_traffic_by_keywords'
  | 'keyword_performance';

const SE_OPTIONS: { value: SE; label: string }[] = [
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'bing', label: 'Bing Ads' },
];

const SE_TYPES: Record<SE, { value: SEType; label: string }[]> = {
  google_ads: [
    { value: 'search_volume', label: 'Search Volume' },
    { value: 'keywords_for_site', label: 'Keywords For Site' },
    { value: 'keywords_for_keywords', label: 'Keywords For Keywords' },
    { value: 'ad_traffic_by_keywords', label: 'Ad Traffic By Keywords' },
  ],
  bing: [
    { value: 'search_volume', label: 'Search Volume' },
    { value: 'keywords_for_site', label: 'Keywords For Site' },
    { value: 'keywords_for_keywords', label: 'Keywords For Keywords' },
    { value: 'keyword_performance', label: 'Keyword Performance' },
  ],
};

const SORT_BY_OPTIONS: Record<SE, { value: string; label: string }[]> = {
  google_ads: [
    { value: 'relevance', label: 'Relevance' },
    { value: 'search_volume', label: 'Search Volume' },
    { value: 'competition_index', label: 'Competition Index' },
    { value: 'low_top_of_page_bid', label: 'Low Top of Page Bid' },
    { value: 'high_top_of_page_bid', label: 'High Top of Page Bid' },
  ],
  bing: [
    { value: 'relevance', label: 'Relevance' },
    { value: 'search_volume', label: 'Search Volume' },
    { value: 'cpc', label: 'CPC' },
    { value: 'competition', label: 'Competition' },
  ],
};

interface Props {
  defaults: {
    se: string;
    seType: string;
    keywords: string;
    target: string;
    targetType: string;
    location: string;
    language: string;
    searchPartners: string;
    includeAdult: string;
    device: string;
    dateFrom: string;
    dateTo: string;
    sortBy: string;
  };
}

export default function KeywordDataForm({ defaults }: Props) {
  const [se, setSe] = useState<SE>((defaults.se as SE) || 'google_ads');
  const [seType, setSeType] = useState<SEType>((defaults.seType as SEType) || 'search_volume');

  const needsKeywords = ['search_volume', 'keywords_for_keywords', 'ad_traffic_by_keywords', 'keyword_performance'].includes(seType);
  const needsTarget = seType === 'keywords_for_site';
  const isBing = se === 'bing';
  const showDevice = isBing;
  const showIncludeAdult = se === 'google_ads';

  function handleSeChange(newSe: SE) {
    setSe(newSe);
    // Reset to first type of new SE
    setSeType(SE_TYPES[newSe][0].value);
  }

  return (
    <form method="GET" className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
      {/* SE + SE Type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
            Search Engine
          </label>
          <select
            name="se"
            value={se}
            onChange={(e) => handleSeChange(e.target.value as SE)}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {SE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
            Type
          </label>
          <select
            name="se_type"
            value={seType}
            onChange={(e) => setSeType(e.target.value as SEType)}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {SE_TYPES[se].map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Keywords or Target */}
      {needsKeywords && (
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
            Keywords <span className="text-slate-300 normal-case font-normal">(one per line, max 1000)</span>
          </label>
          <textarea
            name="keywords"
            defaultValue={defaults.keywords}
            rows={5}
            placeholder={"plombier paris\nélectricien lyon\nchauffagiste bordeaux"}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-y"
          />
        </div>
      )}

      {needsTarget && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
              Target <span className="text-slate-300 normal-case font-normal">(domaine ou URL)</span>
            </label>
            <input
              type="text"
              name="target"
              defaultValue={defaults.target}
              placeholder="example.com ou https://example.com/page"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
              Target Type
            </label>
            <select
              name="target_type"
              defaultValue={defaults.targetType || 'site'}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="site">Site (domaine entier)</option>
              <option value="page">Page (URL exacte)</option>
            </select>
          </div>
        </div>
      )}

      {/* Location + Language */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
            Location {isBing && <span className="text-red-400">*</span>}
          </label>
          <input
            type="text"
            name="location"
            defaultValue={defaults.location || 'France'}
            placeholder="ex: France, United States"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
            Language {isBing && <span className="text-red-400">*</span>}
          </label>
          <input
            type="text"
            name="language"
            defaultValue={defaults.language || 'French'}
            placeholder="ex: French, English"
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Date range + Sort By */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Date From</label>
          <input
            type="date"
            name="date_from"
            defaultValue={defaults.dateFrom}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Date To</label>
          <input
            type="date"
            name="date_to"
            defaultValue={defaults.dateTo}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Sort By</label>
          <select
            name="sort_by"
            defaultValue={defaults.sortBy || 'relevance'}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {SORT_BY_OPTIONS[se].map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Device (Bing only) */}
      {showDevice && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Device</label>
            <select
              name="device"
              defaultValue={defaults.device || 'all'}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All</option>
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
              <option value="tablet">Tablet</option>
            </select>
          </div>
        </div>
      )}

      {/* Checkboxes */}
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            name="search_partners"
            value="true"
            defaultChecked={defaults.searchPartners === 'true'}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-600 font-medium">Search Partners</span>
        </label>

        {showIncludeAdult && (
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              name="include_adult_keywords"
              value="true"
              defaultChecked={defaults.includeAdult === 'true'}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-600 font-medium">Include Adult Keywords</span>
          </label>
        )}
      </div>

      <button
        type="submit"
        className="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors"
      >
        Lancer la recherche
      </button>
    </form>
  );
}
