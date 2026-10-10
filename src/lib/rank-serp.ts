export interface RankSerpItem {
  type: string;
  rank_group?: number;
  rank_absolute?: number;
  url?: string;
  title?: string;
  domain?: string;
  references?: Array<{ domain?: string; url?: string }> | null;
  items?: Array<{ references?: Array<{ domain?: string; url?: string }> | null }> | null;
}

/** One organic result of a SERP's first page, kept so a position change can be traced to who moved. */
export interface RankTopResult {
  position: number;
  domain: string;
  url: string;
  title: string | null;
}

export interface RankSerpMatch {
  position: number | null;
  url: string | null;
  title: string | null;
  /** Whether Google's AI Overview cites the domain; null when the SERP had no AI Overview. */
  aiOverview: boolean | null;
  /** Organic results ranked 1-10 for this check; null when the SERP returned none. */
  topResults: RankTopResult[] | null;
}

/** Host of a tracked domain or SERP URL, without scheme, "www." or path. */
export function rankHost(value: string): string {
  return value.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

/**
 * Stops the crawl at the first results page that lists the domain, so a check is billed
 * for the pages up to the match instead of the full depth.
 */
export function stopCrawlOnMatch(domain: string) {
  return [{ match_type: 'with_subdomains', match_value: rankHost(domain) }];
}

/** The first ten organic results; the first results page is always crawled, even when the match is found later. */
export function extractTopResults(items: RankSerpItem[]): RankTopResult[] | null {
  const top = items
    .filter((item) => item.type === 'organic' && (item.rank_group ?? item.rank_absolute ?? 0) >= 1 && (item.rank_group ?? item.rank_absolute ?? 99) <= 10)
    .map((item) => ({
      position: (item.rank_group ?? item.rank_absolute) as number,
      domain: rankHost(item.domain ?? item.url ?? ''),
      url: item.url ?? '',
      title: item.title ?? null,
    }))
    .filter((result) => result.domain !== '')
    .sort((a, b) => a.position - b.position);
  return top.length > 0 ? top : null;
}

/** Finds the tracked domain in an Advanced SERP: its organic position and any AI Overview citation. */
export function matchRankSerp(items: RankSerpItem[], trackedDomain: string): RankSerpMatch {
  const domain = rankHost(trackedDomain);
  const matches = (value: string | undefined) => {
    const host = rankHost(value ?? '');
    return host === domain || host.endsWith(`.${domain}`);
  };

  const hit = items.find((item) => item.type === 'organic' && matches(item.domain ?? item.url));
  const overviews = items.filter((item) => item.type === 'ai_overview');
  const cited = overviews.some((overview) => [
    ...(overview.references ?? []),
    ...(overview.items ?? []).flatMap((element) => element.references ?? []),
  ].some((reference) => matches(reference.domain ?? reference.url)));

  return {
    // rank_group is the organic position; rank_absolute includes maps, ads and other SERP modules.
    position: hit?.rank_group ?? hit?.rank_absolute ?? null,
    url: hit?.url ?? null,
    title: hit?.title ?? null,
    aiOverview: overviews.length > 0 ? cited : null,
    topResults: extractTopResults(items),
  };
}

export interface TopResultChange extends RankTopResult {
  /** Previous best position of the domain in the top 10, or null when it was not there (new entry). */
  previousPosition: number | null;
}

export interface TopResultsDiff {
  rows: TopResultChange[];
  /** Domains that were in the previous top 10 and are gone, with the position they held. */
  dropped: Array<{ domain: string; position: number }>;
}

/** Compares two top 10 lists by domain, so a competitor swapping pages does not read as an exit and an entry. */
export function diffTopResults(current: RankTopResult[], previous: RankTopResult[] | null): TopResultsDiff {
  if (!previous) return { rows: current.map((result) => ({ ...result, previousPosition: null })), dropped: [] };
  const previousBest = new Map<string, number>();
  for (const result of previous) {
    const known = previousBest.get(result.domain);
    if (known === undefined || result.position < known) previousBest.set(result.domain, result.position);
  }
  const currentDomains = new Set(current.map((result) => result.domain));
  return {
    rows: current.map((result) => ({ ...result, previousPosition: previousBest.get(result.domain) ?? null })),
    dropped: [...previousBest].filter(([domain]) => !currentDomains.has(domain)).map(([domain, position]) => ({ domain, position })).sort((a, b) => a.position - b.position),
  };
}
