import {
  confirmRankTaskReservationForProject, failRankTaskReservationForProject, reserveRankTasksForProject,
  type RankTaskReservation, type TrackedKeyword,
} from '@/lib/db';
import { stopCrawlOnMatch } from '@/lib/rank-serp';

interface TaskPostResponse {
  status_code?: number;
  status_message?: string;
  tasks?: Array<{ id?: string; status_code?: number; status_message?: string; cost?: number }> | null;
}

/** Posts up to 100 Google Organic Standard tasks per request for a project. */
export async function queueStandardRankChecksForProject(
  projectId: string,
  keywords: Array<Pick<TrackedKeyword, 'id' | 'keyword' | 'domain' | 'location' | 'language'>>,
  credentials: { login: string; pass: string },
  depth: number,
): Promise<{ queued: number; failed: boolean }> {
  const byId = new Map(keywords.map((keyword) => [keyword.id, keyword]));
  const reservations = reserveRankTasksForProject(projectId, keywords.map((keyword) => keyword.id));
  const auth = btoa(`${credentials.login}:${credentials.pass}`);
  let queued = 0;
  let failed = false;

  for (let offset = 0; offset < reservations.length; offset += 100) {
    const batch = reservations.slice(offset, offset + 100);
    const batchKeywords = batch.map((reservation) => byId.get(reservation.keywordId)).filter(Boolean) as Array<Pick<TrackedKeyword, 'id' | 'keyword' | 'domain' | 'location' | 'language'>>;
    try {
      const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/task_post', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batchKeywords.map((keyword) => ({
          keyword: keyword.keyword,
          location_name: keyword.location,
          language_name: keyword.language,
          depth,
          priority: 1,
          stop_crawl_on_match: stopCrawlOnMatch(keyword.domain),
        }))),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        markReservationsFailed(projectId, batch, `API error ${response.status}: ${response.statusText}`);
        failed = true;
        continue;
      }
      const data = await response.json() as TaskPostResponse;
      if (data.status_code && data.status_code !== 20000) {
        markReservationsFailed(projectId, batch, data.status_message ?? `DataForSEO status ${data.status_code}`);
        failed = true;
        continue;
      }
      if (!Array.isArray(data.tasks)) {
        markReservationsFailed(projectId, batch, 'Empty response from DataForSEO.');
        failed = true;
        continue;
      }
      batch.forEach((reservation, index) => {
        const task = data.tasks?.[index];
        // 20100 is DataForSEO's successful Standard "Task Created" status.
        if (task?.status_code === 20100 && task.id) {
          if (confirmRankTaskReservationForProject(projectId, reservation.reservationId, task.id, task.cost ?? null)) queued += 1;
        } else {
          failRankTaskReservationForProject(projectId, reservation.reservationId, task?.status_message ?? `DataForSEO status ${task?.status_code ?? 'missing task'}`);
          failed = true;
        }
      });
    } catch (error) {
      // Ambiguous: DataForSEO may still have accepted and billed the task_post. Keep a failed
      // reservation rather than silently retrying and risking a second charge.
      markReservationsFailed(projectId, batch, error instanceof Error ? error.message : 'Could not reach DataForSEO.');
      failed = true;
    }
  }
  return { queued, failed };
}

function markReservationsFailed(projectId: string, reservations: RankTaskReservation[], message: string) {
  reservations.forEach((reservation) => failRankTaskReservationForProject(projectId, reservation.reservationId, message));
}
