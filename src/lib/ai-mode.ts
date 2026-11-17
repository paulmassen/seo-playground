import {
  completeAiModeTaskForProject, confirmAiModeTaskReservationForProject, failAiModeTaskForProject,
  failAiModeTaskReservationForProject, getPendingAiModeTasksForProject, reserveAiModeTasksForProject,
  type AiModeResult, type AiModeSource, type PendingAiModeTask, type RankTaskReservation, type TrackedKeyword,
} from '@/lib/db';
import { rankHost } from '@/lib/rank-serp';

/** DataForSEO price of one Google AI Mode SERP in the Standard queue (normal priority), in USD. */
export const AI_MODE_STANDARD_COST = 0.0012;

interface AiModeReference { domain?: string | null; url?: string | null; title?: string | null; source?: string | null }

interface AiModeItem {
  type?: string;
  markdown?: string | null;
  references?: AiModeReference[] | null;
  items?: Array<{
    type?: string;
    markdown?: string | null;
    references?: AiModeReference[] | null;
    links?: AiModeReference[] | null;
  }> | null;
}

const MAX_ANSWER_CHARS = 20_000;

function isGoogleHost(host: string) {
  return host === 'google.com' || /^google\.[a-z.]+$/.test(host) || host.endsWith('.google.com');
}

/**
 * Reads an AI Mode Advanced result: the answer text and the distinct domains it cites, in the
 * order they appear. The tracked domain's position is its rank among those cited domains.
 */
export function parseAiModeResult(items: AiModeItem[] | null | undefined, trackedDomain: string): AiModeResult {
  const overviews = (items ?? []).filter((item) => item.type === 'ai_overview');
  if (overviews.length === 0) return { status: 'no_answer', citationPosition: null, citedUrl: null, sources: [], answer: null };

  const references: AiModeReference[] = overviews.flatMap((overview) => [
    ...(overview.items ?? []).flatMap((element) => [...(element.references ?? []), ...(element.links ?? [])]),
    ...(overview.references ?? []),
  ]);

  const sources: AiModeSource[] = [];
  const seen = new Set<string>();
  for (const reference of references) {
    const host = rankHost(reference.domain || reference.url || '');
    // Google shopping and search links in the answer are not third-party sources.
    if (!host || isGoogleHost(host) || seen.has(host)) continue;
    seen.add(host);
    sources.push({ domain: host, url: reference.url ?? '', title: reference.title ?? reference.source ?? null });
  }

  const domain = rankHost(trackedDomain);
  const index = sources.findIndex((source) => source.domain === domain || source.domain.endsWith(`.${domain}`));
  const answer = overviews.map((overview) => overview.markdown ?? (overview.items ?? []).map((element) => element.markdown ?? '').join('\n\n')).join('\n\n').trim();

  return {
    status: index >= 0 ? 'cited' : 'not_cited',
    citationPosition: index >= 0 ? index + 1 : null,
    citedUrl: index >= 0 ? sources[index].url || null : null,
    sources,
    answer: answer ? answer.slice(0, MAX_ANSWER_CHARS) : null,
  };
}

interface TaskPostResponse {
  status_code?: number;
  status_message?: string;
  tasks?: Array<{ id?: string; status_code?: number; status_message?: string; cost?: number }> | null;
}

type KeywordInput = Pick<TrackedKeyword, 'id' | 'keyword' | 'domain' | 'location' | 'language'>;

/**
 * Posts Google AI Mode Standard tasks for a project, at most one pending per keyword. Like
 * Rank Tracker checks, a keyword is reserved before posting and an ambiguous outcome is
 * recorded as failed rather than retried, since DataForSEO may already have billed it.
 */
