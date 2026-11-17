import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfsui-ai-mode-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import {
  addTrackedKeyword, createProject, getAiModeDetails, getAiModeHistory, getPendingAiModeTasksForProject,
  getTrackedKeywordsForProject, runInProjectScope, setTrackedKeywordsAiMode, getSpendByTool,
} from './db';
import { collectAiModeProgress, parseAiModeResult, queueAiModeChecksForProject } from './ai-mode';

const creds = { login: 'login', pass: 'pass' };
let projectId: string;

beforeAll(() => {
  projectId = createProject({
    name: 'AI Mode', domain: 'ai-mode.example', defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '20',
  }).id;
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const answer = [{
  type: 'ai_overview',
  markdown: 'Best plumbers in Lyon: **Plomberie Martin** and others.',
  items: [{
    type: 'ai_overview_element',
    references: [
      { domain: 'www.pagesjaunes.fr', url: 'https://www.pagesjaunes.fr/plombier-lyon', title: 'PagesJaunes' },
      { domain: 'google.com', url: 'https://www.google.com/search?q=x' },
    ],
    links: [{ domain: 'plomberie-martin.fr', url: 'https://plomberie-martin.fr/', title: 'Martin' }],
  }],
  references: [{ domain: 'pagesjaunes.fr', url: 'https://pagesjaunes.fr/other' }, { domain: 'shop.example.com', url: 'https://shop.example.com/a' }],
}];

describe('parseAiModeResult', () => {
  it('ranks the domain among distinct cited domains, ignoring Google links', () => {
    const result = parseAiModeResult(answer, 'https://plomberie-martin.fr');
    expect(result.status).toBe('cited');
    expect(result.citationPosition).toBe(2);
    expect(result.citedUrl).toBe('https://plomberie-martin.fr/');
    expect(result.sources.map((s) => s.domain)).toEqual(['pagesjaunes.fr', 'plomberie-martin.fr', 'shop.example.com']);
    expect(result.answer).toContain('Plomberie Martin');
  });

  it('matches subdomains of the tracked domain', () => {
    expect(parseAiModeResult(answer, 'example.com')).toMatchObject({ status: 'cited', citationPosition: 3 });
  });

  it('tells an answer without the domain from no answer at all', () => {
    expect(parseAiModeResult(answer, 'other.fr')).toMatchObject({ status: 'not_cited', citationPosition: null });
    expect(parseAiModeResult([], 'other.fr')).toMatchObject({ status: 'no_answer', sources: [] });
    expect(parseAiModeResult(null, 'other.fr').status).toBe('no_answer');
  });
});

describe('AI Mode queue and collection', () => {
  function keyword(name: string) {
    return runInProjectScope(projectId, () => {
      const id = addTrackedKeyword(name, 'plomberie-martin.fr', 'Lyon,Auvergne-Rhone-Alpes,France', 'French');
      setTrackedKeywordsAiMode([id], true);
      return getTrackedKeywordsForProject(projectId).find((k) => k.id === id)!;
    });
  }

  it('stores the AI Mode opt-in on the keyword', () => {
    const kw = keyword(`opt-in-${crypto.randomUUID()}`);
    expect(kw.aiMode).toBe(true);
    runInProjectScope(projectId, () => setTrackedKeywordsAiMode([kw.id], false));
    expect(getTrackedKeywordsForProject(projectId).find((k) => k.id === kw.id)!.aiMode).toBe(false);
  });

  it('posts one task per keyword, never two pending at once, and saves the citation with its cost', async () => {
    const kw = keyword(`plombier lyon ${crypto.randomUUID()}`);
    const taskId = `ai-${crypto.randomUUID()}`;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/task_post')) {
        const body = JSON.parse(String(init?.body)) as Array<Record<string, unknown>>;
        expect(body[0]).toMatchObject({ keyword: kw.keyword, location_name: kw.location, language_name: 'French', priority: 1 });
        return new Response(JSON.stringify({ status_code: 20000, tasks: [{ id: taskId, status_code: 20100, cost: 0.0012 }] }));
      }
      return new Response(JSON.stringify({ tasks: [{ status_code: 20000, cost: 0.0012, result: [{ items: answer }] }] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await queueAiModeChecksForProject(projectId, [kw], creds)).toEqual({ queued: 1, failed: false });
    expect(await queueAiModeChecksForProject(projectId, [kw], creds)).toEqual({ queued: 0, failed: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getPendingAiModeTasksForProject(projectId).filter((t) => t.keywordId === kw.id)).toHaveLength(1);

    const progress = await collectAiModeProgress(projectId, creds);
    expect(progress.completed).toBeGreaterThanOrEqual(1);
    const [check] = runInProjectScope(projectId, () => getAiModeHistory(kw.id));
    expect(check).toMatchObject({ status: 'cited', citationPosition: 2, cost: 0.0012 });
    const [detail] = runInProjectScope(projectId, () => getAiModeDetails(kw.id));
    expect(detail.sources).toHaveLength(3);
    const spend = runInProjectScope(projectId, () => getSpendByTool(0, Date.now() + 1000));
    expect(spend.find((tool) => tool.tool === 'Rank Tracker · AI Mode')?.knownCost).toBeCloseTo(0.0012);
  });

  it('records a rejected task as failed instead of leaving it pending', async () => {
    const kw = keyword(`rejected ${crypto.randomUUID()}`);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 40200, status_message: 'Payment Required.' }] }))));
    expect(await queueAiModeChecksForProject(projectId, [kw], creds)).toEqual({ queued: 0, failed: true });
    expect(getPendingAiModeTasksForProject(projectId).some((t) => t.keywordId === kw.id)).toBe(false);
  });
});
