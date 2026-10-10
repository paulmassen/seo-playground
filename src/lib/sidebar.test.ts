import { describe, it, expect } from 'vitest';
import { parseCollapsedSections, parseFavorites, serializeList } from './sidebar';

describe('parseCollapsedSections', () => {
  it('reads the encoded cookie value', () => {
    expect(parseCollapsedSections('backlinks%2Cai')).toEqual(['backlinks', 'ai']);
  });

  it('treats a missing, empty or malformed cookie as nothing collapsed', () => {
    expect(parseCollapsedSections(undefined)).toEqual([]);
    expect(parseCollapsedSections('')).toEqual([]);
    expect(parseCollapsedSections('%E0%A4%A')).toEqual([]);
  });
});

describe('parseFavorites', () => {
  it('round-trips hrefs through the cookie encoding, keeping their order', () => {
    const hrefs = ['/dashboard/serp', '/dashboard/backlinks/broken', '/dashboard'];
    expect(parseFavorites(serializeList(hrefs))).toEqual(hrefs);
  });

  it('drops duplicates and anything outside the dashboard', () => {
    expect(parseFavorites(serializeList(['/dashboard/serp', 'https://evil.test', '/dashboard/serp']))).toEqual(['/dashboard/serp']);
  });

  it('treats a missing or malformed cookie as no favorites', () => {
    expect(parseFavorites(undefined)).toEqual([]);
    expect(parseFavorites('%E0%A4%A')).toEqual([]);
  });
});
