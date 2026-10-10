import { NextResponse } from 'next/server';
import { getActiveProject, getCredentials, getPendingGridEntriesForProject } from '@/lib/db';
import { collectGridProgress } from '@/lib/grid-progress';

export const dynamic = 'force-dynamic';

/** Dashboard-wide task feed. The top bar calls this so queue processing survives navigation away from Geo-grid. */
export async function GET() {
  const project = getActiveProject();
  const pending = getPendingGridEntriesForProject(project.id);
  const credentials = getCredentials();

  if (!credentials) return NextResponse.json({ tasks: [] });

  const tasks = [] as Array<{
    id: string; keyword: string; target: string; status: 'pending' | 'done'; ready: number; total: number;
  }>;
  for (const entry of pending) {
    try {
      const progress = await collectGridProgress(project.id, entry, credentials);
      tasks.push({ id: entry.id, keyword: entry.keyword, target: entry.target, ...progress });
    } catch {
      // Preserve the task in the feed; the next top-bar poll can retry it.
      tasks.push({ id: entry.id, keyword: entry.keyword, target: entry.target, status: 'pending', ready: 0, total: entry.grid_size ** 2 });
    }
  }
  return NextResponse.json({ tasks });
}
