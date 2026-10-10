import {
  completeRankTaskForProject, failRankTaskForProject, getPendingRankTasksForProject,
  type PendingRankTask,
} from '@/lib/db';
import { matchRankSerp, type RankSerpItem, type RankSerpMatch } from '@/lib/rank-serp';

interface TaskGetResponse {
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    cost?: number;
    result?: Array<{ items?: RankSerpItem[] }>;
  }>;
}

const inFlightCollections = new Map<string, Promise<{ pending: number; completed: number; failed: number }>>();
const stillProcessing = new Set([20100, 40601, 40602]);

/** Collects all ready Standard rank-tracker tasks for one project. */
export function collectRankProgress(
  projectId: string,
  credentials: { login: string; pass: string },
): Promise<{ pending: number; completed: number; failed: number }> {
  const existing = inFlightCollections.get(projectId);
  if (existing) return existing;
  const operation = collectRankProgressOnce(projectId, credentials).finally(() => inFlightCollections.delete(projectId));
  inFlightCollections.set(projectId, operation);
  return operation;
}

async function collectRankProgressOnce(
  projectId: string,
  credentials: { login: string; pass: string },
): Promise<{ pending: number; completed: number; failed: number }> {
  const tasks = getPendingRankTasksForProject(projectId);
  const auth = btoa(`${credentials.login}:${credentials.pass}`);
  let completed = 0;
  let failed = 0;

  const outcomes: Array<{ task: PendingRankTask; outcome: Awaited<ReturnType<typeof collectOne>> }> = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(8, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      outcomes.push({ task, outcome: await collectOne(task, auth) });
    }
  });
  await Promise.all(workers);

  for (const { task, outcome } of outcomes) {
    if (outcome.kind === 'pending') continue;
    if (outcome.kind === 'failed') {
      failRankTaskForProject(projectId, task.taskId, outcome.message);
      failed += 1;
      continue;
    }
    completeRankTaskForProject(projectId, task.taskId, outcome, outcome.cost);
    completed += 1;
  }

  return { pending: Math.max(0, tasks.length - completed - failed), completed, failed };
}

async function collectOne(task: PendingRankTask, auth: string): Promise<
  | { kind: 'pending' }
  | { kind: 'failed'; message: string }
  | ({ kind: 'ready'; cost: number | null } & RankSerpMatch)
> {
  try {
    const response = await fetch(`https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced/${task.taskId}`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { kind: 'pending' };
    const data = await response.json() as TaskGetResponse;
    const result = data.tasks?.[0];
    const status = result?.status_code ?? 0;
    if (!result || stillProcessing.has(status)) return { kind: 'pending' };
    if (status !== 20000) return { kind: 'failed', message: result.status_message ?? `DataForSEO status ${status}` };

    // The Advanced view of the same task adds the AI Overview at no extra charge.
    return { kind: 'ready', cost: result.cost ?? null, ...matchRankSerp(result.result?.[0]?.items ?? [], task.domain) };
  } catch {
    return { kind: 'pending' };
  }
}
