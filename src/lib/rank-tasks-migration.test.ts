import { afterAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dfsui-rank-tasks-migration-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

// A pre-0.6.0 data store in which two overlapping runs left two pending tasks for one keyword.
const legacy = new Database(process.env.DB_PATH);
legacy.exec(`
  CREATE TABLE tracked_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    domain TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT 'France',
    language TEXT NOT NULL DEFAULT 'fr',
    created_at INTEGER NOT NULL,
    UNIQUE(keyword, domain, location, language)
  );
  CREATE TABLE rank_tasks (
    task_id TEXT PRIMARY KEY,
    keyword_id INTEGER NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    cost REAL,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    error_message TEXT
  );
  INSERT INTO tracked_keywords (id, keyword, domain, created_at) VALUES (1, 'dup', 'example.com', 1), (2, 'single', 'example.com', 1);
  INSERT INTO rank_tasks (task_id, keyword_id, status, created_at) VALUES
    ('first', 1, 'pending', 10), ('second', 1, 'pending', 20), ('other', 2, 'pending', 30), ('old', 1, 'done', 5);
`);
legacy.close();

import { getPendingRankTasksForProject } from './db';

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('rank_tasks active-keyword index migration', () => {
  it('opens a store with duplicate pending tasks, keeping the oldest one per keyword', () => {
    const pending = getPendingRankTasksForProject('default').map((task) => task.taskId).sort();
    expect(pending).toEqual(['first', 'other']);

    const db = new Database(process.env.DB_PATH!, { readonly: true });
    const second = db.prepare(`SELECT status, error_message FROM rank_tasks WHERE task_id = 'second'`).get() as { status: string; error_message: string };
    const old = db.prepare(`SELECT status FROM rank_tasks WHERE task_id = 'old'`).get() as { status: string };
    const index = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_rank_tasks_active_keyword'`).get();
    db.close();

    expect(second.status).toBe('failed');
    expect(second.error_message).toMatch(/Duplicate/);
    expect(old.status).toBe('done');
    expect(index).toBeTruthy();
  });
});