export async function queueAiModeChecksForProject(
  projectId: string,
  keywords: KeywordInput[],
  credentials: { login: string; pass: string },
): Promise<{ queued: number; failed: boolean }> {
  if (keywords.length === 0) return { queued: 0, failed: false };
  const byId = new Map(keywords.map((keyword) => [keyword.id, keyword]));
  const reservations = reserveAiModeTasksForProject(projectId, keywords.map((keyword) => keyword.id));
  const auth = btoa(`${credentials.login}:${credentials.pass}`);
  let queued = 0;
  let failed = false;

  for (let offset = 0; offset < reservations.length; offset += 100) {
    const batch = reservations.slice(offset, offset + 100);
    const batchKeywords = batch.map((reservation) => byId.get(reservation.keywordId)!);
    try {
      const response = await fetch('https://api.dataforseo.com/v3/serp/google/ai_mode/task_post', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batchKeywords.map((keyword) => ({
          keyword: keyword.keyword,
          location_name: keyword.location,
          language_name: keyword.language,
          priority: 1,
        }))),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        failAll(projectId, batch, `API error ${response.status}: ${response.statusText}`);
        failed = true;
        continue;
      }
      const data = await response.json() as TaskPostResponse;
      if ((data.status_code && data.status_code !== 20000) || !Array.isArray(data.tasks)) {
        failAll(projectId, batch, data.status_message ?? 'Empty response from DataForSEO.');
        failed = true;
        continue;
      }
      batch.forEach((reservation, index) => {
        const task = data.tasks?.[index];
        if (task?.status_code === 20100 && task.id) {
          if (confirmAiModeTaskReservationForProject(projectId, reservation.reservationId, task.id, task.cost ?? null)) queued += 1;
        } else {
          failAiModeTaskReservationForProject(projectId, reservation.reservationId, task?.status_message ?? `DataForSEO status ${task?.status_code ?? 'missing task'}`);
          failed = true;
        }
      });
    } catch (error) {
      failAll(projectId, batch, error instanceof Error ? error.message : 'Could not reach DataForSEO.');
      failed = true;
    }
  }
  return { queued, failed };
}

function failAll(projectId: string, reservations: RankTaskReservation[], message: string) {
  for (const reservation of reservations) failAiModeTaskReservationForProject(projectId, reservation.reservationId, message);
}

interface TaskGetResponse {
  tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: Array<{ items?: AiModeItem[] | null }> | null }>;
}

const stillProcessing = new Set([20100, 40601, 40602]);
const inFlight = new Map<string, Promise<{ pending: number; completed: number; failed: number }>>();

/** Collects ready AI Mode tasks for one project; concurrent callers share one pass. */
export function collectAiModeProgress(projectId: string, credentials: { login: string; pass: string }) {
  const existing = inFlight.get(projectId);
  if (existing) return existing;
  const operation = collectOnce(projectId, credentials).finally(() => inFlight.delete(projectId));
  inFlight.set(projectId, operation);
  return operation;
}

async function collectOnce(projectId: string, credentials: { login: string; pass: string }) {
  const tasks = getPendingAiModeTasksForProject(projectId);
  const auth = btoa(`${credentials.login}:${credentials.pass}`);
  let completed = 0;
  let failed = 0;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(8, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      const outcome = await collectOne(task, auth);
      if (outcome.kind === 'failed') {
        failAiModeTaskForProject(projectId, task.taskId, outcome.message);
        failed += 1;
      } else if (outcome.kind === 'ready') {
        completeAiModeTaskForProject(projectId, task.taskId, outcome.result, outcome.cost);
        completed += 1;
      }
    }
  });
  await Promise.all(workers);
  return { pending: Math.max(0, tasks.length - completed - failed), completed, failed };
}

async function collectOne(task: PendingAiModeTask, auth: string): Promise<
  | { kind: 'pending' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; cost: number | null; result: AiModeResult }
> {
  try {
    const response = await fetch(`https://api.dataforseo.com/v3/serp/google/ai_mode/task_get/advanced/${task.taskId}`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { kind: 'pending' };
    const data = await response.json() as TaskGetResponse;
    const result = data.tasks?.[0];
    const status = result?.status_code ?? 0;
    if (!result || stillProcessing.has(status)) return { kind: 'pending' };
    if (status !== 20000) return { kind: 'failed', message: result.status_message ?? `DataForSEO status ${status}` };
    return { kind: 'ready', cost: result.cost ?? null, result: parseAiModeResult(result.result?.[0]?.items, task.domain) };
  } catch {
    return { kind: 'pending' };
  }
}
