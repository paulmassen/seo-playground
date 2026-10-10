import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRAND_COLOR,
  LOGO_MAX_BYTES,
  brandPalette,
  cleanBrandFooter,
  cleanBrandName,
  fitBox,
  footerPalette,
  footerSegments,
  headerPolygon,
  hexToRgb,
  normalizeHexColor,
  resolveBrandStyle,
  validateLogoUpload,
} from './brand';

describe('footerSegments', () => {
  it('turns e-mail addresses, domains and URLs into links', () => {
    const segments = footerSegments('Acme SEO · hello@acme.com · acme.com/seo · https://acme.io.');
    const links = segments.filter((segment) => segment.href);
    expect(links.map((segment) => segment.text)).toEqual(['hello@acme.com', 'acme.com/seo', 'https://acme.io']);
    expect(links[0].href).toBe('mailto:hello@acme.com');
    expect(links[1].href).toBe('https://acme.com/seo');
    expect(links[2].href).toBe('https://acme.io');
  });

  it('keeps plain text untouched when there is no link', () => {
    expect(footerSegments('Prepared for the client')).toEqual([{ text: 'Prepared for the client' }]);
  });

  it('does not treat ordinary words as domains', () => {
    expect(footerSegments('Report v2.1 e.g. monthly')).toEqual([{ text: 'Report v2.1 e.g. monthly' }]);
  });
});

describe('headerPolygon', () => {
  it('is a plain rectangle for the straight style', () => {
    expect(headerPolygon(200, 34, 'solid')).toEqual([[0, 0], [200, 0], [200, 34], [0, 34]]);
  });

  it('follows a wavy lower edge that stays inside the band', () => {
    const points = headerPolygon(200, 34, 'wave');
    expect(points[0]).toEqual([0, 0]);
    expect(points[1]).toEqual([200, 0]);
    const edge = points.slice(2);
    const ys = edge.map(([, y]) => y);
    expect(Math.min(...ys)).toBeGreaterThan(28);
    expect(Math.max(...ys)).toBeLessThan(34);
    expect(new Set(ys.map((y) => y.toFixed(3))).size).toBeGreaterThan(5);
  });
});

describe('footerPalette / resolveBrandStyle', () => {
  it('fills missing or invalid footer colours with defaults', () => {
    const style = resolveBrandStyle({ footerLinkColor: 'nope', headerStyle: undefined });
    expect(style.headerStyle).toBe('solid');
    expect(style.footerLinkColor).toBe('#1d4ed8');
    expect(style.footerBackground).toBe('#ffffff');
    expect(footerPalette(style).link).toEqual([29, 78, 216]);
  });

  it('keeps valid custom values', () => {
    const style = resolveBrandStyle({ headerStyle: 'wave', footerBackground: '#0f172a', footerTextColor: '#e2e8f0', footerLinkColor: '#38bdf8' });
    expect(style.headerStyle).toBe('wave');
    expect(footerPalette(style).background).toEqual([15, 23, 42]);
  });
});

describe('normalizeHexColor', () => {
  it('accepts 6 and 3 digit hex colours, with or without #', () => {
    expect(normalizeHexColor('#1E3A8A')).toBe('#1e3a8a');
    expect(normalizeHexColor('1e3a8a')).toBe('#1e3a8a');
    expect(normalizeHexColor('#abc')).toBe('#aabbcc');
  });

  it('rejects anything else', () => {
    expect(normalizeHexColor('')).toBeNull();
    expect(normalizeHexColor('red')).toBeNull();
    expect(normalizeHexColor('#12345')).toBeNull();
    expect(normalizeHexColor(null)).toBeNull();
  });
});

describe('hexToRgb', () => {
  it('splits a hex colour into channels', () => {
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0]);
  });
});

describe('brandPalette', () => {
  it('uses white header text on a dark brand colour', () => {
    const palette = brandPalette('#1e3a8a');
    expect(palette.fill).toEqual([30, 58, 138]);
    expect(palette.text).toEqual([255, 255, 255]);
  });

  it('switches to dark ink text on a light brand colour', () => {
    const palette = brandPalette('#fde047');
    expect(palette.text).toEqual([15, 23, 42]);
  });

  it('falls back to the default report colour for invalid input', () => {
    expect(brandPalette('not-a-colour').fill).toEqual(hexToRgb(DEFAULT_BRAND_COLOR));
    expect(brandPalette(undefined).fill).toEqual(hexToRgb(DEFAULT_BRAND_COLOR));
  });
});

describe('cleanBrandName / cleanBrandFooter', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanBrandName('  Acme   SEO  ')).toBe('Acme SEO');
    expect(cleanBrandFooter('  hello \n  acme.com ')).toBe('hello acme.com');
  });

  it('caps the length', () => {
    expect(cleanBrandFooter('x'.repeat(500))).toHaveLength(160);
    expect(cleanBrandName('y'.repeat(500))).toHaveLength(80);
  });
});

describe('validateLogoUpload', () => {
  it('accepts PNG and JPEG under the size limit', () => {
    expect(validateLogoUpload('image/png', 1024)).toBeNull();
    expect(validateLogoUpload('image/jpeg', LOGO_MAX_BYTES)).toBeNull();
  });

  it('rejects other formats and oversized files', () => {
    expect(validateLogoUpload('image/svg+xml', 1024)).toMatch(/PNG or JPEG/);
    expect(validateLogoUpload('image/png', LOGO_MAX_BYTES + 1)).toMatch(/smaller than/);
  });
});

describe('fitBox', () => {
  it('keeps the aspect ratio inside the box', () => {
    const box = fitBox(400, 100, 30, 18);
    expect(box.width).toBeCloseTo(30);
    expect(box.height).toBeCloseTo(7.5);
  });

  it('never upscales beyond the box on the other axis', () => {
    const box = fitBox(100, 400, 30, 18);
    expect(box.height).toBeCloseTo(18);
    expect(box.width).toBeCloseTo(4.5);
  });
});
