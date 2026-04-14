export const dynamic = 'force-dynamic';

import { getCredentials, getSetting } from '@/lib/db';
import { LOCATIONS, LANGUAGES } from '@/lib/geo-options';
import SearchForm from '@/components/SearchForm';

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
  fan_out_queries?: Array<{ keyword?: string }>;
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
  const auth = btoa(`${login}:${pass}`);

  const targetObj =
    targetType === 'domain'
      ? { domain: targetValue, search_filter: 'include', search_scope: ['any'] }
      : { keyword: targetValue, search_filter: 'include', search_scope: ['any'], match_type: 'word_match' };

  const res = await fetch('https://api.dataforseo.com/v3/ai_optimization/llm_mentions/search/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      target: [targetObj],
      platform,
      location_name: location,
      language_name: language,
      limit,
    }]),
  });

  if (!res.ok) return { items: [], error: `API error ${res.status}: ${res.statusText}` };

  const data = await res.json() as {
    tasks?: Array<{
      status_code?: number;
      status_message?: string;
      cost?: number;
      result?: Array<{ items?: MentionItem[] }>;
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

  const defaultLocation = getSetting('default_location') ?? 'France';
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const targetValue = (params.target ?? '').trim();
  const targetType = (params.target_type === 'domain' ? 'domain' : 'keyword') as 'keyword' | 'domain';
  const platform = ['google', 'chat_gpt'].includes(params.platform ?? '') ? params.platform! : 'google';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const limit = Math.min(Math.max(parseInt(params.limit ?? '20', 10) || 20, 1), 100);

  let items: MentionItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;

  if (targetValue) {
    if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const res = await fetchLlmMentions(targetValue, targetType, platform, location, language, limit, creds.login, creds.pass);
      items = res.items;
      cost = res.cost;
      error = res.error ?? null;
    }
  }

  const hasQuery = !!targetValue;
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
                defaultValue={targetValue}
                placeholder={targetType === 'domain' ? 'example.com' : 'plombier paris'}
                className="w-full h-[42px] px-4 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* Platform */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Platform</label>
            <select name="platform" defaultValue={platform}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">
              <option value="google">Google AI</option>
              <option value="chat_gpt">ChatGPT</option>
            </select>
          </div>

          {/* Limit */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Results limit</label>
            <select name="limit" defaultValue={String(limit)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
            <select name="location" defaultValue={location}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">
              {LOCATIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          {/* Language */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
            <select name="language" defaultValue={language}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
              AI Mentions — {PLATFORM_LABELS[platform] ?? platform}
            </h2>
            <div className="flex items-center gap-3">
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
                              {q.keyword}
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
    </div>
  );
}
