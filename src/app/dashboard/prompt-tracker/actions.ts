'use server';

import { runWithCurrentProject } from '@/lib/db';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  getCredentials, getTrackedPrompt, getTrackedPrompts, addTrackedPrompt, removeTrackedPrompt,
  savePromptTrackerSchedule, deletePromptTrackerSchedule,
} from '@/lib/db';
import { isValidPlatform } from '@/lib/llm-options';
import { normalizeDomain } from '@/lib/prompt-mentions';
import { runPromptChecks } from '@/lib/prompt-tracker';

const PAGE = '/dashboard/prompt-tracker';

export async function addPromptAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const prompt = String(formData.get('user_prompt') ?? '').trim().slice(0, 500);
    const platform = String(formData.get('platform') ?? '');
    const model = String(formData.get('model') ?? '').trim();
    const brand = String(formData.get('brand') ?? '').trim();
    const domain = normalizeDomain(String(formData.get('domain') ?? ''));
    const webSearch = formData.get('web_search') === 'on';
    const countryCode = String(formData.get('country_code') ?? '').trim().toUpperCase().slice(0, 2);

    // Without a brand or domain there is nothing to look for in the answer.
    if (!prompt || !isValidPlatform(platform) || !model || (!brand && !domain)) return;

    const id = addTrackedPrompt({ prompt, platform, model, webSearch, countryCode, brand, domain });
    revalidatePath(PAGE);
    redirect(`${PAGE}?prompt=${id}`);
  });
}

export async function removePromptAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const id = Number(formData.get('id'));
    if (!Number.isInteger(id) || id <= 0) return;
    removeTrackedPrompt(id);
    revalidatePath(PAGE);
    redirect(PAGE);
  });
}

export async function checkPromptAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const id = Number(formData.get('id'));
    const creds = getCredentials();
    const prompt = Number.isInteger(id) && id > 0 ? getTrackedPrompt(id) : null;
    if (!creds || !prompt) return;
    await runPromptChecks([prompt], creds);
    revalidatePath(PAGE);
    redirect(`${PAGE}?prompt=${prompt.id}`);
  });
}

export async function checkAllPromptsAction() {
  return runWithCurrentProject(async () => {
    const creds = getCredentials();
    const prompts = getTrackedPrompts();
    if (creds && prompts.length > 0) await runPromptChecks(prompts, creds);
    revalidatePath(PAGE);
    redirect(PAGE);
  });
}

export async function savePromptScheduleAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const enabled = formData.get('enabled') === 'on';
    if (!enabled) deletePromptTrackerSchedule();
    else {
      savePromptTrackerSchedule({
        timeOfDay: String(formData.get('time_of_day') ?? '08:00'),
        timeZone: String(formData.get('time_zone') ?? 'UTC'),
      });
    }
    revalidatePath(PAGE);
  });
}
