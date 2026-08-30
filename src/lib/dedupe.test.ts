import { describe, it, expect, vi, afterEach } from 'vitest';
import { stableSearchId } from './dedupe';

describe('stableSearchId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is deterministic for the same params within the same time window', () => {
    const a = stableSearchId(['serp', 'plombier paris', 'France', 'fr', 'desktop', 10]);
    const b = stableSearchId(['serp', 'plombier paris', 'France', 'fr', 'desktop', 10]);
    expect(a).toBe(b);
  });

  it('differs when any param differs — this is the guard against silently merging two distinct billed searches', () => {
    const base = stableSearchId(['serp', 'plombier paris', 'France', 'fr', 'desktop', 10]);
    const differentKeyword = stableSearchId(['serp', 'electricien paris', 'France', 'fr', 'desktop', 10]);
    const differentLocation = stableSearchId(['serp', 'plombier paris', 'Belgium', 'fr', 'desktop', 10]);
    const differentDevice = stableSearchId(['serp', 'plombier paris', 'France', 'fr', 'mobile', 10]);
    expect(differentKeyword).not.toBe(base);
    expect(differentLocation).not.toBe(base);
    expect(differentDevice).not.toBe(base);
  });

  it('documents a real edge case: null, undefined, and "" collapse to the same id', () => {
    // Array.prototype.join renders null/undefined as '', same as an actual empty string — so
    // `stableSearchId(['a', undefined, 'b'])` and `stableSearchId(['a', '', 'b'])` collide. Harmless
    // in practice (callers pass real param values, not a mix of "" and undefined for the same slot),
    // but worth having pinned down rather than assumed.
    const withUndefined = stableSearchId(['a', undefined, 'b']);
    const withEmptyString = stableSearchId(['a', '', 'b']);
    const withNull = stableSearchId(['a', null, 'b']);
    expect(withUndefined).toBe(withEmptyString);
    expect(withUndefined).toBe(withNull);
  });

  it('is stable within a time window but changes once the window rolls over, so a deliberate re-run later is never blocked', () => {
    const windowMs = 60_000;
    const nowSpy = vi.spyOn(Date, 'now');

    nowSpy.mockReturnValue(0);
    const first = stableSearchId(['same', 'params'], windowMs);

    nowSpy.mockReturnValue(windowMs - 1);
    const stillSameWindow = stableSearchId(['same', 'params'], windowMs);
    expect(stillSameWindow).toBe(first);

    nowSpy.mockReturnValue(windowMs);
    const nextWindow = stableSearchId(['same', 'params'], windowMs);
    expect(nextWindow).not.toBe(first);
  });

  it('always returns an 8-character lowercase hex string', () => {
    const id = stableSearchId(['x']);
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });
});
