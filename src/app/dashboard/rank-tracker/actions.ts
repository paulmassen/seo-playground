'use server';

import { runWithCurrentProject } from '@/lib/db';

import {
  getCredentials, getTrackedKeywords, addTrackedKeyword,
  removeTrackedKeyword, getSetting, setSetting,
  addTargetDomain, removeTargetDomain, getCurrentProject,
  saveRankTrackerSchedule, deleteRankTrackerSchedule, getRankTopResultsHistory,
  type RankTopResultsCheck,
} from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { queueStandardRankChecksForProject } from '@/lib/rank-queue';

async function queueStandardRankChecks(
  keywords: Array<{ id: number; keyword: string; domain: string; location: string; language: string }>,
) {
  const creds = getCredentials();
  if (!creds || keywords.length === 0) return;
  const depth = parseInt(getSetting('rank_tracker_depth') ?? '20', 10);
  await queueStandardRankChecksForProject(getCurrentProject().id, keywords, creds, depth);
}

export async function saveDepthAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const depth = formData.get('rank_tracker_depth') as string;
    const valid = ['10', '20', '50', '100'];
    if (valid.includes(depth)) setSetting('rank_tracker_depth', depth);
    revalidatePath('/dashboard/rank-tracker');
  });
}

export async function saveRankScheduleAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const enabled = formData.get('enabled') === 'on';
    if (!enabled) deleteRankTrackerSchedule();
    else {
      saveRankTrackerSchedule({
        timeOfDay: String(formData.get('time_of_day') ?? '08:00'),
        timeZone: String(formData.get('time_zone') ?? 'UTC'),
      });
    }
    revalidatePath('/dashboard/rank-tracker');
  });
}

export async function addDomainAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const domain = (formData.get('domain') as string)?.trim();
    if (!domain) return;
    addTargetDomain(domain);
    revalidatePath('/dashboard/rank-tracker');
    redirect(`/dashboard/rank-tracker?domain=${encodeURIComponent(domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''))}`);
  });
}

export async function removeDomainAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const domain = formData.get('domain') as string;
    if (!domain) return;
    removeTargetDomain(domain);
    redirect('/dashboard/rank-tracker');
  });
}

export async function addKeywordAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const raw = (formData.get('keywords') as string) ?? '';
    const domain = (formData.get('domain') as string)?.trim();
    const location = (formData.get('location') as string)?.trim() || 'France';
    const language = (formData.get('language') as string)?.trim() || 'French';

    if (!domain) return;
    addTargetDomain(domain);

    const kwList = raw.split('\n').map((k) => k.trim()).filter(Boolean).slice(0, 50);
    if (kwList.length === 0) return;

    // Adding only saves the keywords, so they show up at once. Checking is a separate step (Queue, or ↻ on a row).
    for (const keyword of kwList) addTrackedKeyword(keyword, domain, location, language);
    revalidatePath('/dashboard/rank-tracker');
  });
}

export async function removeKeywordAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const id = Number(formData.get('id'));
    if (!id) return;
    removeTrackedKeyword(id);
    revalidatePath('/dashboard/rank-tracker');
  });
}

export async function checkOneAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const id = Number(formData.get('id'));
    const keyword = formData.get('keyword') as string;
    const domain = formData.get('domain') as string;
    const location = formData.get('location') as string;
    const language = formData.get('language') as string;
    if (!id || !keyword || !domain) return;
    await queueStandardRankChecks([{ id, keyword, domain, location, language }]);
    revalidatePath('/dashboard/rank-tracker');
  });
}

export async function checkAllAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const domain = (formData.get('domain') as string | null)?.trim() ?? '';
    const keywords = getTrackedKeywords();
    await queueStandardRankChecks(keywords);
    redirect(domain ? `/dashboard/rank-tracker?domain=${encodeURIComponent(domain)}` : '/dashboard/rank-tracker');
  });
}

export async function checkDomainAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const domain = formData.get('domain') as string;
    if (!domain) return;
    const keywords = getTrackedKeywords().filter((k) => k.domain === domain);
    await queueStandardRankChecks(keywords);
    redirect(`/dashboard/rank-tracker?domain=${encodeURIComponent(domain)}`);
  });
}

/** Loaded when a keyword row is expanded, so the list page does not carry ten results per check. */
export async function getTopResultsAction(keywordId: number): Promise<RankTopResultsCheck[]> {
  return runWithCurrentProject(async () => {
    if (!Number.isInteger(keywordId) || keywordId <= 0) return [];
    return getRankTopResultsHistory(keywordId, 30);
  });
}
