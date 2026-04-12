import {
  getCredentials, getSetting,
  getKwDifficultyHistory, saveKwDifficultySearch, getKwDifficultyResults,
  type KwDifficultySearchEntry,
} from '@/lib/db';
import { LOCATIONS, LANGUAGES } from '@/lib/geo-options';
import SearchForm from '@/components/SearchForm';

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
  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/bulk_keyword_difficulty/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ keywords, location_name: location, language_name: language }]),
  });
  if (!res.ok) return { items: [], error: `Error API ${res.status}` };
  const data = await res.json() as {
    tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: DifficultyItem[] }>;
  };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Réponse API vide.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  return { items: task.result ?? [], cost: task.cost };
}

function DifficultyBar({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-slate-300">—</span>;
  const color = value >= 70 ? 'bg-red-500'
    : value >= 50 ? 'bg-orange-400'
    : value >= 30 ? 'bg-amber-400'
    : 'bg-emerald-400';
  const textColor = value >= 70 ? 'text-red-600'
    : value >= 50 ? 'text-orange-600'
    : value >= 30 ? 'text-amber-600'
    : 'text-emerald-600';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-xs font-black tabular-nums ${textColor}`}>{value}</span>
    </div>
  );
}

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString("en-GB");
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function KeywordDifficultyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const defaultLocation = getSetting('default_location') ?? 'France';
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
      error = "Cette recherche n'est plus disponible.";
    }
  }

  const hasQuery = historyId || keywords;

  if (!historyId && keywords) {
    if (!creds) {
      error = 'Identifiants DataForSEO manquants. Configurez-les dans les paramètres.';
    } else {
      const kwList = keywords.split('\n').map((k) => k.trim()).filter(Boolean).slice(0, 1000);
      const result = await fetchDifficulty(kwList, location, language, creds.login, creds.pass);
      items = result.items;
      cost = result.cost;
      error = result.error ?? null;

      if (!error && items.length > 0) {
        const label = kwList.slice(0, 3).join(', ') + (kwList.length > 3 ? '…' : '');
        const entry: KwDifficultySearchEntry = {
          id: crypto.randomUUID().slice(0, 8),
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
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Keyword Difficulty</h1>
        <p className="text-sm text-slate-400 mt-1">Bulk keyword difficulty scores via DataForSEO Labs.</p>
      </div>

      <SearchForm className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4" btnLabel="Analyze" btnClassName="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Keywords <span className="text-slate-300 font-normal normal-case tracking-normal">(one per line, max 1000)</span></label>
            <textarea
              name="keywords"
              defaultValue={activeEntry ? '' : keywords}
              rows={6}
              placeholder={"plombier paris\nplombier urgence\ndépannage plomberie"}
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono resize-y"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
            <select name="location" defaultValue={displayLocation}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {LOCATIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
            <select name="language" defaultValue={displayLanguage}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

      {hasQuery && !error && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Results</h2>
              {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
              <span className="text-xs font-black text-slate-400">{items.length} mot{items.length !== 1 ? 's' : ''}-clé{items.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">No results found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-6 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Keyword</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Difficulty</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">Vol.</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400">CPC</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell">Ref. domains</th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-400 hidden lg:table-cell">Results</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items
                    .sort((a, b) => (b.keyword_difficulty ?? 0) - (a.keyword_difficulty ?? 0))
                    .map((item, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 font-medium text-slate-900 max-w-xs">
                          {item.keyword ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <DifficultyBar value={item.keyword_difficulty} />
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                          {fmt(item.keyword_info?.search_volume)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums">
                          {item.keyword_info?.cpc != null ? `$${item.keyword_info.cpc.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden md:table-cell">
                          {fmt(item.avg_backlinks_info?.referring_domains)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-500 tabular-nums hidden lg:table-cell">
                          {item.serp_info?.se_results_count != null
                            ? item.serp_info.se_results_count.toLocaleString("en-GB")
                            : '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/keyword-difficulty?history_id=${entry.id}`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{entry.keywords}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {entry.count} mot{entry.count !== 1 ? 's' : ''}-clé{entry.count !== 1 ? 's' : ''}
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
