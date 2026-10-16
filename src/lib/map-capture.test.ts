import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAP_CAPTURE_FETCH_OPTIONS, OSM_REFERRER_POLICY } from './map-capture';

const srcDir = path.resolve(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const files = sourceFiles(srcDir).map((file) => ({ file: path.relative(srcDir, file), code: readFileSync(file, 'utf8') }));

describe('OpenStreetMap tile usage policy', () => {
  it('captures maps without cache-busting and with a Referer', () => {
    expect(MAP_CAPTURE_FETCH_OPTIONS.cacheBust).toBe(false);
    expect(MAP_CAPTURE_FETCH_OPTIONS.fetchRequestInit.referrerPolicy).toBe(OSM_REFERRER_POLICY);
    expect(OSM_REFERRER_POLICY).not.toMatch(/^(no-referrer|same-origin)$/);
  });

  it('sets a referrer policy on every OSM tile layer and Nominatim request', () => {
    const offenders: string[] = [];
    for (const { file, code } of files) {
      for (const match of code.matchAll(/tile\.openstreetmap\.org|nominatim\.openstreetmap\.org/g)) {
        // The option object follows the URL within a few lines.
        const window = code.slice(match.index, match.index + 500);
        if (!/referrerPolicy/.test(window)) offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never captures the DOM with cache-busting (it re-downloads every OSM tile)', () => {
    const offenders = files.filter(({ code }) => /cacheBust:\s*true/.test(code)).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
