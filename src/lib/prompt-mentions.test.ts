import { describe, expect, it } from 'vitest';
import {
  countBrandMentions, detectMention, extractAnswerText, extractSources, isDomainCited, normalizeDomain,
} from './prompt-mentions';

describe('extractAnswerText', () => {
  it('joins visible sections and skips reasoning blocks', () => {
    const items = [
      { type: 'reasoning', sections: [{ text: 'thinking…' }] },
      { type: 'message', sections: [{ text: 'First part.' }, { text: '  Second part.  ' }] },
    ];
    expect(extractAnswerText(items)).toBe('First part.\n\nSecond part.');
  });

  it('returns an empty string when there is no answer', () => {
    expect(extractAnswerText(undefined)).toBe('');
    expect(extractAnswerText([{ type: 'message', sections: [{ text: '   ' }] }])).toBe('');
  });
});

describe('extractSources', () => {
  it('returns unique URLs in order and ignores reasoning annotations', () => {
    const items = [
      { type: 'reasoning', sections: [{ annotations: [{ url: 'https://ignored.example/' }] }] },
      {
        type: 'message',
        sections: [
          { annotations: [{ title: 'A', url: 'https://a.example/x' }, { title: 'B', url: 'https://b.example/' }] },
          { annotations: [{ title: 'A again', url: 'https://a.example/x' }, { url: undefined }] },
        ],
      },
    ];
    expect(extractSources(items)).toEqual([
      { title: 'A', url: 'https://a.example/x' },
      { title: 'B', url: 'https://b.example/' },
    ]);
  });
});

describe('normalizeDomain', () => {
  it('strips protocol, www, path and trailing dot', () => {
    expect(normalizeDomain('https://www.Example.com/blog/post')).toBe('example.com');
    expect(normalizeDomain('  example.com.  ')).toBe('example.com');
    expect(normalizeDomain('')).toBe('');
  });
});

describe('countBrandMentions', () => {
  it('counts whole-word, case-insensitive matches', () => {
    expect(countBrandMentions('Acme is great. acme also ships. ACME!', 'Acme')).toBe(3);
  });

  it('does not match a brand inside a longer word', () => {
    expect(countBrandMentions('Acmelab and Preacme are not it.', 'Acme')).toBe(0);
  });

  it('handles regex characters in the brand name', () => {
    expect(countBrandMentions('Try C++ Tools today.', 'C++ Tools')).toBe(1);
  });

  it('returns 0 for an empty brand', () => {
    expect(countBrandMentions('Anything at all', '   ')).toBe(0);
  });
});

describe('isDomainCited', () => {
  it('matches a source on the domain or one of its subdomains', () => {
    expect(isDomainCited('', [{ url: 'https://shop.acme.com/plumbers' }], 'acme.com')).toBe(true);
    expect(isDomainCited('', [{ url: 'https://www.acme.com/' }], 'acme.com')).toBe(true);
  });

  it('does not match a look-alike domain', () => {
    expect(isDomainCited('', [{ url: 'https://notacme.com/' }, { url: 'https://acme.com.evil.net/' }], 'acme.com')).toBe(false);
  });

  it('matches the domain written out in the answer text', () => {
    expect(isDomainCited('You can book on Acme.com directly.', [], 'acme.com')).toBe(true);
    expect(isDomainCited('Visit myacme.com for details.', [], 'acme.com')).toBe(false);
  });

  it('is false without a domain', () => {
    expect(isDomainCited('acme.com', [{ url: 'https://acme.com/' }], '')).toBe(false);
  });
});

describe('detectMention', () => {
  it('reports a brand-only mention', () => {
    expect(detectMention({ answer: 'Acme is a good choice.', sources: [], brand: 'Acme', domain: '' })).toEqual({
      mentioned: true, brandMentions: 1, domainCited: false,
    });
  });

  it('reports a domain-only citation as a mention', () => {
    expect(detectMention({ answer: 'See the guide.', sources: [{ url: 'https://acme.com/guide' }], brand: '', domain: 'acme.com' })).toEqual({
      mentioned: true, brandMentions: 0, domainCited: true,
    });
  });

  it('reports no mention when neither brand nor domain appears', () => {
    expect(detectMention({ answer: 'Try Other Co.', sources: [{ url: 'https://other.co/' }], brand: 'Acme', domain: 'acme.com' })).toEqual({
      mentioned: false, brandMentions: 0, domainCited: false,
    });
  });
});
