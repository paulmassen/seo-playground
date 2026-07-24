import { NextRequest, NextResponse } from 'next/server';
import { getCredentials, getGridEntry, getGridProgress, updateGridProgress } from '@/lib/db';
import type { GridPoint, GridLocalItem, GridTaskPoint } from '@/lib/db';

interface DFSTaskGetResponse {
  tasks?: Array<{
    id?: string;
    status_code?: number;
    status_message?: string;
    cost?: number;
    result?: Array<{
      items?: Array<{
        type: string;
        rank_group: number;
        title?: string;
        domain?: string;
        url?: string;
        cid?: string;
        rating?: { value?: number; votes_count?: number };
      }>;
    }>;
  }>;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const entry = getGridEntry(id);
  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const total = entry.grid_size ** 2;
  if (entry.status === 'done') {
    return NextResponse.json({ status: 'done', ready: total, total });
  }

  const progress = getGridProgress(id);
  if (!progress || progress.pendingTasks.length === 0) {
    return NextResponse.json({ status: 'error', error: 'No pending task IDs stored' }, { status: 400 });
  }

  const creds = getCredentials();
  if (!creds) {
    return NextResponse.json({ error: 'No credentials' }, { status: 401 });
  }

  const auth = btoa(`${creds.login}:${creds.pass}`);
  const targetLower = entry.target.toLowerCase();

  // DataForSEO status codes that mean "task is still in the queue / being processed".
  // Any other non-20000 code is a permanent failure → treat as done with empty results
  // so the grid never gets stuck in an infinite pending loop.
  const STILL_PROCESSING = new Set([40602, 40601]);

  // Only re-check tasks that aren't already collected — once a task's been read here it's never queried again.
  const checks = await Promise.all(
    progress.pendingTasks.map(async (tp: GridTaskPoint) => {
      try {
        const res = await fetch(
          `https://api.dataforseo.com/v3/serp/google/local_finder/task_get/advanced/${tp.task_id}`,
          { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15_000) },
        );
        if (!res.ok) return { tp, ready: false, items: [] };
        const data = await res.json() as DFSTaskGetResponse;
        const task = data.tasks?.[0];
        // Still in queue → not ready yet
        if (!task || STILL_PROCESSING.has(task.status_code ?? 0)) return { tp, ready: false, items: [] };
        // Success or permanent error → mark as done (empty items for errors)
        const rawItems = task.status_code === 20000
          ? (task.result?.[0]?.items ?? []).filter((i) => i.type === 'local_pack')
          : [];
        return { tp, ready: true, items: rawItems };
      } catch {
        // Network timeout or fetch error → not ready, will retry next poll
        return { tp, ready: false, items: [] };
      }
    }),
  );

  const isTarget = (title: string, domain: string, url: string) =>
    title.toLowerCase().includes(targetLower) ||
    domain.toLowerCase().includes(targetLower) ||
    url.toLowerCase().includes(targetLower);

  const newlyReady: GridPoint[] = [];
  const stillPending: GridTaskPoint[] = [];

  for (const check of checks) {
    if (!check.ready) {
      stillPending.push(check.tp);
      continue;
    }
    const match = check.items.find((item) =>
      isTarget(item.title ?? '', item.domain ?? '', item.url ?? ''),
    );
    const gridItems: GridLocalItem[] = check.items.slice(0, 20).map((item) => ({
      rank_group: item.rank_group,
      title: item.title ?? '—',
      domain: item.domain,
      url: item.url,
      cid: item.cid,
      rating_value: item.rating?.value,
      rating_votes: item.rating?.votes_count,
      is_target: isTarget(item.title ?? '', item.domain ?? '', item.url ?? ''),
    }));
    newlyReady.push({
      row: check.tp.row, col: check.tp.col, lat: check.tp.lat, lng: check.tp.lng,
      rank: match ? match.rank_group : null, items: gridItems,
    });
  }

  const accumulatedResults = [...progress.results, ...newlyReady];
  updateGridProgress(id, accumulatedResults, stillPending);

  const ready = accumulatedResults.length;
  if (stillPending.length > 0) {
    return NextResponse.json({ status: 'pending', ready, total });
  }
  return NextResponse.json({ status: 'done', ready, total, cost: entry.cost });
}
