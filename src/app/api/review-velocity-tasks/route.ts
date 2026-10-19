import { NextResponse } from 'next/server';
import { getActiveProject, getCredentials } from '@/lib/db';
import { getAnalysisActivity } from '@/lib/review-velocity-db';
import { collectReviewTasks } from '@/lib/review-velocity-tasks';

export const dynamic = 'force-dynamic';

/**
 * Review Velocity feed for the top bar. Finished DataForSEO fetches are collected here too, so an
 * analysis completes (and the bell announces it) even when the user is on another page.
 */
export async function GET() {
  const project = getActiveProject();
  const credentials = getCredentials();
  if (credentials) {
    try {
      await collectReviewTasks(project.id, credentials, null);
    } catch {
      // Still reported as running; the next poll retries.
    }
  }
  return NextResponse.json(getAnalysisActivity(project.id));
}
