import { getCredentials, getTargetDomains, getSerpHistory, saveSerpSearch, getSerpResults, type SerpHistoryEntry, type TargetHit } from '@/lib/db';
import { LOCATIONS, LANGUAGES } from '@/lib/geo-options';
import { addDomainAction, removeDomainAction } from './actions';
import SearchForm from '@/components/SearchForm';

interface SerpItem {
  type: string;
  rank_group: number;
  title?: string;
  description?: string;
  url?: string;
  domain?: string;
  breadcrumb?: string;
}

interface SearchParams {
  keyword?: string;
  location?: string;
  language?: string;
  device?: string;
  depth?: string;
  history_id?: string;
}

function extractDomain(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

async function fetchSerp(
  keyword: string, location: string, language: string, device: string, depth: number,
  login: string, pass: string,
): Promise<SerpItem[]> {
  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ keyword, location_name: location, language_name: language, device, depth }]),
  });
  if (!res.ok) return [];
  const data = await res.json() as { tasks?: Array<{ result?: Array<{ items?: SerpItem[] }> }> };
  return data?.tasks?.[0]?.result?.[0]?.items?.filter((i) => i.type === 'organic') ?? [];
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", { day: 'numeric', month: 'short' });
}

export default async function SerpPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const targetDomains = getTargetDomains();
  const history = getSerpHistory();

  const params = await searchParams;
  const historyId = params.history_id;
  const keyword = params.keyword?.trim() ?? '';
  const location = params.location ?? 'France';
  const language = params.language ?? 'French';
  const device = params.device ?? 'desktop';
  const depth = Math.min(parseInt(params.depth ?? '10', 10) || 10, 100);

  let results: SerpItem[] = [];
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: SerpHistoryEntry | null = null;

  // Load from history
  if (historyId) {
    const saved = getSerpResults<SerpItem>(historyId);
    if (saved) {
      results = saved;
      isFromHistory = true;
      activeEntry = history.find((e) => e.id === historyId) ?? null;
    } else {
      error = 'Cette recherche n\'est plus disponible.';
    }
  }

  // Fresh search
  if (!historyId && keyword) {
    if (!creds) {
      error = 'Identifiants DataForSEO manquants. Configurez-les dans les paramètres.';
    } else {
      try {
        results = await fetchSerp(keyword, location, language, device, depth, creds.login, creds.pass);
        if (results.length > 0) {
          const hits: TargetHit[] = targetDomains
            .map((td) => {
              const match = results.find((r) => {
                const d = r.domain ?? extractDomain(r.url);
                return d.includes(td) || td.includes(d);
              });
              return match ? { domain: td, position: match.rank_group } : null;
            })
            .filter((h): h is TargetHit => h !== null);

          const entry: SerpHistoryEntry = {
            id: crypto.randomUUID().slice(0, 8),
            ts: Date.now(),
            keyword,
            location,
            language,
            device,
            depth,
            count: results.length,
            targetHits: hits.length > 0 ? hits : undefined,
          };
          saveSerpSearch(entry, results);
        }
      } catch {
        error = 'Error lors de la requête DataForSEO.';
      }
    }
  }

  const hasQuery = historyId || keyword;

  // Compute which target domains appear in results
  const targetHits: TargetHit[] = targetDomains
    .map((td) => {
      const match = results.find((r) => {
        const d = r.domain ?? extractDomain(r.url);
        return d.includes(td) || td.includes(d);
      });
      return match ? { domain: td, position: match.rank_group } : null;
    })
    .filter((h): h is TargetHit => h !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">SERP Checker</h1>
        <p className="text-sm text-slate-400 mt-1">Analyzes Google results in real time via DataForSEO.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-6">
          {/* Search form */}
          <SearchForm className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm" btnLabel="Analyze" btnClassName="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-blue-600 transition-colors">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Keyword</label>
                <input
                  type="text" name="keyword" defaultValue={activeEntry?.keyword ?? keyword}
                  placeholder="ex: plombier paris" required
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
                <select name="location" defaultValue={activeEntry?.location ?? location}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {LOCATIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
                <select name="language" defaultValue={activeEntry?.language ?? language}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Device</label>
                <select name="device" defaultValue={activeEntry?.device ?? device}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="desktop">Desktop</option>
                  <option value="mobile">Mobile</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Number of results</label>
                <select name="depth" defaultValue={String(activeEntry?.depth ?? depth)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </div>
          </SearchForm>

          {/* Target domain hits summary */}
          {hasQuery && !error && targetHits.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex flex-wrap gap-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 self-center">Target domains</span>
              {targetHits.map((h) => (
                <div key={h.domain} className="flex items-center gap-1.5 bg-white border border-emerald-200 rounded-lg px-3 py-1.5">
                  <span className="text-xs font-bold text-emerald-700">{h.domain}</span>
                  <span className="text-[10px] font-black text-white bg-emerald-500 rounded px-1.5 py-0.5">#{h.position}</span>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          {/* Results */}
          {hasQuery && !error && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Organic results</h2>
                  {isFromHistory && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>
                  )}
                </div>
                <span className="text-xs font-black text-slate-400">{results.length} result{results.length !== 1 ? 's' : ''}</span>
              </div>

              {results.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-slate-400">No organic results found.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {results.map((item, i) => {
                    const domain = item.domain ?? extractDomain(item.url);
                    const isTarget = targetDomains.some((td) => domain.includes(td) || td.includes(domain));
                    return (
                      <div key={i} className={`px-6 py-4 hover:bg-slate-50 transition-colors ${isTarget ? 'bg-emerald-50 border-l-4 border-emerald-400' : ''}`}>
                        <div className="flex items-start gap-4">
                          <span className={`mt-0.5 w-7 h-7 shrink-0 rounded-lg text-xs font-black flex items-center justify-center ${isTarget ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                            {item.rank_group}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <a href={item.url} target="_blank" rel="noopener noreferrer"
                                className="text-sm font-bold text-blue-600 hover:underline leading-snug line-clamp-1">
                                {item.title}
                              </a>
                              {isTarget && (
                                <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">cible</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5 mb-1.5 font-mono truncate">
                              {item.breadcrumb ?? domain}
                            </p>
                            {item.description && (
                              <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{item.description}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column: target domains + history */}
        <div className="space-y-4">
          {/* Target domains */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Target domains</h2>
            </div>
            <div className="p-4 space-y-2">
              <form action={addDomainAction} className="flex gap-2">
                <input
                  type="text" name="domain"
                  placeholder="exemple.com"
                  className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button type="submit" className="shrink-0 px-3 py-2 bg-slate-900 text-white text-xs font-black rounded-lg hover:bg-blue-600 transition-colors">
                  +
                </button>
              </form>
              {targetDomains.length === 0 ? (
                <p className="text-[11px] text-slate-400 px-1">No target domain.</p>
              ) : (
                <div className="space-y-1 pt-1">
                  {targetDomains.map((domain) => (
                    <div key={domain} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-slate-50 rounded-lg">
                      <span className="text-xs font-mono text-slate-700 truncate">{domain}</span>
                      <form action={removeDomainAction.bind(null, domain)}>
                        <button type="submit" className="shrink-0 text-slate-300 hover:text-red-500 transition-colors text-xs font-black">✕</button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">History</h2>
              </div>
              <div className="divide-y divide-slate-50">
                {history.map((entry) => {
                  const isActive = entry.id === historyId;
                  return (
                    <a key={entry.id} href={`/dashboard/serp?history_id=${entry.id}`}
                      className={`block px-4 py-3 hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs font-medium truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{entry.keyword}</p>
                        <span className="shrink-0 text-[10px] text-slate-400">{formatDate(entry.ts)}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{entry.location} · {entry.count} rés.</p>
                      {entry.targetHits && entry.targetHits.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {entry.targetHits.map((h) => (
                            <span key={h.domain} className="inline-flex items-center gap-1 text-[9px] font-black bg-emerald-50 border border-emerald-200 text-emerald-700 rounded px-1.5 py-0.5">
                              <span className="truncate max-w-[80px]">{h.domain}</span>
                              <span className="bg-emerald-500 text-white rounded px-1">#{h.position}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
