/**
 * Plain-language definitions of the DataForSEO metrics shown in table headers and stat cards.
 * Shown as hover tooltips (native `title`), so keep each one to a sentence or two.
 */
export const METRIC_HINTS = {
  // ---- Traffic ----
  etv: 'Estimated Traffic Volume: organic visits per month. Sum over every ranking keyword of monthly search volume × expected click-through rate at its position. A model, not measured traffic.',
  paidEtv: 'Estimated paid visits per month from Google Ads, computed like the organic ETV.',
  trafficValue: 'Monthly cost of buying the same traffic with Google Ads (ETV × CPC of each keyword), in USD.',
  rankedKeywords: 'Keywords this domain ranks for in the organic top 100, for the selected location and language.',
  paidKeywords: 'Keywords this domain shows Google Ads for. 0 = no ads detected.',
  top3: 'Keywords ranking in positions 1 to 3.',

  // ---- Keywords ----
  volume: 'Average monthly Google searches over the last 12 months, for the selected location and language.',
  aiVolume: 'Estimated monthly volume of this query in AI assistants (ChatGPT, Gemini…), modelled by DataForSEO.',
  kd: 'Keyword difficulty, 0–100: how hard it is to reach the top 10, based on the backlink profiles of the pages ranking now. Under 30 = easy, 70+ = very hard.',
  cpc: 'Average cost per click advertisers pay on Google Ads for this keyword, in USD.',
  competitionLevel: 'Google Ads competition: how many advertisers bid on this keyword (LOW / MEDIUM / HIGH). Says nothing about organic difficulty.',
  competitionIndex: 'Google Ads competition index, 0–100: share of ad slots filled compared with all keywords. Paid competition, not organic difficulty.',
  bidLow: 'Low end (20th percentile) of the Google Ads bid paid to appear at the top of the page, in USD.',
  bidHigh: 'High end (80th percentile) of the Google Ads bid paid to appear at the top of the page, in USD.',
  intent: 'Main search intent: informational (learn), navigational (find a site), commercial (compare), transactional (buy).',
  refDomainsAvg: 'Average number of referring domains of the pages in the top 10. A rough idea of the links needed to compete.',
  serpResults: 'Number of results Google reports for this query.',
  relatedCount: 'Number of related keywords DataForSEO found for this one ("searches related to").',
  position: 'Organic position in Google, ads and SERP features (maps, videos…) not counted. 1 = first result.',
  positionAbsolute: 'Absolute position in Google, counting every SERP element (ads, maps, featured snippet…).',
  rankTrend: 'Change since the previous check. Up = better position.',
  rankChange: 'Positions gained (▲) or lost (▼) since DataForSEO\'s previous check of this SERP, usually a few weeks earlier. Based on absolute positions.',
  keywordEtv: 'Estimated monthly visits this keyword brings at its current position: search volume × expected click-through rate.',
  subdomainShare: 'Share of the root domain\'s organic traffic (ETV) that goes to this subdomain, among the subdomains loaded.',
  commonKeywords: 'Keywords both your domain and this competitor rank for.',
  avgPosition: 'Average position of the competitor on the shared keywords. Lower is better.',
  competitorTraffic: 'Estimated organic visits per month (ETV) the competitor gets from the shared keywords only, not its whole site.',
  competitorSiteTraffic: 'Estimated organic visits per month (ETV) of the competitor\'s whole site, all keywords included.',
  competitorWins: 'On the shared keywords: how many the competitor ranks top 10 for (red) against how many you rank top 10 for (green). Sorting puts the competitors that outrank you most first.',
  gapKeywords: 'Keywords Domain 1 ranks for in the top 100 while Domain 2 does not rank at all: content ideas to win back.',
  positionGap: 'Domain 2 position minus Domain 1 position on the same keyword. Positive = Domain 1 ranks higher.',
  totalKeywords: 'All keywords the competitor ranks for, not only the shared ones.',
  mentionsFanOut: 'Number of AI answers in which this fan-out query was generated.',
  mentionsAi: 'Number of AI answers that mention this domain or brand.',

  // ---- Backlinks ----
  dr: 'Domain rank of the linking domain, 0–100: DataForSEO\'s authority score based on its backlinks (comparable to Ahrefs DR or Moz DA). 40+ = solid, 70+ = strong.',
  pr: 'Page rank of the linking page, 0–100: DataForSEO\'s authority score based on the links pointing to that page.',
  domainRank: 'DataForSEO domain rank, 0–100: an authority score based on the backlink profile. 40+ = solid, 70+ = strong.',
  spam: 'Spam score of the linking page, 0–100. High = likely spam, a link farm or a PBN.',
  backlinks: 'Total links pointing to the target, counting each link on each page.',
  refDomains: 'Number of unique domains linking to the target. Usually more telling than the raw link count.',
  refMainDomains: 'Referring domains with subdomains merged into their root domain (blog.x.com and x.com count once).',
  refIps: 'Number of unique IP addresses of the linking sites. Many domains on few IPs can be a sign of a link network.',
  refDomainsNofollow: 'Referring domains whose links are all nofollow (they pass little or no SEO value).',
  brokenBacklinks: 'Links pointing to pages of the target that answer with a 4xx/5xx error. Worth redirecting.',
  dofollow: 'Share of links without a nofollow/sponsored/ugc attribute, the ones that pass SEO value.',
  networkIps: 'Number of IP addresses in this network (subnet) hosting linking sites.',
  firstSeen: 'Date DataForSEO\'s crawler first found the link.',
  newLost: 'Links (or domains) found or lost during the period.',

  // ---- On-page ----
  onpageScore: 'DataForSEO on-page score, 0–100: technical health of the page from the checks run. 100 = no issue found.',
  loadTime: 'Time to fully load the page, in milliseconds.',
  resourceLoad: 'Time to download the resource, in milliseconds.',
  density: 'Share of the page\'s words that are this keyword. Above about 3 % may look like keyword stuffing.',
  frequency: 'Number of times the keyword appears in the page text.',
  emphasized: 'Times the keyword appears in emphasized text (bold, italic, headings).',
} as const;

export type MetricHintKey = keyof typeof METRIC_HINTS;
