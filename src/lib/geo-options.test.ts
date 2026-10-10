import { describe, expect, it } from 'vitest';
import { labsLocationLabel } from './geo-options';

describe('labsLocationLabel', () => {
  it('resolves LLM Mentions location codes to country names', () => {
    expect(labsLocationLabel(2124)).toBe('Canada');
    expect(labsLocationLabel('2840')).toBe('United States');
  });

  it('keeps unknown values visible instead of hiding them', () => {
    expect(labsLocationLabel(9999)).toBe('9999');
    expect(labsLocationLabel('custom location')).toBe('custom location');
  });
});
