'use server';

import { runWithCurrentProject } from '@/lib/db';

import {
  getCredentials, getTrackedKeywords, addTrackedKeyword,
  removeTrackedKeyword, getSetting, setSetting,
  addTargetDomain, removeTargetDomain, getCurrentProject,
  saveRankTrackerSchedule, deleteRankTrackerSchedule, getRankTopResultsHistory,
  setTrackedKeywordsAiMode, getAiModeDetails,
  type RankTopResultsCheck, type AiModeCheckDetail,
} from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { queueStandardRankChecksForProject } from '@/lib/rank-queue';
import { queueAiModeChecksForProject } from '@/lib/ai-mode';

type KeywordInput = { id: number; keyword: string; domain: string; location: string; language: string; aiMode?: boolean };

/** Queues the organic check of each keyword, plus a Google AI Mode check for keywords that opted in. */
async function queueStandardRankChecks(keywords: KeywordInput[]) {
  const creds = getCredentials();
  if (!creds || keywords.length === 0) return;
  const depth = parseInt(getSetting('rank_tracker_depth') ?? '20', 10);
  const projectId = getCurrentProject().id;
  await queueStandardRankChecksForProject(projectId, keywords, creds, depth);
  const aiKeywords = keywords.filter((keyword) => keyword.aiMode);
  if (aiKeywords.length > 0) await queueAiModeChecksForProject(projectId, aiKeywords, creds);
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
    const aiMode = formData.get('ai_mode') === 'on';

    // Adding only saves the keywords, so they show up at once. Checking is a separate step (Queue, or ↻ on a row).
    const ids = kwList.map((keyword) => addTrackedKeyword(keyword, domain, location, language));
    if (aiMode) setTrackedKeywordsAiMode(ids, true);
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
    const aiMode = getTrackedKeywords().find((k) => k.id === id)?.aiMode ?? false;
    await queueStandardRankChecks([{ id, keyword, domain, location, language, aiMode }]);
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

export async function setAiModeAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const id = Number(formData.get('id'));
    if (!Number.isInteger(id) || id <= 0) return;
    setTrackedKeywordsAiMode([id], formData.get('enabled') === '1');
    revalidatePath('/dashboard/rank-tracker');
  });
}

/** Turns Google AI Mode tracking on or off for every keyword of a domain. */
export async function setDomainAiModeAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const domain = (formData.get('domain') as string | null)?.trim();
    if (!domain) return;
    const ids = getTrackedKeywords().filter((k) => k.domain === domain).map((k) => k.id);
    setTrackedKeywordsAiMode(ids, formData.get('enabled') === '1');
    revalidatePath('/dashboard/rank-tracker');
  });
}

/** Saved AI Mode answers and sources, loaded when a keyword row is expanded. */
export async function getAiModeDetailsAction(keywordId: number): Promise<AiModeCheckDetail[]> {
  return runWithCurrentProject(async () => {
    if (!Number.isInteger(keywordId) || keywordId <= 0) return [];
    return getAiModeDetails(keywordId, 30);
  });
}
