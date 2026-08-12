export const dynamic = 'force-dynamic';

import {
  getCredentials, getSetting,
  getFanOutHistory, saveFanOutSearch, getFanOutResults, getFanOutSeedSummary,
  type FanOutEntry,
} from '@/lib/db';
import { LANGUAGES, toLabsCountry } from '@/lib/geo-options';
import { stableSearchId } from '@/lib/dedupe';
import LocationPicker from '@/components/LocationPicker';
import SearchForm from '@/components/SearchForm';
import HistorySidebar from '@/components/HistorySidebar';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import FanOutQueryTable from './FanOutQueryTable';

// ---- Types ----

const MAX_SEEDS = 20;

interface MonthlyAiSearch {
  year: number;
  month: number;
  ai_search_volume: number;
}

interface MentionItem {
  question?: string;
  // The API returns these as plain strings, not { keyword } objects.
  fan_out_queries?: string[];
}

interface FanOutQueryItem {
  keyword: string;
  ai_search_volume?: number;
  ai_monthly_searches?: MonthlyAiSearch[];
  seeds: string[];
  mentions: number;
}

interface SeedStat {
  seed: string;
  mentions: number;
  fanOutQueries: number;
  error?: string;
}

interface AiKeywordVolumeItem {
  keyword?: string;
  ai_search_volume?: number;
  ai_monthly_searches?: MonthlyAiSearch[];
}

interface SearchParams {
  seeds?: string;
  platform?: string;
  location?: string;
  language?: string;
  limit?: string;
  history_id?: string;
}

// ---- API ----

/** One request per seed keyword (the live endpoint rejects more than one task per POST body —
 * "You can set only one task at a time"), fired in parallel. Each is scoped to fan_out_queries
 * so a match is a fan-out query DataForSEO generated when answering some unrelated prompt — not
 * a mention of the seed itself. */
async function fetchFanOutMentions(
  seeds: string[],
  platform: string,
  location: string,
  language: string,
  limit: number,
  login: string,
  pass: string,
): Promise<{ perSeed: Array<{ seed: string; items: MentionItem[]; error?: string }>; totalCost: number }> {
  const auth = btoa(`${login}:${pass}`);

  const perSeed = await Promise.all(seeds.map(async (seed) => {
    const targetObj = { keyword: seed, search_filter: 'include', search_scope: ['fan_out_queries'], match_type: 'word_match' };
    const body: Record<string, unknown> = { target: [targetObj], platform, limit };
    // ChatGPT isn't geo/language-targeted like Google AI is — the API rejects location_name/
    // language_name outright when platform is chat_gpt, so only send them for google.
    if (platform === 'google') {
      body.location_name = location;
      body.language_name = language;
    }

    const res = await fetch('https://api.dataforseo.com/v3/ai_optimization/llm_mentions/search/live', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([body]),
    });

    if (!res.ok) return { seed, items: [] as MentionItem[], error: `API error ${res.status}: ${res.statusText}`, cost: 0 };

    const data = await res.json() as {
      tasks?: Array<{
        status_code?: number;
        status_message?: string;
        cost?: number;
        result?: Array<{ items?: MentionItem[] }>;
      }>;
    };

    const task = data?.tasks?.[0];
    if (!task) return { seed, items: [] as MentionItem[], error: 'Empty API response.', cost: 0 };
    if (task.status_code && task.status_code !== 20000) return { seed, items: [] as MentionItem[], error: `DataForSEO: ${task.status_message}`, cost: 0 };
    return { seed, items: task.result?.[0]?.items ?? [], cost: task.cost ?? 0 };
  }));

  const totalCost = perSeed.reduce((s, r) => s + r.cost, 0);
  return { perSeed, totalCost };
}

