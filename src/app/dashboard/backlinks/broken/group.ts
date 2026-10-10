// Shared by the server page (stats, exports) and the client table.

export interface BrokenLink {
  type?: string;
  domain_from?: string;
  url_from?: string;
  url_to?: string;
  /** 4xx/5xx for a broken link; null when DataForSEO hasn't crawled the target yet. */
  url_to_status_code?: number | null;
  domain_from_rank?: number;
  page_from_rank?: number;
  anchor?: string;
  image_url?: string;
  dofollow?: boolean;
  first_seen?: string;
  last_seen?: string;
}

export interface BrokenPage {
  url: string;
  statuses: number[];
  links: BrokenLink[];
  domains: number;
  dofollow: number;
  bestDr?: number;
}

/** One row per broken target page: the unit you fix (a 301 or restored page reclaims every link to it). */
export function groupByBrokenPage(links: BrokenLink[]): BrokenPage[] {
  const byUrl = new Map<string, BrokenLink[]>();
  for (const l of links) {
    const key = l.url_to ?? '';
    const arr = byUrl.get(key);
    if (arr) arr.push(l); else byUrl.set(key, [l]);
  }
  return [...byUrl.entries()]
    .map(([url, ls]) => {
      const ranks = ls.map((l) => l.domain_from_rank).filter((r): r is number => typeof r === 'number');
      return {
        url,
        statuses: [...new Set(ls.map((l) => l.url_to_status_code).filter((s): s is number => typeof s === 'number'))].sort(),
        links: [...ls].sort((a, b) => (b.domain_from_rank ?? -1) - (a.domain_from_rank ?? -1)),
        domains: new Set(ls.map((l) => l.domain_from).filter(Boolean)).size,
        dofollow: ls.filter((l) => l.dofollow).length,
        bestDr: ranks.length ? Math.max(...ranks) : undefined,
      };
    })
    .sort((a, b) => b.domains - a.domains || (b.bestDr ?? -1) - (a.bestDr ?? -1) || b.links.length - a.links.length);
}
