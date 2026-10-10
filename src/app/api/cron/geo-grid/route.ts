import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import {
  claimDueGridSchedules, claimDueRankTrackerSchedules, claimDuePromptTrackerSchedules, getCredentials, getPendingGridEntriesForProject,
  getProjects, getTrackedKeywordsForProject, getTrackedPrompts, retryClaimedGridSchedule, retryClaimedRankTrackerSchedule, saveGridSearchPendingForProject, type GridSearchEntry,
} from '@/lib/db';
import { runPromptChecks } from '@/lib/prompt-tracker';
import { postGridTasksQueue } from '@/app/dashboard/local-finder/grid-api';
import { collectGridProgress } from '@/lib/grid-progress';
import { collectRankProgress } from '@/lib/rank-progress';
import { queueStandardRankChecksForProject } from '@/lib/rank-queue';

export const dynamic = 'force-dynamic';

function getCronSecret() {
  if (process.env.CRON_SECRET?.trim()) return process.env.CRON_SECRET.trim();
  if (!process.env.CRON_SECRET_FILE) return null;
  try {
    return readFileSync(process.env.CRON_SECRET_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function isAuthorized(request: NextRequest) {
  const secret = getCronSecret();
  if (!secret) return false;
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? request.headers.get('x-cron-secret');
  return token === secret;
}

// One pass at a time per process. A pass walks every project sequentially and can
// outlast the worker interval; overlapping passes would only queue duplicate polling.
let passInProgress = false;

/**
 * Invoke this endpoint every 5–15 minutes from the platform scheduler. It claims
 * all due schedules before posting them to DataForSEO, so overlapping cron calls
 * cannot produce duplicate Geo-grid or Rank Tracker runs.
 */
export async function GET(request: NextRequest) {
  if (!getCronSecret()) {
    return NextResponse.json({ error: 'The Geo-grid worker secret is not configured.' }, { status: 503 });
  }
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const credentials = getCredentials();
  if (!credentials) return NextResponse.json({ error: 'DataForSEO credentials are not configured.' }, { status: 503 });

  if (passInProgress) return NextResponse.json({ busy: true });
  passInProgress = true;
  try {
    return NextResponse.json(await runPass(credentials));
  } finally {
    passInProgress = false;
  }
}

async function runPass(credentials: { login: string; pass: string }) {

  const due = claimDueGridSchedules();
  const dueRankSchedules = claimDueRankTrackerSchedules();
  const started: string[] = [];
  const failed: Array<{ seriesId: string; error: string }> = [];

  let gridRetries = 0;
  for (const schedule of due) {
    try {
      const result = await postGridTasksQueue(
        schedule.keyword, schedule.center, schedule.grid_size, schedule.spacing_km, schedule.language,
        credentials.login, credentials.pass, schedule.queue_mode === 'priority' ? 'priority' : 'standard',
      );
      if (result.error) failed.push({ seriesId: schedule.series_id, error: result.error });
      if (result.taskPoints.length === 0) {
        // Nothing was queued or billed, so the slot can safely be attempted again.
        if (retryClaimedGridSchedule(schedule.projectId, schedule)) gridRetries += 1;
        continue;
      }
      // A partial post is kept as-is: re-posting would bill the queued points twice.
      const entry: GridSearchEntry = {
        id: randomUUID(),
        series_id: schedule.series_id,
        ts: Date.now(),
        keyword: schedule.keyword,
        target: schedule.target,
        center: schedule.center,
        grid_size: schedule.grid_size,
        spacing_km: schedule.spacing_km,
        language: schedule.language,
        status: 'pending',
        queue_mode: schedule.queue_mode,
        cost: result.cost,
      };
      saveGridSearchPendingForProject(schedule.projectId, entry, result.taskPoints);
      started.push(entry.id);
    } catch (error) {
      // postGridTasksQueue reports API failures itself, so this is a local failure after
      // posting; retrying would bill the same points again.
      failed.push({ seriesId: schedule.series_id, error: error instanceof Error ? error.message : 'Could not start grid run.' });
    }
  }

  let rankScheduled = 0;
  let rankScheduleRetries = 0;
  for (const schedule of dueRankSchedules) {
    try {
      const result = await queueStandardRankChecksForProject(
        schedule.projectId,
        getTrackedKeywordsForProject(schedule.projectId),
        credentials,
        parseInt(schedule.depth, 10) || 20,
      );
      rankScheduled += result.queued;
      if (result.failed) {
        retryClaimedRankTrackerSchedule(schedule.projectId, schedule.nextRunAt);
        rankScheduleRetries += 1;
      }
    } catch {
      retryClaimedRankTrackerSchedule(schedule.projectId, schedule.nextRunAt);
      rankScheduleRetries += 1;
    }
  }

  let pendingChecked = 0;
  let completed = 0;
  let rankPendingChecked = 0;
  let rankCompleted = 0;
  let rankFailed = 0;
  for (const project of getProjects()) {
    const pending = getPendingGridEntriesForProject(project.id);
    for (const entry of pending) {
      try {
        const status = await collectGridProgress(project.id, entry, credentials);
        pendingChecked += 1;
        if (status.status === 'done') completed += 1;
      } catch {
        // A temporary DataForSEO failure is retried by the next cron invocation.
      }
    }
    try {
      const rankProgress = await collectRankProgress(project.id, credentials);
      rankPendingChecked += rankProgress.pending;
      rankCompleted += rankProgress.completed;
      rankFailed += rankProgress.failed;
    } catch {
      // A temporary API failure leaves local rank tasks pending for the next worker pass.
    }
  }

  // Prompt Tracker checks are synchronous (no task polling), so each due project runs to completion here.
  // A failed run is not retried: the calls already made would be billed again.
  const duePromptSchedules = claimDuePromptTrackerSchedules();
  let promptRuns = 0;
  let promptRunsFailed = 0;
  for (const schedule of duePromptSchedules) {
    try {
      const summary = await runPromptChecks(getTrackedPrompts(schedule.projectId), credentials, schedule.projectId);
      promptRuns += summary.ran;
      promptRunsFailed += summary.failed;
    } catch {
      promptRunsFailed += 1;
    }
  }

  return {
    due: due.length, started, failed, gridRetries, pendingChecked, completed,
    rankSchedulesDue: dueRankSchedules.length, rankScheduled, rankScheduleRetries, rankPendingChecked, rankCompleted, rankFailed,
    promptSchedulesDue: duePromptSchedules.length, promptRuns, promptRunsFailed,
  };
}
