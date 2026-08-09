export const dynamic = 'force-dynamic';

import {
  getCredentials,
  getLlmResponseHistory, saveLlmResponseSearch, getLlmResponseResult,
  type LlmResponseEntry,
} from '@/lib/db';
import { PLATFORM_LABELS, MODELS_BY_PLATFORM, isValidPlatform, type LlmPlatform } from '@/lib/llm-options';
import { stableSearchId } from '@/lib/dedupe';
import LlmResponseForm from './LlmResponseForm';
import HistorySidebar from '@/components/HistorySidebar';

// ---- Types ----

interface Annotation {
  title?: string;
  url?: string;
}

interface ResponseSection {
  type?: string;
  text?: string;
  annotations?: Annotation[];
}

interface ResponseItem {
  type?: string;
  sections?: ResponseSection[];
}

interface LlmResponseResult {
  platform?: string;
  model_name?: string;
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  web_search?: boolean;
  money_spent?: number;
  datetime?: string;
  items?: ResponseItem[];
  fan_out_queries?: Array<{ keyword?: string }> | null;
}

interface SearchParams {
  platform?: string;
  model?: string;
  user_prompt?: string;
  system_message?: string;
  web_search?: string;
  country_code?: string;
  history_id?: string;
}

// ---- API ----

async function fetchLlmResponse(
  platform: LlmPlatform,
  prompt: string,
  model: string,
  webSearch: boolean,
  countryCode: string,
  systemMessage: string,
  login: string,
  pass: string,
): Promise<{ result?: LlmResponseResult; cost?: number; error?: string }> {
  const auth = btoa(`${login}:${pass}`);

  const body: Record<string, unknown> = { user_prompt: prompt, model_name: model };
  if (platform !== 'perplexity') body.web_search = webSearch;
  if (systemMessage) body.system_message = systemMessage;
  if (countryCode && (webSearch || platform === 'perplexity')) body.web_search_country_iso_code = countryCode.toUpperCase();

  const res = await fetch(`https://api.dataforseo.com/v3/ai_optimization/${platform}/llm_responses/live`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([body]),
  });
  if (!res.ok) return { error: `API error ${res.status}: ${res.statusText}` };

  const data = await res.json() as {
    tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: LlmResponseResult[] }>;
  };
  const task = data?.tasks?.[0];
  if (!task) return { error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { error: `DataForSEO: ${task.status_message}` };
  return { result: task.result?.[0], cost: task.cost };
}

