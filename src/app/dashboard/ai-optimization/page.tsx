export const dynamic = 'force-dynamic';

import {
  getCredentials, getSetting,
  getAiOptimizationHistory, saveAiOptimizationSearch, getAiOptimizationResults,
  type AiOptimizationEntry,
} from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import SearchForm from '@/components/SearchForm';
import AiOptimizationTargetingFields from './AiOptimizationTargetingFields';

// ---- Types ----

interface Source {
  url?: string;
  domain?: string;
  title?: string;
}

interface MonthlySearch {
  year: number;
  month: number;
  search_volume: number;
}

interface MentionItem {
  platform?: string;
  model_name?: string;
  question?: string;
  answer?: string;
  sources?: Source[];
  ai_search_volume?: number;
  monthly_searches?: MonthlySearch[];
  brand_entities?: Array<{ title?: string; category?: string }>;
  // The API returns these as plain strings, not { keyword } objects.
  fan_out_queries?: string[];
  first_response_at?: string;
  last_response_at?: string;
}

interface SearchParams {
  target?: string;
  target_type?: string;
  platform?: string;
  location?: string;
  language?: string;
  limit?: string;
  history_id?: string;
}

// ---- API ----

async function fetchLlmMentions(
  targetValue: string,
  targetType: 'keyword' | 'domain',
  platform: string,
  location: string,
  language: string,
  limit: number,
  login: string,
  pass: string,
): Promise<{ items: MentionItem[]; cost?: number; error?: string }> {
  const targetObj =
    targetType === 'domain'
      ? { domain: targetValue, search_filter: 'include', search_scope: ['any'] }
      : { keyword: targetValue, search_filter: 'include', search_scope: ['any'], match_type: 'word_match' };

  // ChatGPT isn't geo/language-targeted like Google AI is — the API rejects location_name/
  // language_name outright ("Invalid Field") when platform is chat_gpt, so only send them for google.
  const body: Record<string, unknown> = { target: [targetObj], platform, limit };
  if (platform === 'google') {
    body.location_name = location;
    body.language_name = language;
  }

  const { result, cost, error } = await callDataForSeoFirst<{ items?: MentionItem[] }>(
    'ai_optimization/llm_mentions/search/live', body, { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

// ---- UI helpers ----

const PLATFORM_LABELS: Record<string, string> = {
  google: 'Google AI',
  chat_gpt: 'ChatGPT',
};

const MODEL_COLORS: Record<string, string> = {
  google_ai_overview: 'text-blue-700 bg-blue-50 border-blue-100',
  gpt_4o: 'text-emerald-700 bg-emerald-50 border-emerald-100',
  gpt_4o_mini: 'text-teal-700 bg-teal-50 border-teal-100',
  gpt_4_turbo: 'text-cyan-700 bg-cyan-50 border-cyan-100',
  gemini: 'text-violet-700 bg-violet-50 border-violet-100',
};

function ModelBadge({ model }: { model?: string }) {
  if (!model) return null;
  const label = model.replace(/_/g, ' ');
  const color = MODEL_COLORS[model] ?? 'text-slate-600 bg-slate-50 border-slate-200';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-black border uppercase tracking-wider ${color}`}>
      {label}
    </span>
  );
}

function Sparkline({ monthly }: { monthly?: MonthlySearch[] }) {
  const data = (monthly ?? []).slice(-12);
  if (data.length === 0) return null;
  const max = Math.max(...data.map((m) => m.search_volume ?? 0), 1);
  return (
    <div className="flex items-end gap-0.5 h-5 mt-1"
      title={data.map((m) => `${m.month}/${m.year}: ${m.search_volume?.toLocaleString('en-GB')}`).join(' · ')}>
      {data.map((m, i) => (
        <div
          key={i}
          className="w-1.5 bg-violet-300 rounded-sm"
          style={{ height: `${Math.max(2, Math.round(((m.search_volume ?? 0) / max) * 20))}px` }}
        />
      ))}
    </div>
  );
}

function truncate(text: string, max: number) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function formatDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Page ----

export default async function AiOptimizationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'France');
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const targetValue = (params.target ?? '').trim();
  const targetType = (params.target_type === 'domain' ? 'domain' : 'keyword') as 'keyword' | 'domain';
  const platform = ['google', 'chat_gpt'].includes(params.platform ?? '') ? params.platform! : 'google';
  // Per DataForSEO's docs, ChatGPT mentions are available for United States / English only.
  const location = platform === 'chat_gpt' ? 'United States' : (params.location ?? defaultLocation);
  const language = platform === 'chat_gpt' ? 'English' : (params.language ?? defaultLanguage);
  const limit = Math.min(Math.max(parseInt(params.limit ?? '20', 10) || 20, 1), 100);

  let items: MentionItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: AiOptimizationEntry | null = null;

  if (historyId) {
    const cached = getAiOptimizationResults<MentionItem>(historyId);
    if (cached) {
      items = cached;
      isFromHistory = true;
      activeEntry = getAiOptimizationHistory().find((e) => e.id === historyId) ?? null;
    } else {
      error = 'This search is no longer available.';
    }
  } else if (targetValue) {
    if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const dedupeId = stableSearchId(['ai-optimization', targetValue, targetType, platform, location, language, limit]);
      const cached = getAiOptimizationResults<MentionItem>(dedupeId);

      if (cached) {
        items = cached;
        cost = getAiOptimizationHistory().find((e) => e.id === dedupeId)?.cost;
      } else {
        const res = await fetchLlmMentions(targetValue, targetType, platform, location, language, limit, creds.login, creds.pass);
        items = res.items;
        cost = res.cost;
        error = res.error ?? null;

        if (!error) {
          const entry: AiOptimizationEntry = {
            id: dedupeId, ts: Date.now(), target: targetValue, targetType, platform, location, language, limit, cost,
          };
          saveAiOptimizationSearch(entry, items);
        }
      }
    }
  }

  const history = getAiOptimizationHistory();
  const displayTarget = activeEntry?.target ?? targetValue;
  const hasQuery = !!(historyId || targetValue);
  const totalVolume = items.reduce((s, i) => s + (i.ai_search_volume ?? 0), 0);
  const uniqueModels = [...new Set(items.map((i) => i.model_name).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">AI Optimization</h1>
        <p className="text-sm text-slate-400 mt-1">Track how AI models mention your keyword or domain via DataForSEO LLM Mentions.</p>
      </div>

      {/* Form */}
      <SearchForm
        className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4"
        btnLabel="Analyze"
        btnClassName="w-full bg-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-violet-600 transition-colors"
        loadingLabel="Fetching AI mentions…"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Target type + input */}
          <div className="sm:col-span-2 flex gap-2">
            <div className="shrink-0">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Type</label>
              <select name="target_type" defaultValue={targetType}
                className="h-[42px] px-3 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">
                <option value="keyword">Keyword</option>
                <option value="domain">Domain</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Target</label>
              <input
                name="target"
                type="text"
                defaultValue={displayTarget}
                placeholder={targetType === 'domain' ? 'example.com' : 'plombier paris'}
                className="w-full h-[42px] px-4 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          <AiOptimizationTargetingFields
            defaultPlatform={platform}
            defaultLimit={String(limit)}
            defaultLocation={location}
            defaultLanguage={language}
          />
        </div>
      </SearchForm>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {/* Summary stats */}
      {hasQuery && !error && items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mentions found</p>
            <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{items.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total AI volume</p>
            <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{totalVolume.toLocaleString('en-GB')}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Models</p>
            <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{uniqueModels.length}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {hasQuery && !error && (
        <div id="results" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
              AI Mentions — {PLATFORM_LABELS[platform] ?? platform}
            </h2>
            <div className="flex items-center gap-3">
              {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md">History</span>}
              {cost !== undefined && (
                <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>
              )}
              <span className="text-xs font-black text-slate-400">{items.length} result{items.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-400">
              No AI mentions found for this target.
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {items.map((item, i) => (
                <div key={i} className="px-6 py-5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ModelBadge model={item.model_name} />
                      {item.ai_search_volume != null && (
                        <span className="text-[10px] font-black text-violet-600 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
                          {item.ai_search_volume.toLocaleString('en-GB')} AI vol
                        </span>
                      )}
                    </div>
                    {(item.first_response_at || item.last_response_at) && (
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {formatDate(item.last_response_at ?? item.first_response_at)}
                      </span>
                    )}
                  </div>

                  {/* Question */}
                  {item.question && (
                    <p className="text-sm font-semibold text-slate-900 mb-2">{item.question}</p>
                  )}

                  {/* Answer */}
                  {item.answer && (
                    <p className="text-sm text-slate-600 leading-relaxed mb-3">
                      {truncate(item.answer.replace(/#+\s/g, '').replace(/\*\*/g, ''), 400)}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {/* Sources */}
                    {(item.sources?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Sources</p>
                        <div className="flex flex-wrap gap-1">
                          {item.sources!.slice(0, 5).map((s, si) => (
                            <a
                              key={si}
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={s.title ?? s.url}
                              className="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md hover:bg-blue-100 transition-colors max-w-[160px] truncate"
                            >
                              {s.domain ?? s.url}
                            </a>
                          ))}
                          {(item.sources?.length ?? 0) > 5 && (
                            <span className="text-[11px] text-slate-400 px-2 py-0.5">
                              +{item.sources!.length - 5} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Fan-out queries */}
                    {(item.fan_out_queries?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Related queries</p>
                        <div className="flex flex-wrap gap-1">
                          {item.fan_out_queries!.slice(0, 5).map((q, qi) => (
                            <span key={qi} className="text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                              {q}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Trend sparkline */}
                  {(item.monthly_searches?.length ?? 0) > 0 && (
                    <div className="mt-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">AI volume trend</p>
                      <Sparkline monthly={item.monthly_searches} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasQuery && !error && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-16 text-center">
          <p className="text-slate-400 text-sm">Enter a keyword or domain above to see how AI models mention it.</p>
          <p className="text-slate-300 text-xs mt-1">Powered by DataForSEO LLM Mentions Search API.</p>
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
                <a key={entry.id} href={`/dashboard/ai-optimization?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{entry.target}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {PLATFORM_LABELS[entry.platform] ?? entry.platform}
                      {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {new Date(entry.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
