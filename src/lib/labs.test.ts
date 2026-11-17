import { describe, expect, it } from 'vitest';
import { andFilters, cleanDomain, labsCostEstimate, parseDomainList, positiveInt } from './labs';

describe('labs helpers', () => {
  it('builds DataForSEO filters', () => {
    expect(andFilters([])).toBeUndefined();
    expect(andFilters([['a', '>', 1]])).toEqual(['a', '>', 1]);
    expect(andFilters([['a', '>', 1], ['b', '<=', 2], ['c', '=', 'x']])).toEqual([
      ['a', '>', 1], 'and', ['b', '<=', 2], 'and', ['c', '=', 'x'],
    ]);
    expect(() => andFilters(Array.from({ length: 9 }, () => ['a', '=', 1] as [string, string, unknown]))).toThrow();
  });

  it('cleans domains and lists', () => {
    expect(cleanDomain(' https://www.Example.com/path ')).toBe('example.com');
    expect(parseDomainList('a.com, https://b.com/x\nwww.a.com nope')).toEqual(['a.com', 'b.com']);
    expect(parseDomainList(undefined)).toEqual([]);
  });

  it('parses ints and estimates cost', () => {
    expect(positiveInt('12')).toBe(12);
    expect(positiveInt('0')).toBeNull();
    expect(positiveInt('x')).toBeNull();
    expect(labsCostEstimate(100)).toBeCloseTo(0.024);
  });
});