// ---- UI helpers ----

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ResponseText({ items }: { items?: ResponseItem[] }) {
  const messageItems = (items ?? []).filter((it) => it.type !== 'reasoning');
  if (messageItems.length === 0) return <p className="text-sm text-slate-400">No response text.</p>;

  const allAnnotations = messageItems.flatMap((it) => it.sections ?? []).flatMap((s) => s.annotations ?? []);

  return (
    <div className="space-y-4">
      {messageItems.map((item, i) => (
        <div key={i} className="space-y-2">
          {(item.sections ?? []).map((section, si) => (
            <p key={si} className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {section.text}
            </p>
          ))}
        </div>
      ))}
      {allAnnotations.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Sources</p>
          <div className="flex flex-wrap gap-1.5">
            {allAnnotations.map((a, ai) => (
              <a
                key={ai}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                title={a.title ?? a.url}
                className="text-[11px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 px-2 py-0.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors max-w-[220px] truncate"
              >
                {a.title ?? a.url}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-sm font-black text-slate-800 dark:text-slate-100 tabular-nums">{value}</p>
    </div>
  );
}

// ---- Page ----

export default async function LlmResponsesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const platform: LlmPlatform = isValidPlatform(params.platform ?? '') ? (params.platform as LlmPlatform) : 'chat_gpt';
  const model = (params.model ?? MODELS_BY_PLATFORM[platform][0]).trim();
  const prompt = (params.user_prompt ?? '').trim();
  const systemMessage = (params.system_message ?? '').trim();
  const webSearch = params.web_search === 'on';
  const countryCode = (params.country_code ?? '').trim();

  let result: LlmResponseResult | null = null;
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: LlmResponseEntry | null = null;

  if (historyId) {
    const saved = getLlmResponseResult<LlmResponseResult>(historyId);
    if (saved) {
      result = saved;
      isFromHistory = true;
      activeEntry = getLlmResponseHistory().find((e) => e.id === historyId) ?? null;
    } else {
      error = 'Search no longer available.';
    }
  }

  const hasQuery = !!(historyId || prompt);

  if (!historyId && prompt) {
    const dedupeId = stableSearchId(['llm-responses', platform, model, prompt, systemMessage, webSearch, countryCode]);
    const cached = getLlmResponseResult<LlmResponseResult>(dedupeId);

    if (cached) {
      result = cached;
      const cachedEntry = getLlmResponseHistory().find((e) => e.id === dedupeId);
      cost = cachedEntry?.cost;
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const res = await fetchLlmResponse(platform, prompt, model, webSearch, countryCode, systemMessage, creds.login, creds.pass);
      result = res.result ?? null;
      cost = res.cost;
      error = res.error ?? null;

      if (!error && result) {
        const entry: LlmResponseEntry = {
          id: dedupeId,
          ts: Date.now(),
          platform,
          model,
          prompt,
          webSearch,
          cost,
        };
        saveLlmResponseSearch(entry, result);
      }
    }
  }

  const history = getLlmResponseHistory();
  const displayPlatform = (isFromHistory && activeEntry ? activeEntry.platform : platform) as LlmPlatform;
  const displayModel = isFromHistory && activeEntry ? activeEntry.model : model;
  const displayPrompt = isFromHistory && activeEntry ? activeEntry.prompt : prompt;

  const historyItems = history.map((entry) => {
    const isActive = entry.id === historyId;
    return (
      <a key={entry.id} href={`/dashboard/llm-responses?history_id=${entry.id}#results`}
        className={`flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950/40' : ''}`}>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.prompt}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {PLATFORM_LABELS[entry.platform] ?? entry.platform} · {entry.model}
            {entry.cost !== undefined ? ` · $${entry.cost.toFixed(5)}` : ''}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
      </a>
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">AI Prompt Test</h1>
        <p className="text-sm text-slate-400 mt-1">Ask ChatGPT, Claude, Gemini or Perplexity a question and see exactly what they answer — with sources.</p>
      </div>

      {!creds && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 text-amber-700 dark:text-amber-400 text-sm rounded-xl px-4 py-3">
          DataForSEO credentials missing. Configure them in{' '}
          <a href="/dashboard/settings" className="underline font-semibold">settings</a>.
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-6">
          <LlmResponseForm
            disabled={!creds}
            defaults={{ platform, model, prompt, systemMessage, webSearch, countryCode }}
          />

          {error && <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

          {hasQuery && !error && result && (
            <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-violet-600 bg-violet-50 dark:bg-violet-950/40 border border-violet-100 dark:border-violet-900 px-2 py-0.5 rounded-md">
                    {PLATFORM_LABELS[displayPlatform] ?? displayPlatform}
                  </span>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{result.model_name ?? displayModel}</span>
                  {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md">History</span>}
                </div>
                {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(5)}</span>}
              </div>

              <div className="px-6 py-5 space-y-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Prompt</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{displayPrompt}</p>
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Response</p>
                  <ResponseText items={result.items} />
                </div>

                {(result.fan_out_queries?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Related queries</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.fan_out_queries!.map((q, qi) => (
                        <span key={qi} className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                          {q.keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <StatChip label="Input tokens" value={(result.input_tokens ?? 0).toLocaleString('en-GB')} />
                  <StatChip label="Output tokens" value={(result.output_tokens ?? 0).toLocaleString('en-GB')} />
                  {result.reasoning_tokens !== undefined && (
                    <StatChip label="Reasoning tokens" value={result.reasoning_tokens.toLocaleString('en-GB')} />
                  )}
                  <StatChip label="Web search" value={result.web_search ? 'Yes' : 'No'} />
                </div>
              </div>
            </div>
          )}

          {!hasQuery && !error && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm px-6 py-16 text-center">
              <p className="text-slate-400 text-sm">Ask a question above to see how an AI model actually answers it.</p>
              <p className="text-slate-300 dark:text-slate-600 text-xs mt-1">Powered by DataForSEO LLM Responses API.</p>
            </div>
          )}
        </div>

        {history.length > 0 && (
          <HistorySidebar title="History" items={historyItems} />
        )}
      </div>
    </div>
  );
}
