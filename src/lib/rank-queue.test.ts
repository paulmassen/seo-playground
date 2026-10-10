import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfsui-rank-queue-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import { createProject, getPendingRankTasksForProject, getTrackedKeywordsForProject, runInProjectScope, addTrackedKeyword } from './db';
import { queueStandardRankChecksForProject } from './rank-queue';

const creds = { login: 'login', pass: 'pass' };
let projectId: string;

beforeAll(() => {
  projectId = createProject({
    name: 'Rank Queue', domain: 'rank-queue.example', defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '100',
  }).id;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function addKeyword(keyword: string) {
  return runInProjectScope(projectId, () => {
    const id = addTrackedKeyword(keyword, 'example.com', 'France', 'French');
    return getTrackedKeywordsForProject(projectId).find((item) => item.id === id)!;
  });
}

function okResponse(id: string) {
  return new Response(JSON.stringify({ status_code: 20000, tasks: [{ id, status_code: 20100, cost: 0.001 }] }), { status: 200 });
}

describe('queueStandardRankChecksForProject', () => {
  it('reserves before posting so concurrent calls do not double bill the same keyword', async () => {
    const keyword = addKeyword(`concurrent-${crypto.randomUUID()}`);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = vi.fn(async () => {
      await gate;
      return okResponse(`task-${crypto.randomUUID()}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = queueStandardRankChecksForProject(projectId, [keyword], creds, 20);
    const second = queueStandardRankChecksForProject(projectId, [keyword], creds, 20);
    await Promise.resolve();
    release();

    const results = await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.reduce((sum, result) => sum + result.queued, 0)).toBe(1);
    expect(getPendingRankTasksForProject(projectId).filter((task) => task.keywordId === keyword.id)).toHaveLength(1);
  });

  it('treats DataForSEO business rejections as failures instead of silent success', async () => {
    const keyword = addKeyword(`business-error-${crypto.randomUUID()}`);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status_code: 20000,
      tasks: [{ status_code: 40501, status_message: 'Invalid Field: location_name.' }],
    }), { status: 200 })));

    const result = await queueStandardRankChecksForProject(projectId, [keyword], creds, 20);
    expect(result).toEqual({ queued: 0, failed: true });
    expect(getPendingRankTasksForProject(projectId).some((task) => task.keywordId === keyword.id)).toBe(false);
  });

  it('considers every active pending task, not only the first 500', async () => {
    const keywords = Array.from({ length: 501 }, (_, index) => addKeyword(`bulk-${crypto.randomUUID()}-${index}`));
    vi.stubGlobal('fetch', vi.fn(async (...args: unknown[]) => {
      const init = args[1] as RequestInit;
      const body = JSON.parse(init.body as string) as unknown[];
      return new Response(JSON.stringify({
        status_code: 20000,
        tasks: body.map((_, index) => ({ id: `bulk-task-${crypto.randomUUID()}-${index}`, status_code: 20100, cost: 0.001 })),
      }), { status: 200 });
    }));

    expect((await queueStandardRankChecksForProject(projectId, keywords, creds, 20)).queued).toBe(501);
    vi.mocked(fetch).mockClear();
    expect(await queueStandardRankChecksForProject(projectId, keywords, creds, 20)).toEqual({ queued: 0, failed: false });
    expect(fetch).not.toHaveBeenCalled();
  });
});
