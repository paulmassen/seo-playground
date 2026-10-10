// White-label identity used by every generated PDF report.
// This module is client-safe (no database access): server code reads the stored
// values through brand-server.ts and passes them down as plain props.

export const DEFAULT_BRAND_NAME = 'SEO Playground';
export const DEFAULT_BRAND_COLOR = '#0f172a';
export const BRAND_FOOTER_MAX_LENGTH = 160;
export const BRAND_NAME_MAX_LENGTH = 80;
export const LOGO_MAX_BYTES = 256 * 1024;
export const LOGO_ACCEPTED_TYPES = ['image/png', 'image/jpeg'] as const;

export type Rgb = [number, number, number];

export type BrandPalette = {
  /** Background colour of the report header band. */
  fill: Rgb;
  /** Main text drawn over the header band. */
  text: Rgb;
  /** Secondary text drawn over the header band. */
  subtle: Rgb;
};

export const BRAND_HEADER_STYLES = ['solid', 'wave'] as const;
export type BrandHeaderStyle = (typeof BRAND_HEADER_STYLES)[number];
export const DEFAULT_BRAND_HEADER_STYLE: BrandHeaderStyle = 'solid';
export const DEFAULT_FOOTER_TEXT_COLOR = '#64748b';
export const DEFAULT_FOOTER_LINK_COLOR = '#1d4ed8';
export const DEFAULT_FOOTER_BACKGROUND = '#ffffff';

/** Visual options beyond the header colour and footer text. */
export type BrandStyle = {
  headerStyle: BrandHeaderStyle;
  footerTextColor: string;
  footerLinkColor: string;
  footerBackground: string;
};

export type BrandSettings = BrandStyle & {
  name: string;
  /** Data URL of the uploaded logo, or a remote URL set before uploads existed. */
  logo: string | null;
  color: string;
  footer: string;
};

/** Accepts #rgb or #rrggbb (the leading # is optional) and returns #rrggbb in lower case. */
export function normalizeHexColor(value: string | null | undefined): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((value ?? '').trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? match[1].split('').map((c) => c + c).join('') : match[1];
  return `#${digits.toLowerCase()}`;
}

