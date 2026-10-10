import { matchesGridTarget } from '@/lib/grid-target';
import {
  getGridProgressForProject, updateGridProgressForProject,
  type GridLocalItem, type GridPoint, type GridSearchEntry, type GridTaskPoint,
} from '@/lib/db';

interface DFSTaskGetResponse {
  tasks?: Array<{
    status_code?: number;
    result?: Array<{ items?: Array<{
      type: string; rank_group: number; title?: string; domain?: string; url?: string; cid?: string;
      rating?: { value?: number; votes_count?: number };
    }> }>;
  }>;
}

const inFlightCollections = new Map<string, Promise<{ status: 'done' | 'pending'; ready: number; total: number }>>();

/** Collects ready queued points for a project without relying on an open browser tab. */
export function collectGridProgress(
  projectId: string,
  entry: GridSearchEntry & { task_ids?: GridTaskPoint[] },
  credentials: { login: string; pass: string },
): Promise<{ status: 'done' | 'pending'; ready: number; total: number }> {
  const key = `${projectId}:${entry.id}`;
  const existing = inFlightCollections.get(key);
  if (existing) return existing;
  const operation = collectGridProgressOnce(projectId, entry, credentials).finally(() => inFlightCollections.delete(key));
  inFlightCollections.set(key, operation);
  return operation;
}

async function collectGridProgressOnce(
  projectId: string,
  entry: GridSearchEntry & { task_ids?: GridTaskPoint[] },
  credentials: { login: string; pass: string },
): Promise<{ status: 'done' | 'pending'; ready: number; total: number }> {
  const total = entry.grid_size ** 2;
  const progress = getGridProgressForProject(projectId, entry.id);
  if (!progress || progress.pendingTasks.length === 0) return { status: 'pending', ready: 0, total };

  const auth = btoa(`${credentials.login}:${credentials.pass}`);
  const stillProcessing = new Set([40602, 40601]);
  const checks = await Promise.all(progress.pendingTasks.map(async (taskPoint) => {
    try {
      const response = await fetch(`https://api.dataforseo.com/v3/serp/google/local_finder/task_get/advanced/${taskPoint.task_id}`, {
        headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return { taskPoint, ready: false, items: [] };
      const data = await response.json() as DFSTaskGetResponse;
      const task = data.tasks?.[0];
      if (!task || stillProcessing.has(task.status_code ?? 0)) return { taskPoint, ready: false, items: [] };
      const items = task.status_code === 20000 ? (task.result?.[0]?.items ?? []).filter((item) => item.type === 'local_pack') : [];
      return { taskPoint, ready: true, items };
    } catch {
      return { taskPoint, ready: false, items: [] };
    }
  }));

  const isTargetItem = (item: { title?: string; domain?: string; url?: string; cid?: string }) => matchesGridTarget(entry.target, item);
  const readyPoints: GridPoint[] = [];
  const pendingTasks: GridTaskPoint[] = [];
  for (const check of checks) {
    if (!check.ready) {
      pendingTasks.push(check.taskPoint);
      continue;
    }
    const match = check.items.find((item) => isTargetItem(item));
    const items: GridLocalItem[] = check.items.slice(0, 20).map((item) => ({
      rank_group: item.rank_group, title: item.title ?? '—', domain: item.domain, url: item.url, cid: item.cid,
      rating_value: item.rating?.value, rating_votes: item.rating?.votes_count,
      is_target: isTargetItem(item),
    }));
    readyPoints.push({ row: check.taskPoint.row, col: check.taskPoint.col, lat: check.taskPoint.lat, lng: check.taskPoint.lng, rank: match ? match.rank_group : null, items });
  }

  const accumulated = [...progress.results, ...readyPoints];
  updateGridProgressForProject(projectId, entry.id, accumulated, pendingTasks);
  return { status: pendingTasks.length === 0 ? 'done' : 'pending', ready: accumulated.length, total };
}
