import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createProject, deleteProject, getActiveProject, getCurrentProject, getSetting, setSetting,
  getSerpHistory, saveSerpSearch, getTargetDomains, setActiveProject, runInProjectScope,
  runWithCurrentProject, withProjectScope, getTrackedKeywordsForProject, saveCredentials,
  getReviewsTasks,
} from './db';

vi.mock('@/lib/db', () => import('./db'));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { submitReviewsTaskAction } from '../app/dashboard/google-reviews/actions';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfsui-project-scope-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
const input = (name: string) => ({ name, domain: `${name}.example`, defaultLocation: name,
  defaultLanguage: 'English', defaultCoordinates: '', rankTrackerDepth: '100' });
const entry = (id: string) => ({ id, ts: Date.now(), keyword: id, location: 'France', language: 'French', device: 'desktop', depth: 10, count: 1 });
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
let a: string;
let b: string;
beforeEach(() => {
  a = createProject(input(`a-${crypto.randomUUID()}`)).id;
  b = createProject(input(`b-${crypto.randomUUID()}`)).id;
  setActiveProject(a);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setActiveProject('default');
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('operation-local project identity', () => {
  it('captures at page entry before searchParams resolves and isolates concurrent operations', async () => {
    const paramsA = deferred<string>();
    const paramsB = deferred<string>();
    const page = withProjectScope(async (params: Promise<string>) => {
      const id = await params;
      await Promise.resolve();
      saveSerpSearch(entry(id), [{ project: getCurrentProject().id }]);
      setSetting('default_language', id);
      return { project: getCurrentProject(), domains: getTargetDomains() };
    });
    const resultA = page(paramsA.promise);
    setActiveProject(b);
    const resultB = page(paramsB.promise);
    setActiveProject('default');
    paramsB.resolve('result-b');
    const receivedB = await resultB;
    paramsA.resolve('result-a');
    const receivedA = await resultA;
    expect(receivedA.project.id).toBe(a);
    expect(receivedB.project.id).toBe(b);
    expect(receivedA.domains).toContain(receivedA.project.domain);
    expect(runInProjectScope(a, () => getSerpHistory().map(e => e.id))).toEqual(['result-a']);
    expect(runInProjectScope(b, () => getSerpHistory().map(e => e.id))).toEqual(['result-b']);
    expect(runInProjectScope(a, () => getSetting('default_language'))).toBe('result-a');
    expect(runInProjectScope(b, () => getSetting('default_language'))).toBe('result-b');
    expect(getCurrentProject().id).toBe('default');
  });

  it('preserves the global selection and restores nested scopes, including thrown redirects/errors', async () => {
    await runInProjectScope(a, async () => {
      setActiveProject(b);
      expect(getActiveProject().id).toBe(b);
      expect(getCurrentProject().id).toBe(a);
      await runWithCurrentProject(async () => {
        await Promise.resolve();
        expect(getCurrentProject().id).toBe(a);
      });
      await expect(runInProjectScope(b, async () => {
        await Promise.resolve();
        throw new Error('redirect');
      })).rejects.toThrow('redirect');
      expect(getCurrentProject().id).toBe(a);
    });
    expect(getCurrentProject().id).toBe(b);
  });

  it.each([false, true])('rejects deleted projects without recreating files (opened=%s)', async (opened) => {
    const file = path.join(tmpDir, `test.project-${a}.db`);
    if (opened) runInProjectScope(a, () => saveSerpSearch(entry('before-delete'), []));
    const gate = deferred();
    const pending = runWithCurrentProject(async () => {
      await gate.promise;
      expect(() => getCurrentProject()).toThrow('Project not found');
      expect(() => getSetting('default_domain')).toThrow('Project not found');
      expect(() => getSerpHistory()).toThrow('Project not found');
      expect(() => saveSerpSearch(entry('after-delete'), [])).toThrow('Project not found');
    });
    setActiveProject(b);
    deleteProject(a);
    gate.resolve();
    await pending;
    expect(() => getTrackedKeywordsForProject(a)).toThrow('Project not found');
    expect(() => runInProjectScope(a, () => null)).toThrow('Project not found');
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(`${file}-wal`)).toBe(false);
    expect(fs.existsSync(`${file}-shm`)).toBe(false);
    expect(getSerpHistory()).toEqual([]);
  });

  it('keeps a real paid server action task in A after both fetch and JSON awaits plus a switch', async () => {
    saveCredentials('test-login', 'test-pass');
    const response = deferred<Response>();
    const json = deferred<unknown>();
    const fetchMock = vi.fn(() => response.promise);
    vi.stubGlobal('fetch', fetchMock);
    const form = new FormData();
    form.set('keyword', 'test business');
    const pending = submitReviewsTaskAction(form);
    expect(fetchMock).toHaveBeenCalledOnce();
    setActiveProject(b);
    response.resolve({ ok: true, json: () => json.promise } as Response);
    await Promise.resolve();
    json.resolve({ cost: 0.02, tasks: [{ id: 'task-a', status_code: 20100 }] });
    await pending;
    expect(getReviewsTasks()).toEqual([]);
    expect(runInProjectScope(a, () => getReviewsTasks())).toEqual([
      expect.objectContaining({ id: 'task-a', business: 'test business', cost: 0.02 }),
    ]);
  });
});
