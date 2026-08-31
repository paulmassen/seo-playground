import {
  getCredentials, getSetting,
  getKwDifficultyHistory, saveKwDifficultySearch, getKwDifficultyResults,
  type KwDifficultySearchEntry,
} from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import KeywordDifficultyTable from './KeywordDifficultyTable';

interface DifficultyItem {
  keyword?: string;
  keyword_difficulty?: number;
  avg_backlinks_info?: {
    referring_domains?: number;
    referring_pages?: number;
  };
  serp_info?: {
    se_results_count?: number;
    last_updated_time?: string;
  };
  keyword_info?: {
    search_volume?: number;
    cpc?: number;
    competition?: number;
  };
}

interface SearchParams {
  keywords?: string;
  location?: string;
  language?: string;
  history_id?: string;
}

async function fetchDifficulty(
  keywords: string[],
  location: string,
  language: string,
  login: string,
  pass: string,
): Promise<{ items: DifficultyItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: DifficultyItem[] }>(
    'dataforseo_labs/google/bulk_keyword_difficulty/live',
    { keywords, location_name: location, language_name: language },
    { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function KeywordDifficultyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'France');
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const keywords = params.keywords?.trim() ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;

  let items: DifficultyItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: KwDifficultySearchEntry | null = null;

  if (historyId) {
    const saved = getKwDifficultyResults<DifficultyItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      const history = getKwDifficultyHistory();
      activeEntry = history.find((e) => e.id === historyId) ?? null;
    } else {
      error = 'Search no longer available.';
    }
  }

  const hasQuery = historyId || keywords;

  if (!historyId && keywords) {
    const kwList = keywords.split('\n').map((k) => k.trim()).filter(Boolean).slice(0, 1000);
    const dedupeId = stableSearchId(['keyword-difficulty', kwList.join(','), location, language]);
    const cachedItems = getKwDifficultyResults<DifficultyItem>(dedupeId);

    if (cachedItems) {
      items = cachedItems;
      cost = getKwDifficultyHistory().find((e) => e.id === dedupeId)?.cost;
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const result = await fetchDifficulty(kwList, location, language, creds.login, creds.pass);
      items = result.items;
      cost = result.cost;
      error = result.error ?? null;

      if (!error && items.length > 0) {
        const label = kwList.slice(0, 3).join(', ') + (kwList.length > 3 ? '…' : '');
        const entry: KwDifficultySearchEntry = {
          id: dedupeId,
          ts: Date.now(),
          keywords: label,
          location,
          language,
          count: items.length,
          cost,
        };
        saveKwDifficultySearch(entry, items);
      }
    }
  }

  const history = getKwDifficultyHistory();
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Keyword Difficulty</h1>
        <p className="text-sm text-slate-400 mt-1">Bulk keyword difficulty scores via DataForSEO Labs.</p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Analyze" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Keywords <span className="text-slate-300 font-normal normal-case tracking-normal">(one per line, max 1000)</span></label>
            <textarea
              name="keywords"
              defaultValue={activeEntry ? '' : keywords}
              rows={6}
              placeholder={"plumber paris\nemergency plumber\nplumbing repair"}
              required
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 transition-all font-mono resize-y"
            />
          </div>
          <LabsLocationLanguageFields
            defaultLocation={displayLocation}
            defaultLanguage={displayLanguage}
            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
          />
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {hasQuery && !error && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Results</h2>
              {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              <span className="text-xs font-black text-slate-400">{items.length} keyword{items.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No results found.</div>
          ) : (
            <KeywordDifficultyTable items={items} />
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/keyword-difficulty?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.keywords}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {entry.count} keyword{entry.count !== 1 ? 's' : ''}
                      {' · '}{entry.location}
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
