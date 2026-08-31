/**
 * Shared fetch/auth/error-unwrap helper for DataForSEO's `.../live` endpoints. Every page used to
 * reimplement this boilerplate (Basic auth header, `tasks[0].status_code !== 20000` check, JSON
 * parsing) inline — some of them skipped the status_code check entirely, and 28 of them had no
 * try/catch around the fetch at all, so a network blip crashed the server component instead of
 * showing the app's normal inline error banner. This centralizes it so every call gets the same
 * error handling for free.
 *
 * Not used by the async task_post/task_get polling flows (OnPage Site Audit/Microdata, Google
 * Reviews, Geo-Grid) — those have a genuinely different request/response shape (submit a task,
 * poll separately for its result) that doesn't fit a single-call helper.
 */

export interface DfsCredentials {
  login: string;
  pass: string;
}

export interface DfsTaskResult<T> {
  result?: T[];
  cost?: number;
  error?: string;
}

/**
 * Calls a DataForSEO `/v3/<endpoint>/live` (or similar single-task) POST endpoint. Wraps `body` in
 * the `[...]` task array the API expects unless it's already an array. Returns the first task's
 * full `result` array — use this directly for bulk/multi-item results (e.g. `keywords_search_volume`
 * returning one item per input keyword), or see `callDataForSeoFirst` for the common single-result
 * case (`result[0]` holding `{ items, total_count }` or similar).
 */
export async function callDataForSeo<T>(
  endpoint: string,
  body: Record<string, unknown> | Record<string, unknown>[],
  creds: DfsCredentials,
  timeoutMs?: number,
): Promise<DfsTaskResult<T>> {
  const auth = btoa(`${creds.login}:${creds.pass}`);

  let res: Response;
  try {
    res = await fetch(`https://api.dataforseo.com/v3/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(Array.isArray(body) ? body : [body]),
      signal: timeoutMs != null ? AbortSignal.timeout(timeoutMs) : undefined,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') return { error: `Request timed out after ${timeoutMs}ms.` };
    return { error: err instanceof Error ? `Network error: ${err.message}` : 'Network error.' };
  }

  if (!res.ok) return { error: `API error ${res.status}: ${res.statusText}` };

  let data: { tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: T[] }> };
  try {
    data = await res.json();
  } catch {
    return { error: 'Invalid API response (not JSON).' };
  }

  const task = data?.tasks?.[0];
  if (!task) return { error: 'Empty API response.' };
  if (task.status_code && task.status_code !== 20000) return { error: `DataForSEO: ${task.status_message}` };
  return { result: task.result, cost: task.cost };
}

/** Convenience for the common case: one task, caller wants `result[0]` (not the raw array). */
export async function callDataForSeoFirst<T>(
  endpoint: string,
  body: Record<string, unknown> | Record<string, unknown>[],
  creds: DfsCredentials,
  timeoutMs?: number,
): Promise<{ result?: T; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeo<T>(endpoint, body, creds, timeoutMs);
  return { result: result?.[0], cost, error };
}