async function fetchAiKeywordVolume(
  keywords: string[],
  location: string,
  language: string,
  login: string,
  pass: string,
): Promise<{ items: AiKeywordVolumeItem[]; cost?: number; error?: string }> {
  if (keywords.length === 0) return { items: [] };
  const auth = btoa(`${login}:${pass}`);
  const res = await fetch('https://api.dataforseo.com/v3/ai_optimization/ai_keyword_data/keywords_search_volume/live', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ keywords, location_name: location, language_name: language }]),
  });
  if (!res.ok) return { items: [], error: `API error ${res.status}: ${res.statusText}` };

  const data = await res.json() as {
    tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: AiKeywordVolumeItem[] }> }>;
  };
  const task = data?.tasks?.[0];
  if (!task) return { items: [], error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { items: [], error: `DataForSEO: ${task.status_message}` };
  return { items: task.result?.[0]?.items ?? [], cost: task.cost };
}

/** Runs both stages: discover fan-out queries per seed, then enrich the deduped set with AI search volume. */
async function runFanOut(
  seeds: string[],
  platform: string,
  location: string,
  language: string,
  limit: number,
  login: string,
  pass: string,
): Promise<{ items: FanOutQueryItem[]; seedStats: SeedStat[]; cost: number; error?: string }> {
  const { perSeed, totalCost: mentionsCost } = await fetchFanOutMentions(seeds, platform, location, language, limit, login, pass);

  const queryMap = new Map<string, FanOutQueryItem>();
  const seedStats: SeedStat[] = [];

  for (const { seed, items, error } of perSeed) {
    let fanOutCount = 0;
    for (const item of items) {
      for (const fq of item.fan_out_queries ?? []) {
        const keyword = fq?.trim();
        if (!keyword) continue;
        fanOutCount++;
        const key = keyword.toLowerCase();
        const existing = queryMap.get(key);
        if (existing) {
          if (!existing.seeds.includes(seed)) existing.seeds.push(seed);
          existing.mentions++;
        } else {
          queryMap.set(key, { keyword, seeds: [seed], mentions: 1 });
        }
      }
    }
    seedStats.push({ seed, mentions: items.length, fanOutQueries: fanOutCount, error });
  }

  // Most-surfaced queries first, so a truncation at 1000 (the AI Keyword Data endpoint's cap) drops the least relevant.
  const discovered = [...queryMap.values()].sort((a, b) => b.mentions - a.mentions).slice(0, 1000);

  if (discovered.length === 0) {
    return { items: [], seedStats, cost: mentionsCost };
  }

  const volumeRes = await fetchAiKeywordVolume(discovered.map((d) => d.keyword), location, language, login, pass);
  if (volumeRes.error) {
    return { items: discovered, seedStats, cost: mentionsCost, error: volumeRes.error };
  }

  const volumeByKeyword = new Map(volumeRes.items.map((v) => [v.keyword?.toLowerCase() ?? '', v]));
  const merged = discovered.map((d) => {
    const v = volumeByKeyword.get(d.keyword.toLowerCase());
    return { ...d, ai_search_volume: v?.ai_search_volume, ai_monthly_searches: v?.ai_monthly_searches };
  });

  return { items: merged, seedStats, cost: mentionsCost + (volumeRes.cost ?? 0) };
}

// ---- UI helpers ----

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- Page ----

