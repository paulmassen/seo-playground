export const dynamic = 'force-dynamic';

import {
  getCredentials,
  getKwOverviewHistory,
  saveKwOverviewSearch,
  getKwOverviewResults,
  getSetting,
  type KwOverviewSearchEntry,
} from '@/lib/db';
import { LANGUAGES, toLabsCountry } from '@/lib/geo-options';
import { stableSearchId } from '@/lib/dedupe';
import LocationPicker from '@/components/LocationPicker';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import KeywordOverviewTable from './KeywordOverviewTable';

// ---- Types ----

interface MonthlySearch {
  year: number;
  month: number;
  search_volume: number;
}

interface KeywordInfo {
  search_volume?: number;
  cpc?: number;
  competition?: number;
  competition_level?: string;
  monthly_searches?: MonthlySearch[];
}

interface KeywordProperties {
  keyword_difficulty?: number;
}

interface SearchIntentInfo {
  main_intent?: string;
}

interface ImpressionsInfo {
  daily_impressions_min?: number;
  daily_impressions_max?: number;
}

export interface KwOverviewItem {
  keyword?: string;
  keyword_info?: KeywordInfo;
  keyword_properties?: KeywordProperties;
  search_intent_info?: SearchIntentInfo;
  impressions_info?: ImpressionsInfo;
}

interface SearchParams {
  keywords?: string;
  location?: string;
  language?: string;
  history_id?: string;
}

// ---- API ----

async function fetchKeywordOverview(
  keywords: string[],
  location: string,
  language: string,
  login: string,
  pass: string,
): Promise<{ items: KwOverviewItem[]; cost?: number; error?: string }> {
  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      keywords,
      location_name: location,
      language_name: language,
    }]),
  });

  if (!res.ok) return { items: [], error: `Error API ${res.status}: ${res.statusText}` };

  const data = await res.json() as {
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      cost?: number;
      result?: Array<{ items?: KwOverviewItem[] }>;
    }>;
  };

  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) {
    return { items: [], error: `DataForSEO: ${task.status_message}` };
  }
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

// ---- UI helpers ----

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Page ----

export default async function KeywordOverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const rawKeywords = params.keywords ?? '';
  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'France');
  const defaultLanguage = getSetting('default_language') ?? 'French';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;

  let items: KwOverviewItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: KwOverviewSearchEntry | null = null;

  if (historyId) {
    const saved = getKwOverviewResults<KwOverviewItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      const history = getKwOverviewHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
    } else {
      error = 'This search is no longer available.';
    }
  }

  const keywords = rawKeywords.split('\n').map((k) => k.trim()).filter(Boolean).slice(0, 1000);

  if (!historyId && keywords.length > 0) {
    const dedupeId = stableSearchId(['keyword-overview', keywords.join(','), location, language]);
    const cached = getKwOverviewResults<KwOverviewItem>(dedupeId);

    if (cached) {
      items = cached;
      const cachedEntry = getKwOverviewHistory().find((e) => e.id === dedupeId);
      cost = cachedEntry?.cost;
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const res = await fetchKeywordOverview(keywords, location, language, creds.login, creds.pass);
      items = res.items;
      cost = res.cost;
      error = res.error ?? null;

      if (!error && items.length > 0) {
        const label = keywords.slice(0, 3).join(', ');
        const entry: KwOverviewSearchEntry = {
          id: dedupeId,
          ts: Date.now(),
          keywords: label.length > 80 ? label.slice(0, 77) + '…' : label,
          location,
          language,
          count: items.length,
          cost,
        };
        saveKwOverviewSearch(entry, items);
      }
    }
  }

  const history = getKwOverviewHistory();
  const hasQuery = historyId || keywords.length > 0;

  // Aggregate stats
  const avgDifficulty = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.keyword_properties?.keyword_difficulty ?? 0), 0) / items.length)
    : null;
  const totalVolume = items.reduce((s, i) => s + (i.keyword_info?.search_volume ?? 0), 0);

  const csvData = items.map((item) => ({
    keyword: item.keyword ?? '',
    search_volume: item.keyword_info?.search_volume ?? '',
    kd: item.keyword_properties?.keyword_difficulty ?? '',
    intent: item.search_intent_info?.main_intent ?? '',
    competition_level: item.keyword_info?.competition_level ?? '',
    cpc: item.keyword_info?.cpc != null ? item.keyword_info.cpc.toFixed(2) : '',
  }));
  const csvColumns = [
    { key: 'keyword', label: 'Keyword' },
    { key: 'search_volume', label: 'Volume' },
    { key: 'kd', label: 'KD' },
    { key: 'intent', label: 'Intent' },
    { key: 'competition_level', label: 'Competition' },
    { key: 'cpc', label: 'CPC' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Keyword Overview</h1>
        <p className="text-sm text-slate-400 mt-1">Detailed SEO metrics per keyword via DataForSEO Labs.</p>
      </div>

      {/* Form */}
      <SearchForm className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4" btnLabel="Analyze" btnClassName="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
              Keywords <span className="text-slate-300 normal-case font-normal">(one per line, max 1000)</span>
            </label>
            <textarea
              name="keywords"
              defaultValue={activeEntry ? '' : rawKeywords}
              rows={5}
              placeholder={"plombier paris\ndébouchage évier\nrobineterie fuite"}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono resize-y"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
            <LocationPicker name="location" defaultValue={activeEntry?.location ?? location} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" scope="labs" />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
            <select name="language" defaultValue={activeEntry?.language ?? language}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

      {/* Summary stats */}
      {hasQuery && !error && items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Keywords</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{items.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total volume</p>
            <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{totalVolume.toLocaleString("en-GB")}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Avg KD</p>
            <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{avgDifficulty ?? '—'}</p>
          </div>
        </div>
      )}

      {/* Results table */}
      {hasQuery && !error && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Results</h2>
              {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              <span className="text-xs font-black text-slate-400">{items.length} keyword{items.length !== 1 ? 's' : ''}</span>
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton data={csvData} columns={csvColumns} />
                  <ExportCSVButton data={csvData} filename="keyword-overview.csv" columns={csvColumns} />
                </div>
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No results.</div>
          ) : (
            <KeywordOverviewTable items={items} />
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/keyword-overview?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{entry.keywords}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {entry.location} · {entry.count} keyword{entry.count !== 1 ? 's' : ''}
                      {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
