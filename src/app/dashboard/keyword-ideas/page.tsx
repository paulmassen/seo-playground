import { getCredentials, getSetting, getKeywordIdeasHistory, saveKeywordIdeasSearch, getKeywordIdeasResults, type KeywordIdeasEntry } from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import KeywordIdeasTable from './KeywordIdeasTable';

interface IdeaItem {
  keyword?: string;
  keyword_info?: { search_volume?: number; cpc?: number; competition?: number; competition_level?: string };
  keyword_properties?: { keyword_difficulty?: number };
  search_intent_info?: { main_intent?: string };
  avg_backlinks_info?: { referring_domains?: number };
}

interface SearchParams { keyword?: string; location?: string; language?: string; limit?: string; history_id?: string; }

async function fetchIdeas(keyword: string, location: string, language: string, limit: number, login: string, pass: string): Promise<{ items: IdeaItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: IdeaItem[] }>(
    'dataforseo_labs/google/keyword_ideas/live',
    { keywords: [keyword], location_name: location, language_name: language, limit, include_serp_info: false, include_clickstream_data: false },
    { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

export default async function KeywordIdeasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'France');
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const keyword = params.keyword?.trim() ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const limit = Math.min(parseInt(params.limit ?? '100', 10) || 100, 1000);
  const historyId = params.history_id;

  let items: IdeaItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: KeywordIdeasEntry | null = null;

  if (historyId) {
    const saved = getKeywordIdeasResults<IdeaItem>(historyId);
    if (saved) { items = saved; activeEntry = getKeywordIdeasHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Search no longer available.';
  } else if (keyword) {
    const dedupeId = stableSearchId(['keyword-ideas', keyword, location, language, limit]);
    const cached = getKeywordIdeasResults<IdeaItem>(dedupeId);

    if (cached) {
      items = cached;
      cost = getKeywordIdeasHistory().find((e) => e.id === dedupeId)?.cost;
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const result = await fetchIdeas(keyword, location, language, limit, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: KeywordIdeasEntry = { id: dedupeId, ts: Date.now(), keyword, location, language, count: items.length, cost };
        saveKeywordIdeasSearch(entry, items);
      }
    }
  }

  const history = getKeywordIdeasHistory();
  const displayKeyword = activeEntry?.keyword ?? keyword;
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;

  const csvData = items.map((item) => ({
    keyword: item.keyword ?? '',
    search_volume: item.keyword_info?.search_volume ?? '',
    kd: item.keyword_properties?.keyword_difficulty ?? '',
    cpc: item.keyword_info?.cpc != null ? item.keyword_info.cpc.toFixed(2) : '',
    competition_level: item.keyword_info?.competition_level ?? '',
    intent: item.search_intent_info?.main_intent ?? '',
    ref_domains: item.avg_backlinks_info?.referring_domains ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Keyword Ideas</h1>
        <p className="text-sm text-slate-400 mt-1">Discover keyword ideas from a seed keyword with volume, difficulty and intent.</p>
      </div>

      <SearchForm className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4" btnLabel="Find ideas" btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Seed keyword</label>
            <input type="text" name="keyword" defaultValue={displayKeyword} placeholder="plombier" required
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800" />
          </div>
          <LabsLocationLanguageFields
            defaultLocation={displayLocation}
            defaultLanguage={displayLanguage}
            className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800"
          />
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Max results</label>
            <select name="limit" defaultValue={String(limit)} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800">
              {['50','100','200','500','1000'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {(historyId || keyword) && !error && (
        <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">{items.length} ideas</span>
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
            </div>
            {items.length > 0 && (
              <div className="flex items-center gap-2">
                <CopyMarkdownButton data={csvData} columns={[{key:'keyword',label:'Keyword'},{key:'search_volume',label:'Volume'},{key:'kd',label:'KD'},{key:'cpc',label:'CPC'},{key:'competition_level',label:'Competition'},{key:'intent',label:'Intent'},{key:'ref_domains',label:'Avg Ref. Domains'}]} />
                <ExportCSVButton data={csvData} filename={`keyword-ideas-${displayKeyword}.csv`} columns={[{key:'keyword',label:'Keyword'},{key:'search_volume',label:'Volume'},{key:'kd',label:'KD'},{key:'cpc',label:'CPC'},{key:'competition_level',label:'Competition'},{key:'intent',label:'Intent'},{key:'ref_domains',label:'Avg Ref. Domains'}]} />
              </div>
            )}
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No results found.</div>
          ) : (
            <KeywordIdeasTable items={items} />
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
                <a key={entry.id} href={`/dashboard/keyword-ideas?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.keyword}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{entry.count} ideas · {entry.location}{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
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
