import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Throwaway DB so the prompt tracker tables are exercised without touching real project data.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfsui-prompt-tracker-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import {
  addTrackedPrompt, getTrackedPrompts, getTrackedPrompt, removeTrackedPrompt,
  savePromptCheck, getPromptChecks, getLatestPromptChecks, getPromptCheckTotals,
  savePromptTrackerSchedule, getPromptTrackerSchedule, deletePromptTrackerSchedule, claimDuePromptTrackerSchedules,
} from './db';

const base = { platform: 'chat_gpt', model: 'gpt-5.5', webSearch: true, countryCode: 'FR', brand: 'Acme', domain: 'acme.com' };

function check(promptId: number, mentioned: boolean, checkedAt: number, error: string | null = null) {
  return {
    promptId, checkedAt, date: '2026-01-01', platform: 'chat_gpt', model: 'gpt-5.5', mentioned,
    brandMentions: mentioned ? 2 : 0, domainCited: false, answer: mentioned ? 'Acme wins' : 'No idea',
    sources: [{ title: 'Guide', url: 'https://acme.com/guide' }], cost: 0.02, error,
  };
}

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('prompt tracker storage', () => {
  let promptId: number;

  beforeAll(() => {
    promptId = addTrackedPrompt({ ...base, prompt: 'Best plumber in Paris?' });
  });

  it('stores and returns a tracked prompt with its settings', () => {
    const saved = getTrackedPrompt(promptId);
    expect(saved).toMatchObject({ prompt: 'Best plumber in Paris?', platform: 'chat_gpt', webSearch: true, countryCode: 'FR', brand: 'Acme', domain: 'acme.com' });
    expect(getTrackedPrompts().map((p) => p.id)).toContain(promptId);
  });

  it('keeps every check and returns the latest one per prompt', () => {
    savePromptCheck(check(promptId, false, 1_000));
    savePromptCheck(check(promptId, true, 2_000));
    savePromptCheck(check(promptId, true, 3_000));

    const history = getPromptChecks(promptId);
    expect(history.map((c) => c.checkedAt)).toEqual([3_000, 2_000, 1_000]);
    expect(history[0]).toMatchObject({ mentioned: true, brandMentions: 2, sources: [{ title: 'Guide', url: 'https://acme.com/guide' }] });

    expect(getLatestPromptChecks().get(promptId)).toMatchObject({ checkedAt: 3_000, mentioned: true });
  });

  it('counts only successful checks in the mention rate', () => {
    savePromptCheck(check(promptId, false, 4_000, 'DataForSEO: rate limit'));
    expect(getPromptCheckTotals().get(promptId)).toEqual({ total: 3, mentioned: 2 });
  });

  it('removes a prompt together with its checks', () => {
    const otherId = addTrackedPrompt({ ...base, prompt: 'Temporary', brand: '', domain: 'temp.example' });
    savePromptCheck(check(otherId, false, 5_000));
    removeTrackedPrompt(otherId);
    expect(getTrackedPrompt(otherId)).toBeNull();
    expect(getPromptChecks(otherId)).toEqual([]);
  });
});

describe('prompt tracker schedule', () => {
  it('saves, reads and deletes the daily schedule', () => {
    const saved = savePromptTrackerSchedule({ timeOfDay: '08:30', timeZone: 'Europe/Paris' });
    expect(getPromptTrackerSchedule()).toEqual(saved);
    deletePromptTrackerSchedule();
    expect(getPromptTrackerSchedule()).toBeNull();
  });

  it('claims a due schedule once and moves it to the next day', () => {
    savePromptTrackerSchedule({ timeOfDay: '08:00', timeZone: 'UTC' });
    const farFuture = Date.now() + 2 * 86_400_000;

    const first = claimDuePromptTrackerSchedules(farFuture);
    expect(first.length).toBe(1);
    expect(first[0].nextRunAt).toBeGreaterThan(farFuture);

    // A second worker pass at the same moment must not claim the same run again.
    expect(claimDuePromptTrackerSchedules(farFuture)).toEqual([]);
    deletePromptTrackerSchedule();
  });
});
