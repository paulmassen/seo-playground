export interface ReleaseInfo {
  version: string;
  url: string;
  notes: string;
  publishedAt: string | null;
}

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
};

/** Normalizes the SemVer tags used by GitHub releases, e.g. `v0.4.0`. */
export function normalizeVersion(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^v/i, '');
  return parseVersion(normalized) ? normalized : null;
}

function parseVersion(value: string): ParsedVersion | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

/**
 * Returns whether `candidate` is a newer stable version than `current`.
 * Pre-release builds deliberately never trigger the production update banner.
 */
export function hasNewerStableVersion(current: string | null | undefined, candidate: string | null | undefined): boolean {
  const parsedCurrent = current ? parseVersion(current.replace(/^v/i, '')) : null;
  const parsedCandidate = candidate ? parseVersion(candidate.replace(/^v/i, '')) : null;
  if (!parsedCurrent || !parsedCandidate || parsedCandidate.prerelease) return false;

  for (const key of ['major', 'minor', 'patch'] as const) {
    if (parsedCandidate[key] !== parsedCurrent[key]) return parsedCandidate[key] > parsedCurrent[key];
  }

  // A stable release supersedes a pre-release of the exact same version.
  return parsedCurrent.prerelease !== null;
}

/** The notice renders plain text, so release-note markup would otherwise show literally. */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_](\S(?:.*?\S)?)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .trim();
}

/** Keeps the in-app notice useful without turning it into a full changelog. */
export function releaseSummary(notes: string | null | undefined, limit = 240): string {
  if (!notes) return '';
  const firstMeaningfulLine = notes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => stripInlineMarkdown(line.replace(/^\s*(?:[-*]+|\d+\.)\s*/, '')))
    .find(Boolean) ?? '';
  return firstMeaningfulLine.length > limit
    ? `${firstMeaningfulLine.slice(0, limit - 1).trimEnd()}…`
    : firstMeaningfulLine;
}
