import {
  getCredentials,
  getAiVisibilityHistory,
  saveAiVisibilitySearch,
  getAiVisibilityResult,
  type AiVisibilityEntry,
  type AiVisibilityMode,
} from '@/lib/db';
import { stableSearchId } from '@/lib/dedupe';
import SearchForm from '@/components/SearchForm';
import LeaderboardTables from './LeaderboardTables';

// ---- Types ----

interface AggMetric {
  key: string | number;
  mentions: number;
  ai_search_volume: number;
}

interface AggregatedMetrics {
  location?: AggMetric[];
  language?: AggMetric[];
  platform?: AggMetric[];
  sources_domain?: AggMetric[];
  search_results_domain?: AggMetric[];
  brand_entities_title?: AggMetric[];
  brand_entities_category?: AggMetric[];
  total?: { mentions: number; ai_search_volume: number };
}

interface TargetMetricsResult {
  total_count: number;
  aggregated_metrics: AggregatedMetrics;
}

export interface LeaderboardItem {
  domain?: string;
  brand?: string;
  total: { mentions: number; ai_search_volume: number };
}

interface LeaderboardResult {
  domains: LeaderboardItem[];
  brands: LeaderboardItem[];
}

interface SearchParams {
  mode?: string;
  target?: string;
  target_type?: string;
  platform?: string;
  limit?: string;
  history_id?: string;
}

// ---- API ----
// Verified via live test calls: `target` must be an array of {domain|keyword, search_filter,
// search_scope} objects even for a single target. Neither target_metrics nor
// top_mentioned_domains/top_mentioned_brands accept location_name/location_code — location and
// language are output breakdown dimensions in aggregated_metrics, not input filters.

function buildTargetObj(value: string, type: 'domain' | 'keyword') {
  return type === 'domain'
    ? { domain: value, search_filter: 'include', search_scope: ['any'] }
    : { keyword: value, search_filter: 'include', search_scope: ['any'], match_type: 'word_match' };
}

async function callLlmMentions<T>(
  fn: string, body: Record<string, unknown>, login: string, pass: string,
): Promise<{ result?: T; cost?: number; error?: string }> {
  const auth = btoa(`${login}:${pass}`);
  const res = await fetch(`https://api.dataforseo.com/v3/ai_optimization/llm_mentions/${fn}/live`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([body]),
  });
  if (!res.ok) return { error: `API error ${res.status}: ${res.statusText}` };
  const data = await res.json() as {
    tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: T[] }>;
  };
  const task = data?.tasks?.[0];
  if (!task) return { error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { error: `DataForSEO: ${task.status_message}` };
  return { result: task.result?.[0], cost: task.cost };
}

async function fetchTargetMetrics(
  value: string, type: 'domain' | 'keyword', platform: string, login: string, pass: string,
): Promise<{ result?: TargetMetricsResult; cost?: number; error?: string }> {
  return callLlmMentions<TargetMetricsResult>(
    'target_metrics',
    { target: [buildTargetObj(value, type)], platform },
    login, pass,
  );
}

async function fetchLeaderboard(
  value: string, type: 'domain' | 'keyword', platform: string, limit: number, login: string, pass: string,
): Promise<{ result?: LeaderboardResult; cost?: number; error?: string }> {
  const body = { target: [buildTargetObj(value, type)], platform, limit };
  const [domainsRes, brandsRes] = await Promise.all([
    callLlmMentions<{ items?: LeaderboardItem[] }>('top_mentioned_domains', body, login, pass),
    callLlmMentions<{ items?: LeaderboardItem[] }>('top_mentioned_brands', body, login, pass),
  ]);
  if (domainsRes.error || brandsRes.error) {
    return { error: domainsRes.error ?? brandsRes.error };
  }
  return {
    result: { domains: domainsRes.result?.items ?? [], brands: brandsRes.result?.items ?? [] },
    cost: (domainsRes.cost ?? 0) + (brandsRes.cost ?? 0),
  };
}

// ---- UI helpers ----

const PLATFORM_LABELS: Record<string, string> = { google: 'Google AI', chat_gpt: 'ChatGPT' };

function fmt(n?: number) { return n != null ? n.toLocaleString('en-GB') : '—'; }
function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

