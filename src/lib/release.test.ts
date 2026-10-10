import { describe, expect, it } from 'vitest';
import { hasNewerStableVersion, normalizeVersion, releaseSummary } from './release';
import { extractReleaseNotes } from '../../scripts/release-notes.mjs';

describe('release version checks', () => {
  it('normalizes release tags but rejects non-SemVer values', () => {
    expect(normalizeVersion(' v1.2.3 ')).toBe('1.2.3');
    expect(normalizeVersion('main')).toBeNull();
    expect(normalizeVersion('1.2')).toBeNull();
  });

  it('only reports newer stable releases', () => {
    expect(hasNewerStableVersion('0.4.0', '0.4.1')).toBe(true);
    expect(hasNewerStableVersion('0.4.0', '1.0.0')).toBe(true);
    expect(hasNewerStableVersion('0.4.1', '0.4.0')).toBe(false);
    expect(hasNewerStableVersion('0.4.0', '0.5.0-beta.1')).toBe(false);
    expect(hasNewerStableVersion('0.5.0-beta.1', '0.5.0')).toBe(true);
  });

  it('turns release notes into one compact, safe summary', () => {
    expect(releaseSummary('## Added\n- Faster reports\n- Other change')).toBe('Faster reports');
    expect(releaseSummary('- Faster reports\n- Other change')).toBe('Faster reports');
  });

  it('strips inline markdown the plain-text notice cannot render', () => {
    expect(releaseSummary('### Added\n- **Projects** — see [docs](https://x.y) and `npm run launch`'))
      .toBe('Projects — see docs and npm run launch');
    expect(releaseSummary('- *Faster* reports, kept llm_mentions/search_live intact'))
      .toBe('Faster reports, kept llm_mentions/search_live intact');
  });
});

describe('extractReleaseNotes', () => {
  const changelog = [
    '# Changelog', '', '## [Unreleased]', '', '- Next', '',
    '## [0.4.0] — 2026-09-28', '', '### Added', '- Projects', '', '---', '',
    '## [0.3.0] — 2026-05-31', '', '- Old',
  ].join('\n');

  it('returns only the requested version section, without the trailing rule', () => {
    expect(extractReleaseNotes(changelog, 'v0.4.0')).toBe('### Added\n- Projects');
    expect(extractReleaseNotes(changelog, '0.3.0')).toBe('- Old');
  });

  it('returns null for a missing or empty section', () => {
    expect(extractReleaseNotes(changelog, 'v9.9.9')).toBeNull();
    expect(extractReleaseNotes('## [1.0.0]\n\n## [0.9.0]\n- x', '1.0.0')).toBeNull();
  });
});
