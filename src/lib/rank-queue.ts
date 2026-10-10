import {
  getPendingRankTasksForProject, savePendingRankTaskForProject, type TrackedKeyword,
} from '@/lib/db';
import { stopCrawlOnMatch } from '@/lib/rank-serp';

interface TaskPostResponse {
  tasks?: Array<{ id?: string; status_code?: number; cost?: number }>;
}

/** Posts up to 100 Google Organic Standard tasks per request for a project. */
export async function queueStandardRankChecksForProject(
  projectId: string,
  keywords: Array<Pick<TrackedKeyword, 'id' | 'keyword' | 'domain' | 'location' | 'language'>>,
  credentials: { login: string; pass: string },
  depth: number,
): Promise<{ queued: number; failed: boolean }> {
  const pendingKeywordIds = new Set(getPendingRankTasksForProject(projectId).map((task) => task.keywordId));
  const eligible = keywords.filter((keyword) => !pendingKeywordIds.has(keyword.id));
  const auth = btoa(`${credentials.login}:${credentials.pass}`);
  let queued = 0;
  let failed = false;

  for (let offset = 0; offset < eligible.length; offset += 100) {
    const batch = eligible.slice(offset, offset + 100);
    try {
      const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/task_post', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map((keyword) => ({
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
        failed = true;
        continue;
      }
      const data = await response.json() as TaskPostResponse;
      data.tasks?.forEach((task, index) => {
        // 20100 is DataForSEO's successful Standard "Task Created" status.
        if (task.status_code === 20100 && task.id && batch[index]) {
          savePendingRankTaskForProject(projectId, batch[index].id, task.id, task.cost ?? null);
          queued += 1;
        }
      });
    } catch {
      // Keep previous checks intact. The following daily run or a manual retry can submit again.
      failed = true;
    }
  }
  return { queued, failed };
}