export function hexToRgb(hex: string): Rgb {
  const value = parseInt(normalizeHexColor(hex)?.slice(1) ?? DEFAULT_BRAND_COLOR.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function linearChannel(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, between 0 (black) and 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

/**
 * Picks readable header text for the chosen brand colour: white on dark colours,
 * the report ink on light colours, whichever gives the higher WCAG contrast.
 */
export function brandPalette(color: string | null | undefined): BrandPalette {
  const hex = normalizeHexColor(color) ?? DEFAULT_BRAND_COLOR;
  const luminance = relativeLuminance(hex);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const inkLuminance = relativeLuminance(DEFAULT_BRAND_COLOR);
  const inkContrast = (luminance + 0.05) / (inkLuminance + 0.05);
  const fill = hexToRgb(hex);
  return whiteContrast >= inkContrast
    ? { fill, text: [255, 255, 255], subtle: [203, 213, 225] }
    : { fill, text: [15, 23, 42], subtle: [51, 65, 85] };
}

export function cleanBrandName(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, BRAND_NAME_MAX_LENGTH);
}

export function cleanBrandFooter(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, BRAND_FOOTER_MAX_LENGTH);
}

/** Returns an error message for an unacceptable logo upload, or null when it can be stored. */
export function validateLogoUpload(type: string, size: number): string | null {
  if (!(LOGO_ACCEPTED_TYPES as readonly string[]).includes(type)) return 'Logo must be a PNG or JPEG image.';
  if (size > LOGO_MAX_BYTES) return `Logo must be smaller than ${LOGO_MAX_BYTES / 1024} KB.`;
  return null;
}

/** Natural pixel size of an image data URL, or null when it cannot be decoded. Browser only. */
export function imageSize(dataUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve(image.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : null);
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

/** Scales a width/height pair to fit inside a box while keeping its aspect ratio. */
export function fitBox(width: number, height: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const ratio = Math.min(maxWidth / width, maxHeight / height);
  return { width: width * ratio, height: height * ratio };
}

/** Fills every visual option with a valid value, so callers can pass partial or missing styles. */
export function resolveBrandStyle(style?: Partial<BrandStyle> | null): BrandStyle {
  return {
    headerStyle: normalizeHeaderStyle(style?.headerStyle),
    footerTextColor: colorOr(style?.footerTextColor, DEFAULT_FOOTER_TEXT_COLOR),
    footerLinkColor: colorOr(style?.footerLinkColor, DEFAULT_FOOTER_LINK_COLOR),
    footerBackground: colorOr(style?.footerBackground, DEFAULT_FOOTER_BACKGROUND),
  };
}

export function normalizeHeaderStyle(value: string | null | undefined): BrandHeaderStyle {
  return (BRAND_HEADER_STYLES as readonly string[]).includes(value ?? '') ? (value as BrandHeaderStyle) : DEFAULT_BRAND_HEADER_STYLE;
}

/** Stored colour when valid, otherwise the fallback. */
export function colorOr(value: string | null | undefined, fallback: string): string {
  return normalizeHexColor(value) ?? fallback;
}

export function footerPalette(style: Pick<BrandStyle, 'footerTextColor' | 'footerLinkColor' | 'footerBackground'>): { text: Rgb; link: Rgb; background: Rgb } {
  return {
    text: hexToRgb(colorOr(style.footerTextColor, DEFAULT_FOOTER_TEXT_COLOR)),
    link: hexToRgb(colorOr(style.footerLinkColor, DEFAULT_FOOTER_LINK_COLOR)),
    background: hexToRgb(colorOr(style.footerBackground, DEFAULT_FOOTER_BACKGROUND)),
  };
}

export type FooterSegment = { text: string; href?: string };

// Matches full URLs, www. addresses, e-mail addresses and bare domains such as acme.com/seo.
const FOOTER_LINK_PATTERN = /https?:\/\/[^\s]*[^\s.,;:!?)]|www\.[^\s]*[^\s.,;:!?)]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|(?<![\w@/.-])(?:[a-z0-9-]+\.)+(?:com|net|org|io|fr|co|dev|app|ai|eu|de|uk|es|it|be|ch|ca|us)(?:\/[^\s]*[^\s.,;:!?)])?/gi;

function hrefFor(match: string): string {
  if (/^https?:\/\//i.test(match)) return match;
  if (/^[\w.+-]+@/.test(match)) return `mailto:${match}`;
  if (/^www\./i.test(match)) return `https://${match}`;
  return `https://${match}`;
}

/** Splits footer text into plain runs and links, so links can be coloured and made clickable. */
export function footerSegments(text: string): FooterSegment[] {
  const segments: FooterSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(FOOTER_LINK_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ text: text.slice(cursor, index) });
    segments.push({ text: match[0], href: hrefFor(match[0]) });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

/** Vertices of the header band, in millimetres from the top-left corner. The wave variant has a gently undulating lower edge. */
export function headerPolygon(width: number, height: number, style: BrandHeaderStyle, steps = 48): Array<[number, number]> {
  if (style !== 'wave') return [[0, 0], [width, 0], [width, height], [0, height]];
  const base = height - 3.5;
  const amplitude = 2.2;
  const edge = (x: number): number => base + amplitude * Math.sin((2 * Math.PI * 1.25 * x) / width);
  const points: Array<[number, number]> = [[0, 0], [width, 0]];
  // Walk the wave from right to left so the polygon closes back at the top-left corner.
  for (let i = steps; i >= 0; i -= 1) {
    const x = (width * i) / steps;
    points.push([x, edge(x)]);
  }
  return points;
}
