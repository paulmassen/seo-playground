import { NextRequest, NextResponse } from 'next/server';
import { getActiveProject, getCredentials, getGridEntryForProject, projectExists } from '@/lib/db';
import { collectGridProgress } from '@/lib/grid-progress';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // The pending panel names the run's project, so polling keeps working after the
  // active project is switched in another tab.
  const requested = request.nextUrl.searchParams.get('project');
  const projectId = requested && projectExists(requested) ? requested : getActiveProject().id;
  const entry = getGridEntryForProject(projectId, id);
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const total = entry.grid_size ** 2;
  if (entry.status === 'done') return NextResponse.json({ status: 'done', ready: total, total });

  const credentials = getCredentials();
  if (!credentials) return NextResponse.json({ error: 'No credentials' }, { status: 401 });

  const progress = await collectGridProgress(projectId, entry, credentials);
  return NextResponse.json(progress);
}