function BreakdownList({ title, items, unit }: { title: string; items?: AggMetric[]; unit: string }) {
  if (!items || items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.mentions), 1);
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
      <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">{title}</h2>
      <div className="space-y-2">
        {items.slice(0, 8).map((item, i) => {
          const pct = Math.round((item.mentions / max) * 100);
          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">{String(item.key)}</span>
                <span className="text-xs font-mono text-slate-500 shrink-0">{fmt(item.mentions)} {unit}</span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-violet-400 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Page ----

export default async function AiVisibilityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const mode: AiVisibilityMode = params.mode === 'leaderboard' ? 'leaderboard' : 'target';
  const targetValue = (params.target ?? '').trim();
  const targetType = (params.target_type === 'domain' ? 'domain' : 'keyword') as 'keyword' | 'domain';
  const platform = ['google', 'chat_gpt'].includes(params.platform ?? '') ? params.platform! : 'chat_gpt';
  const limit = Math.min(Math.max(parseInt(params.limit ?? '10', 10) || 10, 1), 50);

  let targetResult: TargetMetricsResult | null = null;
  let leaderboardResult: LeaderboardResult | null = null;
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: AiVisibilityEntry | null = null;

  if (historyId) {
    if (mode === 'target') targetResult = getAiVisibilityResult<TargetMetricsResult>(historyId);
    else leaderboardResult = getAiVisibilityResult<LeaderboardResult>(historyId);
    if (targetResult || leaderboardResult) {
      isFromHistory = true;
      activeEntry = getAiVisibilityHistory().find((e) => e.id === historyId) ?? null;
    } else {
      error = 'This search is no longer available.';
    }
  } else if (targetValue) {
    if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const dedupeId = stableSearchId(['ai-visibility', mode, targetValue, targetType, platform, limit]);
      const cached = getAiVisibilityResult<TargetMetricsResult | LeaderboardResult>(dedupeId);

      if (cached) {
        if (mode === 'target') targetResult = cached as TargetMetricsResult;
        else leaderboardResult = cached as LeaderboardResult;
        cost = getAiVisibilityHistory().find((e) => e.id === dedupeId)?.cost;
      } else {
        const res = mode === 'target'
          ? await fetchTargetMetrics(targetValue, targetType, platform, creds.login, creds.pass)
          : await fetchLeaderboard(targetValue, targetType, platform, limit, creds.login, creds.pass);

        error = res.error ?? null;
        cost = res.cost;

        if (!error && res.result) {
          if (mode === 'target') targetResult = res.result as TargetMetricsResult;
          else leaderboardResult = res.result as LeaderboardResult;

          const entry: AiVisibilityEntry = { id: dedupeId, ts: Date.now(), mode, target: targetValue, platform, cost };
          saveAiVisibilitySearch(entry, res.result);
        }
      }
    }
  }

  const history = getAiVisibilityHistory();
  const hasQuery = !!(historyId || targetValue);
  const displayTarget = activeEntry?.target ?? targetValue;
  const agg = targetResult?.aggregated_metrics;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">AI Visibility</h1>
        <p className="text-sm text-slate-400 mt-1">How often a domain/brand is mentioned by LLMs, and who dominates a topic — via DataForSEO LLM Mentions.</p>
      </div>

      <SearchForm
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4"
        btnLabel={mode === 'target' ? 'Analyze' : 'Get leaderboard'}
        btnClassName="w-full bg-slate-900 dark:bg-slate-700 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-violet-600 transition-colors"
      >
        <div className="flex gap-2 mb-2">
          {(['target', 'leaderboard'] as const).map((m) => (
            <a
              key={m}
              href={`/dashboard/ai-visibility?mode=${m}`}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${
                mode === m ? 'bg-violet-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {m === 'target' ? 'My domain/brand' : 'Topic leaderboard'}
            </a>
          ))}
        </div>
        <input type="hidden" name="mode" value={mode} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 flex gap-2">
            <div className="shrink-0">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Type</label>
              <select name="target_type" defaultValue={targetType}
                className="h-[42px] px-3 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800">
                <option value="domain">Domain</option>
                <option value="keyword">Keyword</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
                {mode === 'target' ? 'Target' : 'Topic'}
              </label>
              <input
                name="target"
                type="text"
                defaultValue={displayTarget}
                placeholder={targetType === 'domain' ? 'example.com' : mode === 'target' ? 'your brand name' : 'best plumber'}
                required
                className="w-full h-[42px] px-4 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Platform</label>
            <select name="platform" defaultValue={platform}
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800">
              <option value="chat_gpt">ChatGPT</option>
              <option value="google">Google AI</option>
            </select>
          </div>

          {mode === 'leaderboard' && (
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Results per list</label>
              <select name="limit" defaultValue={String(limit)}
                className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800">
                {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}
        </div>
      </SearchForm>

      {error && <div className="bg-red-50 dark:bg-red-950 border border-red-100 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

      {hasQuery && !error && mode === 'target' && targetResult && (
        <div id="results" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Target</span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{displayTarget}</span>
            {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
            {cost !== undefined && <span className="text-[10px] font-mono text-slate-400 ml-auto">cost: ${cost.toFixed(4)}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total mentions</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{fmt(agg?.total?.mentions)}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">AI search volume</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{fmt(agg?.total?.ai_search_volume)}</p>
            </div>
          </div>

          {(!agg?.total || agg.total.mentions === 0) ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-6 py-12 text-center text-sm text-slate-400">
              No LLM mentions found for this target on {PLATFORM_LABELS[platform]}.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BreakdownList title="By platform" items={agg?.platform} unit="mentions" />
              <BreakdownList title="By location" items={agg?.location} unit="mentions" />
              <BreakdownList title="Top referring source domains" items={agg?.sources_domain} unit="mentions" />
              <BreakdownList title="Top search-result domains" items={agg?.search_results_domain} unit="mentions" />
              <BreakdownList title="Brand entities mentioned alongside" items={agg?.brand_entities_title} unit="mentions" />
              <BreakdownList title="Brand entity categories" items={agg?.brand_entities_category} unit="mentions" />
            </div>
          )}
        </div>
      )}

      {hasQuery && !error && mode === 'leaderboard' && leaderboardResult && (
        <div id="results">
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Topic</span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{displayTarget}</span>
            {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-md">History</span>}
            {cost !== undefined && <span className="text-[10px] font-mono text-slate-400 ml-auto">cost: ${cost.toFixed(4)}</span>}
          </div>
          <LeaderboardTables domains={leaderboardResult.domains} brands={leaderboardResult.brands} topic={displayTarget} />
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
                <a key={entry.id} href={`/dashboard/ai-visibility?history_id=${entry.id}&mode=${entry.mode}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.target}</p>
                      <span className="text-[10px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                        {entry.mode === 'target' ? 'Overview' : 'Leaderboard'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {PLATFORM_LABELS[entry.platform] ?? entry.platform}
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
