import { savePromptCheck, type PromptCheck, type TrackedPrompt } from '@/lib/db';
import { fetchLlmResponse } from '@/lib/llm-responses';
import { extractAnswerText, extractSources, detectMention } from '@/lib/prompt-mentions';
import type { LlmPlatform } from '@/lib/llm-options';
import type { DfsCredentials } from '@/lib/dataforseo';

/** Runs one saved prompt against its model and works out whether the brand or domain showed up. */
export async function runPromptCheck(prompt: TrackedPrompt, creds: DfsCredentials): Promise<Omit<PromptCheck, 'id'>> {
  const now = Date.now();
  const base = {
    promptId: prompt.id,
    checkedAt: now,
    date: new Date(now).toISOString().slice(0, 10),
    platform: prompt.platform,
    model: prompt.model,
  };

  const res = await fetchLlmResponse(
    prompt.platform as LlmPlatform, prompt.prompt, prompt.model, prompt.webSearch, prompt.countryCode, '', creds,
  );
  if (res.error || !res.result) {
    return {
      ...base, mentioned: false, brandMentions: 0, domainCited: false, answer: null, sources: [],
      cost: res.cost ?? null, error: res.error ?? 'Empty API response.',
    };
  }

  const answer = extractAnswerText(res.result.items);
  const sources = extractSources(res.result.items);
  const verdict = detectMention({ answer, sources, brand: prompt.brand, domain: prompt.domain });
  return { ...base, ...verdict, answer, sources, cost: res.cost ?? null, error: null };
}

export interface PromptRunSummary {
  ran: number;
  mentioned: number;
  failed: number;
  cost: number;
}

/** Runs prompts one after another (each call is billed) and stores every outcome, including failures. */
export async function runPromptChecks(
  prompts: TrackedPrompt[],
  creds: DfsCredentials,
  projectId?: string,
): Promise<PromptRunSummary> {
  const summary: PromptRunSummary = { ran: 0, mentioned: 0, failed: 0, cost: 0 };
  for (const prompt of prompts) {
    let check: Omit<PromptCheck, 'id'>;
    try {
      check = await runPromptCheck(prompt, creds);
    } catch (error) {
      const now = Date.now();
      check = {
        promptId: prompt.id, checkedAt: now, date: new Date(now).toISOString().slice(0, 10),
        platform: prompt.platform, model: prompt.model, mentioned: false, brandMentions: 0, domainCited: false,
        answer: null, sources: [], cost: null, error: error instanceof Error ? error.message : 'Check failed.',
      };
    }
    savePromptCheck(check, projectId);
    summary.ran += 1;
    if (check.error) summary.failed += 1;
    else if (check.mentioned) summary.mentioned += 1;
    summary.cost += check.cost ?? 0;
  }
  return summary;
}
