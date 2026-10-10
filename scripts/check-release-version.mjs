import { readFileSync } from 'node:fs';
import { extractReleaseNotes } from './release-notes.mjs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');

const tag = process.env.RELEASE_TAG;
const expected = `v${packageJson.version}`;

if (!tag) {
  console.error('RELEASE_TAG is required (for example: v0.4.0).');
  process.exit(1);
}

if (tag !== expected) {
  console.error(`Release tag ${tag} does not match package.json version ${expected}.`);
  process.exit(1);
}

// The Compose file is attached to the release and is what `releases/latest/download` installs.
const compose = readFileSync(new URL('../docker-compose.production.yml', import.meta.url), 'utf8');
const pinned = [...compose.matchAll(/\$\{SEO_PLAYGROUND_VERSION:-([^}]+)\}/g)].map((m) => m[1]);
if (!pinned.length || pinned.some((version) => version !== packageJson.version)) {
  console.error(`docker-compose.production.yml must default SEO_PLAYGROUND_VERSION to ${packageJson.version} (found: ${pinned.join(', ') || 'none'}).`);
  process.exit(1);
}

if (!extractReleaseNotes(changelog, tag)) {
  console.error(`CHANGELOG.md has no non-empty "## [${packageJson.version}]" section; it becomes the GitHub Release notes.`);
  process.exit(1);
}

console.log(`Release version verified: ${tag}`);
