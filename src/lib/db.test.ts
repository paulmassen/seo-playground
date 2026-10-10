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
  getActiveProject, getProjects, createProject, deleteProject, setActiveProject,
  getAiOptimizationHistory, saveAiOptimizationSearch, getAiOptimizationResults, type AiOptimizationEntry,
  getWebMentionsHistory, saveWebMentionsSearch, getWebMentionsItems, getWebMentionsSummary, type WebMentionsEntry,
  getSerpHistory, saveSerpSearch,
  getSpendByTool, getSpendByDay, getFirstSpendTs,
  gridSeriesId, getGridSeriesHistory, getGridSchedule, saveGridSchedule, saveGridSearch, deleteGridSchedule, deleteGridSeries, type GridSearchEntry,
  claimDueGridSchedules, retryClaimedGridSchedule,
  getRankTrackerSchedule, saveRankTrackerSchedule, deleteRankTrackerSchedule,
  getHistRankHistory, saveHistRankSearch,
  addTrackedKeyword, saveRankCheck, getRankTopResultsHistory,
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

// SERP searches used to drop the cost DataForSEO reports, leaving no way to reconcile spend (#9).
describe('SERP search cost', () => {
  const base = { ts: Date.now(), keyword: 'plombier paris', location: 'France', language: 'French', device: 'desktop', depth: 10, count: 1 };

  it('persists the reported cost with the search', () => {
    saveSerpSearch({ ...base, id: 'test-serp-cost', cost: 0.002 }, [{ type: 'organic' }]);
    expect(getSerpHistory().find((h) => h.id === 'test-serp-cost')?.cost).toBe(0.002);
  });

  it('keeps an unknown cost as undefined rather than zero', () => {
    saveSerpSearch({ ...base, id: 'test-serp-no-cost' }, [{ type: 'organic' }]);
    expect(getSerpHistory().find((h) => h.id === 'test-serp-no-cost')?.cost).toBeUndefined();
  });
});

describe('spending aggregates', () => {
  const day = (d: number, h = 12) => new Date(2030, 0, d, h).getTime();
  const serp = { keyword: 'k', location: 'France', language: 'French', device: 'desktop', depth: 10, count: 1 };

  beforeAll(() => {
    saveSerpSearch({ ...serp, id: 'spend-1', ts: day(1), cost: 0.002 }, [{}]);
    saveSerpSearch({ ...serp, id: 'spend-2', ts: day(2), cost: 0.004 }, [{}]);
    saveSerpSearch({ ...serp, id: 'spend-3', ts: day(2, 18) }, [{}]); // unknown cost
    saveSerpSearch({ ...serp, id: 'spend-out', ts: day(10), cost: 1 }, [{}]); // outside the range
  });

  const from = new Date(2030, 0, 1).getTime();
  const to = new Date(2030, 0, 3).getTime();

  it('sums known costs per tool within the range and counts unknown-cost calls separately', () => {
    const serpSpend = getSpendByTool(from, to).find((t) => t.tool === 'SERP Checker');
    expect(serpSpend).toMatchObject({ calls: 3, unknownCalls: 1 });
    expect(serpSpend!.knownCost).toBeCloseTo(0.006);
    expect(serpSpend!.avgKnownCost).not.toBeNull();
  });

  it('groups calls by local day', () => {
    const days = getSpendByDay(from, to);
    expect(days.map((d) => [d.day, d.calls, d.unknownCalls])).toEqual([['2030-01-01', 1, 0], ['2030-01-02', 2, 1]]);
    expect(days[1].knownCost).toBeCloseTo(0.004);
  });

  it('omits tools with no calls in the range', () => {
    expect(getSpendByTool(new Date(2031, 0, 1).getTime(), new Date(2031, 0, 2).getTime())).toEqual([]);
  });

  it('finds the oldest recorded call', () => {
    expect(getFirstSpendTs()).not.toBeNull();
  });
});

describe('projects', () => {
  it('keeps each project history in a separate data store', () => {
    const defaultProject = getActiveProject();
    const secondProject = createProject({
      name: 'Second Project', domain: 'second-project.example', defaultLocation: 'France',
      defaultLanguage: 'French', defaultCoordinates: '', rankTrackerDepth: '100',
    });

    setActiveProject(secondProject.id);
    saveSerpSearch({
      id: 'second-project-only', ts: Date.now(), keyword: 'isolated', location: 'France', language: 'French', device: 'desktop', depth: 10, count: 1,
    }, []);
    expect(getSerpHistory().some((entry) => entry.id === 'second-project-only')).toBe(true);

    setActiveProject(defaultProject.id);
    expect(getSerpHistory().some((entry) => entry.id === 'second-project-only')).toBe(false);

    deleteProject(secondProject.id);
    expect(getProjects().some((project) => project.id === secondProject.id)).toBe(false);
  });
});

