import { NextResponse } from 'next/server';
import { hasNewerStableVersion, normalizeVersion, releaseSummary } from '@/lib/release';

const GITHUB_REPO = 'paulmassen/seo-playground';
const LATEST_RELEASE_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const CHECK_INTERVAL_SECONDS = 60 * 60 * 12;

// Next.js requires the exported route config to be statically analyzable.
export const revalidate = 43200;

type GitHubRelease = {
  tag_name: string;
  html_url: string;
  body: string | null;
  published_at: string | null;
  prerelease: boolean;
  draft: boolean;
};

export async function GET() {
  const current = normalizeVersion(process.env.APP_VERSION ?? process.env.NEXT_PUBLIC_APP_VERSION);

  // Platforms that ship their own updates (e.g. the Cloudron package) turn the in-app notice off.
  if (process.env.UPDATE_CHECK_DISABLED?.trim().toLowerCase() === 'true') {
    return NextResponse.json({ current, latest: null, hasUpdate: false });
  }

  try {
    const res = await fetch(
      LATEST_RELEASE_URL,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        next: { revalidate: CHECK_INTERVAL_SECONDS },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ current, latest: null, hasUpdate: false });
    }

    const data = await res.json() as GitHubRelease;
    const latest = normalizeVersion(data.tag_name);
    const hasUpdate = !data.draft && !data.prerelease && hasNewerStableVersion(current, latest);

    return NextResponse.json({
      current,
      latest,
      hasUpdate,
      release: latest ? {
        version: latest,
        url: data.html_url,
        notes: releaseSummary(data.body),
        publishedAt: data.published_at,
      } : null,
    });
  } catch {
    return NextResponse.json({ current, latest: null, hasUpdate: false });
  }
}
