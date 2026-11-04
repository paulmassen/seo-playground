import { describe, expect, it } from 'vitest';
import { gridTimeZone } from './grid-timezone';

describe('gridTimeZone', () => {
  it('uses the map location rather than the browser location', () => {
    expect(gridTimeZone('40.7128,-74.0060')).toBe('America/New_York');
    expect(gridTimeZone('48.8566,2.3522')).toBe('Europe/Paris');
    expect(gridTimeZone('35.6762,139.6503')).toBe('Asia/Tokyo');
  });

  it('rejects malformed or out-of-range coordinates', () => {
    for (const center of ['', ',', '48,', 'abc,2', '91,2', '48,181', '48,2,3']) {
      expect(gridTimeZone(center)).toBeNull();
    }
  });
});
