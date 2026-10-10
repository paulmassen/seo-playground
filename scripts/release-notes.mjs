import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Returns the body of the `## [X.Y.Z]` section of a Keep a Changelog file, or null.
 * The GitHub Release body comes from here: generated notes are empty on a repo that
 * ships without pull requests, and the in-app update notice reads this body.
 */
export function extractReleaseNotes(changelog, version) {
  const wanted = version.replace(/^v/i, '');
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => {
    const match = /^## \[([^\]]+)\]/.exec(line);
    return match?.[1] === wanted;
  });
  if (start === -1) return null;

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end))
    .join('\n')
    .replace(/\n-{3,}\s*$/, '')
    .trim();
  return body || null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tag = process.env.RELEASE_TAG ?? process.argv[2];
  if (!tag) {
    console.error('Usage: RELEASE_TAG=vX.Y.Z node scripts/release-notes.mjs');
    process.exit(1);
  }
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const notes = extractReleaseNotes(changelog, tag);
  if (!notes) {
    console.error(`CHANGELOG.md has no non-empty "## [${tag.replace(/^v/i, '')}]" section.`);
    process.exit(1);
  }
  process.stdout.write(`${notes}\n`);
}
