import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Point db.ts at a throwaway DB file before any of its functions run — getDb() reads
// process.env.DB_PATH lazily on first call, so this must be set before the first test executes,
// not necessarily before the import (db.ts doesn't touch the filesystem at import time).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfsui-db-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import {
  getSetting, setSetting, deleteSetting,
  getCredentials, saveCredentials, clearCredentials,
  getAiOptimizationHistory, saveAiOptimizationSearch, getAiOptimizationResults, type AiOptimizationEntry,
  getWebMentionsHistory, saveWebMentionsSearch, getWebMentionsItems, getWebMentionsSummary, type WebMentionsEntry,
} from './db';

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('settings', () => {
  it('roundtrips a value through set/get', () => {
    setSetting('test-key', 'test-value');
    expect(getSetting('test-key')).toBe('test-value');
  });

  it('returns null for a key that was never set', () => {
    expect(getSetting('never-set-key')).toBeNull();
  });

  it('removes a key on delete', () => {
    setSetting('to-delete', 'x');
    deleteSetting('to-delete');
    expect(getSetting('to-delete')).toBeNull();
  });
});

describe('credentials', () => {
  it('returns null when no credentials are saved', () => {
    clearCredentials();
    expect(getCredentials()).toBeNull();
  });

  it('roundtrips login/pass and clears both together', () => {
    saveCredentials('my-login', 'my-pass');
    expect(getCredentials()).toEqual({ login: 'my-login', pass: 'my-pass' });
    clearCredentials();
    expect(getCredentials()).toBeNull();
  });
});

// This is the exact bug class the app-wide audit flagged as top risk: a page whose cache
// lookup silently no-ops means every refresh re-fires (and re-bills) the same DataForSEO
// search. AI Optimization was found missing this entirely; this locks in that its cache
// table now actually round-trips a result under its own id.
describe('AI Optimization search cache (regression guard for the missing-dedupe bug)', () => {
  beforeAll(() => {
    clearCredentials();
  });

  it('a saved search is retrievable by its id and shows up in history', () => {
    const entry: AiOptimizationEntry = {
      id: 'test-ao-1', ts: Date.now(), target: 'plombier paris', targetType: 'keyword',
      platform: 'google', location: 'France', language: 'French', limit: 20, cost: 0.0123,
    };
    saveAiOptimizationSearch(entry, [{ question: 'q1' }, { question: 'q2' }]);

    const cached = getAiOptimizationResults<{ question: string }>('test-ao-1');
    expect(cached).toEqual([{ question: 'q1' }, { question: 'q2' }]);

    const history = getAiOptimizationHistory();
    expect(history.find((h) => h.id === 'test-ao-1')).toMatchObject({ target: 'plombier paris', cost: 0.0123 });
  });

  it('an id that was never saved returns null, not a crash or stale data', () => {
    expect(getAiOptimizationResults('never-saved-id')).toBeNull();
  });

  it('re-saving under the same id overwrites rather than duplicating the cache entry', () => {
    const entry: AiOptimizationEntry = {
      id: 'test-ao-2', ts: Date.now(), target: 'electricien lyon', targetType: 'keyword',
      platform: 'chat_gpt', location: 'United States', language: 'English', limit: 20,
    };
    saveAiOptimizationSearch(entry, [{ question: 'first save' }]);
    saveAiOptimizationSearch(entry, [{ question: 'second save' }]);

    expect(getAiOptimizationResults('test-ao-2')).toEqual([{ question: 'second save' }]);
    expect(getAiOptimizationHistory().filter((h) => h.id === 'test-ao-2')).toHaveLength(1);
  });
});

describe('Web Mentions search cache (search + summary saved/read together)', () => {
  it('roundtrips both the mention list and the aggregate summary under one id', () => {
    const entry: WebMentionsEntry = {
      id: 'test-wm-1', ts: Date.now(), keyword: 'acme corp', pageTypes: 'news,blogs', limit: 20, totalCount: 2,
    };
    const items = { total_count: 2, items_count: 2, items: [{ domain: 'a.com' }, { domain: 'b.com' }] };
    const summary = { total_count: 2, connotation_types: { positive: 1, negative: 1, neutral: 0 } };
    saveWebMentionsSearch(entry, items, summary);

    expect(getWebMentionsItems('test-wm-1')).toEqual(items);
    expect(getWebMentionsSummary('test-wm-1')).toEqual(summary);
    expect(getWebMentionsHistory().find((h) => h.id === 'test-wm-1')).toMatchObject({ keyword: 'acme corp', totalCount: 2 });
  });
});