export default async function QueryFanOutPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'France');
  const defaultLanguage = getSetting('default_language') ?? 'French';

  const seedsRaw = params.seeds?.trim() ?? '';
  const platform = ['google', 'chat_gpt'].includes(params.platform ?? '') ? params.platform! : 'google';
  // Per DataForSEO's docs, ChatGPT mentions are available for United States / English only — force
  // both rather than letting the picker desync the AI-volume lookup from the market the fan-out
  // queries actually came from (and so identical ChatGPT searches share one cache entry regardless
  // of what location/language happened to be selected).
  const location = platform === 'chat_gpt' ? 'United States' : (params.location ?? defaultLocation);
  const language = platform === 'chat_gpt' ? 'English' : (params.language ?? defaultLanguage);
  const limit = Math.min(Math.max(parseInt(params.limit ?? '20', 10) || 20, 1), 100);

  let items: FanOutQueryItem[] = [];
  let seedStats: SeedStat[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: FanOutEntry | null = null;

  if (historyId) {
    const saved = getFanOutResults<FanOutQueryItem>(historyId);
    const savedStats = getFanOutSeedSummary<SeedStat>(historyId);
    if (saved) {
      items = saved;
      seedStats = savedStats ?? [];
      isFromHistory = true;
      activeEntry = getFanOutHistory().find((e) => e.id === historyId) ?? null;
      cost = activeEntry?.cost;
    } else {
      error = 'Search no longer available.';
    }
  }

  const hasQuery = !!(historyId || seedsRaw);

  if (!historyId && seedsRaw) {
    const seeds = [...new Set(seedsRaw.split('\n').map((s) => s.trim()).filter(Boolean))].slice(0, MAX_SEEDS);
    const dedupeId = stableSearchId(['query-fan-out', seeds.join('\n'), platform, location, language, limit]);
    const cachedItems = getFanOutResults<FanOutQueryItem>(dedupeId);
    const cachedStats = getFanOutSeedSummary<SeedStat>(dedupeId);

    if (cachedItems) {
      items = cachedItems;
      seedStats = cachedStats ?? [];
      const cachedEntry = getFanOutHistory().find((e) => e.id === dedupeId);
      cost = cachedEntry?.cost;
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const result = await runFanOut(seeds, platform, location, language, limit, creds.login, creds.pass);
      items = result.items;
      seedStats = result.seedStats;
      cost = result.cost;
      error = result.error ?? null;

      const label = seeds.slice(0, 3).join(', ') + (seeds.length > 3 ? '…' : '');
      const entry: FanOutEntry = {
        id: dedupeId,
        ts: Date.now(),
        seeds: label,
        platform,
        location,
        language,
        seedCount: seeds.length,
        queryCount: items.length,
        cost,
      };
      saveFanOutSearch(entry, items, seedStats);
    }
  }

  const history = getFanOutHistory();
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;
  const displayPlatform = activeEntry?.platform ?? platform;
  const totalVolume = items.reduce((s, i) => s + (i.ai_search_volume ?? 0), 0);
  const seedsTriggered = seedStats.filter((s) => s.fanOutQueries > 0).length;
  const triggerRate = seedStats.length > 0 ? Math.round((seedsTriggered / seedStats.length) * 100) : null;

  const historyItems = history.map((entry) => {
    const isActive = entry.id === historyId;
    return (
      <a key={entry.id} href={`/dashboard/query-fan-out?history_id=${entry.id}#results`}
        className={`flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-950/40' : ''}`}>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{entry.seeds}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {entry.seedCount} seed{entry.seedCount !== 1 ? 's' : ''} → {entry.queryCount} quer{entry.queryCount !== 1 ? 'ies' : 'y'}
            {' · '}{entry.location}
            {entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-slate-400">{formatDate(entry.ts)}</span>
      </a>
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Query Fan-Out</h1>
        <p className="text-sm text-slate-400 mt-1">
          Discover the hidden sub-queries AI models generate when answering prompts related to your seed keywords, and their AI search volume.
        </p>
      </div>

      {!creds && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 text-amber-700 dark:text-amber-400 text-sm rounded-xl px-4 py-3">
          DataForSEO credentials missing. Configure them in{' '}
          <a href="/dashboard/settings" className="underline font-semibold">settings</a>.
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-6">
          <SearchForm
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4"
            btnLabel="Analyze"
            btnClassName="w-full bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl hover:bg-violet-600 dark:hover:bg-violet-500 dark:hover:text-white transition-colors"
            loadingLabel="Fetching fan-out queries…"
            disabled={!creds}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Seed keywords <span className="text-slate-300 dark:text-slate-600 font-normal normal-case tracking-normal">(one word per line, max {MAX_SEEDS} — each seed is a separate billed lookup)</span>
                </label>
                <textarea
                  name="seeds"
                  defaultValue={activeEntry ? '' : seedsRaw}
                  rows={5}
                  placeholder={'plombier\ndébouchage\nfuite'}
                  required
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all font-mono resize-y dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Platform</label>
                <select name="platform" defaultValue={displayPlatform}
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800">
                  <option value="google">Google AI</option>
                  <option value="chat_gpt">ChatGPT</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Mentions checked per seed</label>
                <select name="limit" defaultValue={String(limit)}
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800">
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
                <LocationPicker name="location" defaultValue={displayLocation} disabled={platform === 'chat_gpt'} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed" scope="labs" />
                {platform === 'chat_gpt' && <p className="text-[11px] text-slate-400 mt-1">Always United States for ChatGPT — DataForSEO only supports ChatGPT mentions for that market.</p>}
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
                <select name="language" defaultValue={displayLanguage} disabled={platform === 'chat_gpt'}
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed">
                  {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                {platform === 'chat_gpt' && <p className="text-[11px] text-slate-400 mt-1">Always English for ChatGPT — DataForSEO only supports ChatGPT mentions in that language.</p>}
              </div>
            </div>
          </SearchForm>

          {error && <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

          {hasQuery && !error && seedStats.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Seeds analyzed</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{seedStats.length}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Triggered fan-out</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                  {seedsTriggered}{triggerRate !== null && <span className="text-sm text-slate-400 font-semibold"> ({triggerRate}%)</span>}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fan-out queries found</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{items.length}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-5 py-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total AI volume</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{totalVolume.toLocaleString('en-GB')}</p>
              </div>
            </div>
          )}

          {hasQuery && !error && seedStats.some((s) => s.error) && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 text-amber-700 dark:text-amber-400 text-xs rounded-xl px-4 py-3 space-y-1">
              {seedStats.filter((s) => s.error).map((s) => (
                <p key={s.seed}><span className="font-semibold">{s.seed}</span> — {s.error}</p>
              ))}
            </div>
          )}

          {hasQuery && !error && (
            <div id="results" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Discovered fan-out queries</h2>
                  {isFromHistory && <span className="text-[10px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md">History</span>}
                </div>
                <div className="flex items-center gap-3">
                  {cost !== undefined && <span className="text-[10px] font-mono text-slate-400">cost: ${cost.toFixed(4)}</span>}
                  <span className="text-xs font-black text-slate-400">{items.length} quer{items.length !== 1 ? 'ies' : 'y'}</span>
                  {items.length > 0 && (
                    <CopyMarkdownButton
                      data={items.map((i) => ({
                        keyword: i.keyword,
                        ai_search_volume: i.ai_search_volume ?? '',
                        mentions: i.mentions,
                        seeds: i.seeds.join(', '),
                      }))}
                      columns={[
                        { key: 'keyword', label: 'Fan-out query' },
                        { key: 'ai_search_volume', label: 'AI Volume' },
                        { key: 'mentions', label: 'Mentions' },
                        { key: 'seeds', label: 'From seed(s)' },
                      ]}
                    />
                  )}
                </div>
              </div>
              {items.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-slate-400 space-y-1">
                  <p>No fan-out queries surfaced for these seeds within the checked mentions.</p>
                  <p className="text-xs text-slate-300 dark:text-slate-600">Across ChatGPT prompts generally, only about 47.5% trigger fan-out — try raising &quot;mentions checked per seed&quot; or broadening the seed keywords.</p>
                </div>
              ) : (
                <FanOutQueryTable items={items} />
              )}
            </div>
          )}

          {!hasQuery && !error && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm px-6 py-16 text-center space-y-2">
              <p className="text-slate-400 text-sm">Enter seed keywords above to uncover the sub-queries AI models fan out to, and how often people search for them.</p>
              <p className="text-slate-300 dark:text-slate-600 text-xs max-w-lg mx-auto">
                When an AI model can&apos;t fully answer a prompt from what it already knows, it silently issues extra searches — &quot;fan-out queries&quot; — to gather context before responding.
                These never reach the user, but they shape which sources get cited. This tool asks DataForSEO&apos;s LLM Mentions API to surface fan-out queries matching your seeds, then looks up their AI search volume.
              </p>
              <p className="text-slate-300 dark:text-slate-600 text-xs">Powered by DataForSEO LLM Mentions Search + AI Keyword Data APIs.</p>
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
