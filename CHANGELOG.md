# Changelog

All notable changes to SEO Playground are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- **AI Visibility page** (`/dashboard/ai-visibility`) — "My domain/brand" mode shows total LLM mentions, AI search volume, and a breakdown by platform/location/source domains/brand entities (`llm_mentions/target_metrics`); "Topic leaderboard" mode shows the top mentioned domains and top mentioned brands for a keyword topic side by side (`llm_mentions/top_mentioned_domains`, `top_mentioned_brands`). Both endpoints require `target` as an array even for a single item and don't accept location filters (location/language are output breakdowns, not inputs) — verified against the live API.
- **Sortable tables + "Copy as Markdown" across ~30 pages** — Backlinks and its 8 sub-pages, Competitors, Domain/Page Intersection, Domain Categories, Domain Technologies, Keyword Data/Difficulty/Overview/Ideas, Ranked/Related Keywords, Search Intent, Subdomains, Top Searches, Traffic Estimation, Rank Tracker, all 5 Site Audit tabs, AI Keyword Data. Each results table got a sibling client component with click-to-sort column headers, plus a new reusable `CopyMarkdownButton` next to CSV export.
- **Geo-Grid competitive analysis** — a "Competitive landscape" panel ranks the top 5 competing businesses seen across the grid by presence and a visibility score (same weighted formula as the target's ATO score, so directly comparable), with a "View on grid" toggle that re-colors the map to show that competitor's rank at every point instead of the target's. A new "Visibility by distance" panel breaks down rank and found-rate by concentric ring around the center point, showing how far the target's visibility actually reaches.
- **Geo-Grid cost & duration estimates** — the Live/Priority/Standard mode buttons in the search form show a live-updating estimated cost and expected duration based on grid size, from DataForSEO's current per-request pricing.
- **Geo-Grid pending panel** — shows elapsed time and an estimated time remaining (based on progress rate), alongside the existing points-ready progress bar.
- **Geo-Grid history** — entries now show the exact time a search was launched, not just the date.
- **AI Prompt Test** (`/dashboard/llm-responses`) — ask ChatGPT, Claude, Gemini, or Perplexity a live prompt and see the model's actual answer, cited sources, token usage, and cost, via DataForSEO's LLM Responses API. Platform/model cascading select, optional system message and web-search country targeting, history sidebar.
- **AI Keyword Data** (`/dashboard/ai-keyword-data`) — bulk keyword search volume estimates reflecting usage inside AI tools (ChatGPT, Gemini, etc.), with 12-month trend sparklines, via DataForSEO's AI Keyword Data API.
- **History sidebar** — Google Reviews and Geo-Grid history moved out of the page flow into a sticky right-hand sidebar with client-side pagination (8 entries per page). Reusable `HistorySidebar` component.
- **Reviews CSV export** — download button in the Reviews card exports *all* fetched reviews (Date, Rating, Author, Local guide, Author review count, Review, Owner response, Owner replied) as a UTF-8 (BOM) CSV.
- **Reviews-per-month chart** — native hover tooltip (month, year, count) via `<title>`, plus a month initial under every bar.

### Fixed
- **Location field silently failing on DataForSEO Labs / AI Optimization pages** (Related Keywords, Keyword Ideas, Keyword Overview, Ranked Keywords, Search Intent, Subdomains, Top Searches, Competitors, Domain/Page Intersection, Historical Rank, Domain Categories, Keyword Difficulty, Traffic Estimation, AI Keyword Data, AI Optimization) — these endpoints only ever support country-level targeting (verified against DataForSEO's own `locations_and_languages` reference endpoint, which returns the same ~94-country list regardless of endpoint); the location picker on those pages now only offers countries that actually work, instead of the full city/region dataset that silently failed a request.
- **Domain Categories showing raw numeric category codes** (e.g. `10008`) instead of names — added a `dfs_categories` reference table seeded from DataForSEO's `categories` endpoint and resolve each code to its full breadcrumb path (e.g. "Health > Health Conditions & Concerns").
- **Bulk Backlinks showing empty New/Lost/Ref. Domains/Ref. IPs/Spam columns** — `backlinks/bulk_backlinks/live` only ever returns `target` and `backlinks`; those columns could never populate. Removed them and linked to the dedicated Bulk Ref. Domains page instead.
- **Repeated DataForSEO billing on double-submit/refresh, across ~35 pages** — an identical search now reuses its cached result if it runs again within 60 seconds, instead of re-querying and re-billing every time (new shared `stableSearchId()` dedupe helper in `src/lib/dedupe.ts`). Applies to Keyword Ideas, Ranked/Related Keywords, Competitors, Domain/Page Intersection, Subdomains, Top Searches, Traffic Estimation, SERP Checker, Reddit, Domain Technologies/Whois, AI Prompt Test, Backlinks and its sub-pages, among others; intentionally not applied to task-based flows (Rank Tracker, Google Reviews, Site Audit) where each submission is a deliberate distinct action. Cleaned up 28 pre-existing duplicate history rows this gap had already caused.
- **Remaining French UI strings** fixed across Backlinks, Keyword Data, Keyword Difficulty, Ranked/Related Keywords, SERP Checker, Top Searches, and Competitors.
- **Geo-Grid Live mode returning mostly empty results** — DataForSEO's `local_finder/live/advanced` endpoint got substantially slower recently (~8-10s per request); the grid search fired every point concurrently with no throttling and silently discarded any timeout/error as "not found". Requests are now capped at 6 in-flight with one retry on failure, so a 9×9 grid that previously returned data for ~5% of points now completes fully.
- **Geo-Grid Priority queue mode was cosmetic** — selecting "Priority" never actually requested DataForSEO's high-priority processing (no `priority` field was sent), so it silently ran and billed as Standard while showing the wrong price/ETA. Wired the real `priority` field (`2` for Priority, `1` for Standard) — Priority now genuinely costs more ($0.0012/req) and completes faster (~1 min).
- **Geo-Grid Queue mode indicator broken** — the pending-search panel's mode badge, wait-time hint, and poll interval all silently resolved to `undefined` because the run-mode selector's values didn't match the type they were read against, which also caused the poll timer to fire in a near-continuous loop instead of every 10–30s.
- **Geo-Grid Queue mode cost tracking** — a search's final cost could be undercounted (often reported as $0.00) because completed points were re-queried on every poll, and DataForSEO only reports a task's cost on its first successful check. Points are now accumulated incrementally and never re-queried once collected.
- **Rating gauge** — average value now renders as an HTML overlay instead of SVG `<text>`, fixing the number being invisible in WebKit when the `font-weight:900` web font wasn't loaded; also fixes the clipped "N reviews" line.
- **Rating goal** — targets are now display-aware: counts reflect crossing Google's rounding threshold (`T − 0.05`, with `.x5` rounding down) so reaching a *displayed* rating no longer overstates the 5★ reviews needed. Shows both true average and Google-displayed rating.
- **Build** — escaped unescaped entities (`technologies`, `reddit` pages) and removed an unused `eslint-disable` directive (`MapPicker`) that were failing `next build`.

---

## [0.3.0] — 2026-05-31

### Added
- **Smoke test** (`node scripts/smoke-test.mjs`) — calls every live DataForSEO endpoint with `limit:1`, validates response field paths, reports PASS / SKIP / WARN. Cost: ~$0.17 per run.
- **Scroll-to-results** — clicking a history item now smoothly scrolls to the results section (`#results` anchor on all 33 pages).
- **Update banner** — notifies users when a new version is available on GitHub (compares local git SHA with latest commit).
- **Next.js dev indicator removed** — `devIndicators: false` in `next.config.ts`.

### Fixed
- **Dark mode** — Settings page fully reworked (inputs, form container, balance card, status badge, danger zone). Button glows (`shadow-blue-200`, `shadow-slate-200`) hidden in dark mode with `dark:shadow-none` across all pages.
- **Keyword Ideas** — wrong field paths corrected: `keyword_properties.keyword_difficulty`, top-level `keyword_info`, `search_intent_info` (no `keyword_data` wrapper). Request field fixed to `keywords: [string]` (array).
- **Search Intent** — intent label is `keyword_intent.label`, secondary intents are `secondary_keyword_intents[].label`.
- **Subdomains** — `traffic` and `keywords` fields moved to `metrics.organic.etv` and `metrics.organic.count`. Removed unsupported `order_by` parameter.
- **Domain Categories** — response structure corrected to `{ categories: number[], metrics: { organic: {} } }`.
- **Bulk Keyword Difficulty** — result extraction fixed to `result[0].items` instead of `task.result`.
- **Traffic Estimation** — removed non-existent position columns (`pos_1`, `pos_2_3`, etc.), replaced with Paid KWs column.
- **Local Finder** — grid search removed from this page (moved exclusively to Geo-Grid Ranking).

### Changed
- **Geo-Grid Ranking** now lives on its own dedicated page (`/dashboard/geo-grid`).
- **Local Finder** simplified to plain local pack results with map-based coordinate picker.
- All UI text enforced in English throughout.

---

## [0.2.0] — 2026-05-30

### Added
- **DataForSEO Labs** — Keyword Ideas, Search Intent, Page Intersection, Subdomains, Traffic Estimation.
- **Domain Analytics** — Categories page.
- **OnPage** — Site Audit tabs: Links, Resources, Duplicate Tags, Non-Indexable. Content Parsing standalone page.
- **Backlinks** — Referring Networks, Page Intersection, Domain Intersection, History (sparkline charts), Bulk Backlinks, Bulk Referring Domains.
- **Geo-Grid Ranking** — local visibility heatmap across a configurable grid (3×3 to 11×11). Three queue modes: Live (~6 s), Priority (~1 min, 40% cheaper), Standard (background, 70% cheaper). Auto-polling, local history.
- **Docker** — `Dockerfile`, `.dockerignore`, `docker-compose.yml` with persistent SQLite volume.
- **Auto-refresh** — Site Audit page polls automatically while a crawl is in progress.

### Fixed
- **Site Audit stuck** — two bugs resolved: `INSERT OR REPLACE` wiping `summary`/`pages` columns after save; invalid `order_by` parameter on `on_page/pages` causing every crawl to silently fail.
- **Microdata "page not submitted"** — URL mismatch due to redirect normalization; actual crawled URL now fetched from `on_page/pages` first.
- **Microdata `field.value.join is not a function`** — DataForSEO returns `value`/`types` as strings in some responses; `Array.isArray()` guards added.

### Changed
- **UI redesign** — sidebar overhaul: blue active state, readable labels, section grouping. Header simplified. Smooth scroll and focus rings added globally.
- All French text replaced with English throughout the UI.

---

## [0.1.0] — 2026-04-12

### Added
- Initial release.
- **Rank Tracker** — keyword position tracking over time with history.
- **SERP Checker** — live Google organic results with target domain highlighting.
- **Ranked Keywords** — keywords a domain ranks for via DataForSEO Labs.
- **Keyword Overview** — volume, CPC, competition for a list of keywords.
- **Keyword Data** — Google Ads & Bing keyword research.
- **Keyword Difficulty** — bulk difficulty scores via DataForSEO Labs.
- **Related Keywords** — keyword suggestions from a seed.
- **Competitors** — competing domains in the SERPs.
- **Domain Intersection** — shared keywords between two domains.
- **Historical Rank** — ranking history overview for a domain.
- **Backlinks** — backlink list, referring domains, anchors.
- **Local Finder** — Google local pack results with map-based coordinate picker.
- **On-Page Instant Pages** — instant single-page audit via DataForSEO live endpoint.
- **On-Page Site Audit** — full site crawl with async task polling.
- **Microdata Analysis** — structured data inspection for any crawled URL.
- **AI Optimization** — visibility in AI-generated answers.
- **Google Reviews** — async task flow, rating distribution, monthly chart, rating goal calculator.
- **Reddit Mentions** — Reddit threads linking to or discussing a URL.
- **Top Searches** — local search trends.
- **Domain Analytics** — Technologies, Whois.
- **Settings** — DataForSEO credentials, default location/language/domain/coordinates stored in local SQLite.
- SQLite-backed search history — every result cached locally, no repeat API calls for past searches.

[Unreleased]: https://github.com/paulmassen/seo-playground/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/paulmassen/seo-playground/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/paulmassen/seo-playground/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/paulmassen/seo-playground/releases/tag/v0.1.0
