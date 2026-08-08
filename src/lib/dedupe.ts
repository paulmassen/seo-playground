/**
 * Deterministic id for a search's full parameter set, bucketed into a time window. Identical
 * params within the same window collapse to the same id — used to check for an existing cached
 * result before firing a paid DataForSEO call, so an accidental double-submit, back-button nav,
 * or (in dev) a Fast Refresh reload of the page doesn't re-bill the same search. A deliberate
 * re-run a bit later gets a fresh window and a fresh id, so it isn't blocked.
 */
export function stableSearchId(parts: Array<string | number | boolean | null | undefined>, windowMs = 60_000): string {
  const window = Math.floor(Date.now() / windowMs);
  const key = [window, ...parts].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
