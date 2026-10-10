import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfsui-grid-progress-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import {
  createProject, getGridEntryForProject, getGridProgressForProject, saveGridSearchPendingForProject,
  type GridSearchEntry, type GridTaskPoint,
} from './db';
import { collectGridProgress } from './grid-progress';

let projectId: string;
const creds = { login: 'login', pass: 'pass' };

beforeAll(() => {
  projectId = createProject({
    name: 'Grid Progress', domain: 'grid-progress.example', defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '100',
  }).id;
});

afterEach(() => vi.unstubAllGlobals());
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function entry(id: string): GridSearchEntry {
  return {
    id, series_id: `series-${id}`, ts: Date.now(), keyword: 'coffee', target: 'example.com', center: '48.1,2.1',
    grid_size: 1, spacing_km: 1, language: 'English', status: 'pending', queue_mode: 'standard', cost: 0.01,
  };
}

const taskPoint: GridTaskPoint = { task_id: 'task-1', row: 0, col: 0, lat: 48.1, lng: 2.1 };

describe('collectGridProgress', () => {
  it('keeps business errors pending instead of writing a false missing rank', async () => {
    const run = entry(`error-${crypto.randomUUID()}`);
    saveGridSearchPendingForProject(projectId, run, [taskPoint]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      tasks: [{ status_code: 50000, status_message: 'Internal Error' }],
    }), { status: 200 })));

    const result = await collectGridProgress(projectId, run, creds);
    expect(result).toEqual({ status: 'pending', ready: 0, total: 1 });
    expect(getGridEntryForProject(projectId, run.id)?.status).toBe('pending');
    expect(getGridProgressForProject(projectId, run.id)?.pendingTasks).toEqual([taskPoint]);
  });

  it('marks a successful empty local-pack result as done', async () => {
    const run = entry(`empty-${crypto.randomUUID()}`);
    saveGridSearchPendingForProject(projectId, run, [taskPoint]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      tasks: [{ status_code: 20000, result: [{ items: [] }] }],
    }), { status: 200 })));

    const result = await collectGridProgress(projectId, run, creds);
    expect(result).toEqual({ status: 'done', ready: 1, total: 1 });
    expect(getGridEntryForProject(projectId, run.id)?.status).toBe('done');
    expect(getGridProgressForProject(projectId, run.id)?.pendingTasks).toEqual([]);
  });
});