describe('Geo-grid monitoring', () => {
  const seriesId = gridSeriesId('plombier paris', '48.8566,2.3522', 3, 1, 'Example Plumbing', 'French');
  const base: Omit<GridSearchEntry, 'id' | 'ts'> = {
    series_id: seriesId, keyword: 'plombier paris', target: 'Example Plumbing', center: '48.8566,2.3522',
    grid_size: 3, spacing_km: 1, language: 'French', status: 'done', queue_mode: 'live',
  };

  it('groups separate snapshots under one stable series', () => {
    saveGridSearch({ ...base, id: 'grid-monitor-one', ts: 1 }, [{ row: 0, col: 0, rank: 4 }]);
    saveGridSearch({ ...base, id: 'grid-monitor-two', ts: 2 }, [{ row: 0, col: 0, rank: 2 }]);
    expect(getGridSeriesHistory(seriesId).filter((run) => run.id.startsWith('grid-monitor-')).map((run) => run.id))
      .toEqual(['grid-monitor-two', 'grid-monitor-one']);
  });

  it('keeps a series complete beyond the 100-run history cap', () => {
    const otherSeries = gridSeriesId('other keyword', base.center, base.grid_size, base.spacing_km, base.target, base.language);
    saveGridSearch({ ...base, id: 'grid-old-snapshot', ts: 10 }, [{ row: 0, col: 0, rank: 5 }]);
    for (let index = 0; index < 101; index += 1) {
      saveGridSearch({ ...base, series_id: otherSeries, id: `grid-other-${index}`, ts: 1_000 + index }, [{ row: 0, col: 0, rank: 1 }]);
    }
    expect(getGridSeriesHistory(seriesId).map((run) => run.id)).toContain('grid-old-snapshot');
  });

  it('reopens a claimed run for a retry, but not once the slot is too old', () => {
    const saved = saveGridSchedule({ ...base, frequency: 'daily', weekday: null, time_of_day: '08:30', time_zone: 'Europe/Paris' });
    const slot = saved.next_run_at;
    const [claimed] = claimDueGridSchedules(slot + 1_000).filter((item) => item.series_id === seriesId);
    expect(claimed.scheduled_at).toBe(slot);
    expect(claimDueGridSchedules(slot + 2_000).some((item) => item.series_id === seriesId)).toBe(false);

    expect(retryClaimedGridSchedule(claimed.projectId, claimed, slot + 1_000)).toBe(true);
    expect(getGridSchedule(seriesId)?.next_run_at).toBe(slot + 1_000 + 5 * 60_000);

    const [reclaimed] = claimDueGridSchedules(slot + 7 * 3_600_000).filter((item) => item.series_id === seriesId);
    expect(retryClaimedGridSchedule(reclaimed.projectId, { ...reclaimed, scheduled_at: slot }, slot + 7 * 3_600_000)).toBe(false);
    deleteGridSchedule(seriesId);
  });

  it('persists and removes a daily schedule', () => {
    const saved = saveGridSchedule({ ...base, frequency: 'daily', weekday: null, time_of_day: '08:30', time_zone: 'Europe/Paris' });
    expect(saved.next_run_at).toBeGreaterThan(Date.now());
    expect(getGridSchedule(seriesId)).toMatchObject({ frequency: 'daily', time_of_day: '08:30', time_zone: 'Europe/Paris' });
    deleteGridSchedule(seriesId);
    expect(getGridSchedule(seriesId)).toBeNull();
  });

  it('deletes a whole monitor: every snapshot and its schedule', () => {
    const doomed = gridSeriesId('delete me', base.center, base.grid_size, base.spacing_km, base.target, base.language);
    saveGridSearch({ ...base, series_id: doomed, id: 'grid-delete-one', ts: 5 }, [{ row: 0, col: 0, rank: 1 }]);
    saveGridSearch({ ...base, series_id: doomed, id: 'grid-delete-two', ts: 6 }, [{ row: 0, col: 0, rank: 2 }]);
    saveGridSchedule({ ...base, series_id: doomed, frequency: 'weekly', weekday: 1, time_of_day: '09:00', time_zone: 'UTC' });
    deleteGridSeries(doomed);
    expect(getGridSeriesHistory(doomed)).toEqual([]);
    expect(getGridSchedule(doomed)).toBeNull();
    expect(getGridSeriesHistory(seriesId).length).toBeGreaterThan(0);
  });
});

describe('Rank Tracker monitoring', () => {
  it('persists and removes a daily Standard schedule', () => {
    const saved = saveRankTrackerSchedule({ timeOfDay: '07:45', timeZone: 'Europe/Paris' });
    expect(saved.nextRunAt).toBeGreaterThan(Date.now());
    expect(getRankTrackerSchedule()).toMatchObject({ timeOfDay: '07:45', timeZone: 'Europe/Paris' });
    deleteRankTrackerSchedule();
    expect(getRankTrackerSchedule()).toBeNull();
  });
});

describe('Historical Rank search cache', () => {
  it('keeps the requested historical range with the saved result', () => {
    saveHistRankSearch({
      id: 'historical-rank-range', ts: Date.now(), target: 'example.com', location: 'France', language: 'French',
      dateFrom: '2020-10-01', dateTo: '2026-09-27', cost: 0.01,
    }, []);
    expect(getHistRankHistory().find((entry) => entry.id === 'historical-rank-range')).toMatchObject({
      dateFrom: '2020-10-01', dateTo: '2026-09-27',
    });
  });
});

describe('rank check top results', () => {
  const top = (domain: string) => [{ position: 1, domain, url: `https://${domain}/`, title: null }];

  it('keeps the first results page of a check and skips checks that have none', () => {
    const id = addTrackedKeyword('top results kw', 'example.com', 'France', 'French');
    saveRankCheck(id, { position: null, url: null, title: null, aiOverview: null, topResults: null }, null);
    expect(getRankTopResultsHistory(id)).toEqual([]);

    // A second check on the same day replaces the first rather than adding a row.
    saveRankCheck(id, { position: 2, url: 'https://example.com/', title: null, aiOverview: null, topResults: top('a.com') }, null);
    const history = getRankTopResultsHistory(id);
    expect(history).toHaveLength(1);
    expect(history[0].topResults).toEqual(top('a.com'));
    expect(history[0].position).toBe(2);
  });
});
