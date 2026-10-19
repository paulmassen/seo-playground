import { NextResponse } from 'next/server';
import { getActiveProject, getCredentials, getRankTaskActivity } from '@/lib/db';
import { collectRankProgress } from '@/lib/rank-progress';

export const dynamic = 'force-dynamic';

/**
 * Rank Tracker feed for the top bar. Polling here lets queued rank checks finish while the user
 * works elsewhere in the dashboard, rather than only when the Rank Tracker page is open.
 */
export async function GET() {
  const project = getActiveProject();
  const credentials = getCredentials();
  if (credentials) {
    try {
      await collectRankProgress(project.id, credentials);
    } catch {
      // Keep the task in the feed; the next top-bar poll retries collection.
    }
  }
  return NextResponse.json(getRankTaskActivity(project.id));
}
