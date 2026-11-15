'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { deleteHistoryEntry, isDeletableHistoryTable, runWithCurrentProject } from '@/lib/db';

/** Only same-app dashboard paths, so the form can't be used as an open redirect. */
function safeDashboardPath(value: FormDataEntryValue | null): string {
  const path = typeof value === 'string' ? value : '';
  return /^\/dashboard(\/[\w-]+)*$/.test(path) ? path : '/dashboard';
}

// Query parameters that only reopen a saved entry. Any other parameter (target, keyword…) can
// start a paid API call once the cached row is gone, so such URLs are never reloaded.
const VIEW_PARAMS = new Set(['history_id', 'id', 'task_id', 'mode', 'tab']);
const ID_PARAMS = ['history_id', 'id', 'task_id'];

/** Where to go after deleting: the page as it was when it only showed another saved entry, else the empty tool page. */
function returnUrl(path: string, current: FormDataEntryValue | null, deletedId: string): string {
  if (typeof current !== 'string') return path;
  let url: URL;
  try { url = new URL(current, 'http://local'); } catch { return path; }
  if (url.pathname !== path) return path;
  const keys = [...url.searchParams.keys()];
  if (keys.length === 0 || keys.some((k) => !VIEW_PARAMS.has(k))) return path;
  if (ID_PARAMS.some((k) => url.searchParams.get(k) === deletedId)) return path;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Deletes one saved search from the current project's history. */
export async function deleteHistoryEntryAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const table = String(formData.get('table') ?? '');
    const id = String(formData.get('id') ?? '');
    const path = safeDashboardPath(formData.get('path'));
    if (isDeletableHistoryTable(table) && id) deleteHistoryEntry(table, id);
    revalidatePath(path);
    revalidatePath('/dashboard');
    redirect(returnUrl(path, formData.get('return_to'), id));
  });
}
