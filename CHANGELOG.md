# Changelog

All notable changes to SEO Playground are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [0.6.0] — 2026-10-10

### Added
- **Broken Backlinks** (`/dashboard/backlinks/broken`) — lists the live backlinks of a domain or page that point to URLs answering 4xx or 5xx (DataForSEO's `is_broken` filter on `backlinks/backlinks/live`), optionally dofollow only, up to 1,000 links. "By broken page" groups the links by dead URL with its status code, referring domains, links, dofollow count and best DR, sorted by referring domains: the order to 301-redirect or restore those pages. "All links" shows every link in a sortable table. Run it on a competitor to find broken link building opportunities. Includes CSV export, Markdown copy and history, and the cost appears in Spending. The "Broken backlinks" card on the Backlinks page links to it.
- **Sidebar favorites** — hover a tool in the sidebar and click its star to pin it to a Favorites group at the top of the menu; drag to reorder, click the star again to remove it. "Collapse all" folds every group except Favorites, so the menu can be reduced to the tools you use. Favorites are stored in a cookie, shared across projects, and rendered by the server without a flash.
- **Geo-grid display settings** — Settings → "Geo-grid" lets you pick the distance unit (kilometres or miles) and the map pin style (squares, circles or small dots). Miles change the spacing choices (0.25 to 5 mi), the grid preview, the monitor list, "Visibility by distance" and the PDF report; grids are still stored in km, so existing monitors keep their exact grid and series. Circles and small dots leave more of the map visible; the #1 rank keeps its star in every style, and the PDF map mirrors the chosen style.
- **Review Velocity** (`/dashboard/review-velocity`, Business section) — benchmarks how fast a Google listing gains reviews against its local competitors. Enter a business keyword, set the area on the map, find the listings (Google Maps), pick up to 10 and mark yours; the maximum cost is shown before you start. The last 3 full months of reviews are fetched for each listing (the 100 newest, plus one automatic deeper fetch for listings that get more). **Overview** charts new reviews per week; **Report** ranks the listings on review pace, momentum, regularity, recent rating, owner reply rate (also on negative reviews), total reviews and Google Maps position, with an overall score and an automatic summary; **Data** shows the listings and their fetches. The report exports to PDF (with your white-label branding) and Excel, and "Refresh now" fetches again. Costs appear in Spending.

### Changed
- **Paid API endpoints only answer POST** — `/api/business-search` (Google Maps business search, billed per search) and the Geo-grid worker's `/api/cron/geo-grid` now reject GET, so a link, a prefetch or an image tag can no longer spend DataForSEO credit. The map search and the bundled worker already use POST; only custom scripts calling these endpoints with GET need updating.
- **Formula-safe CSV exports** — every CSV export (tables, Google Reviews) now goes through one serializer that neutralizes cells starting with `=`, `+`, `-` or `@`, so a review or a page title cannot run as a spreadsheet formula when the file is opened in Excel or Sheets.
- **Geo-grid worker secret** — new Docker Compose installs create `/data/.geo-grid-worker-secret` readable by its owner only (`600`), owned by the user the app runs as.

### Fixed
- **Rank Tracker double billing** — overlapping runs (a manual Queue during the daily schedule, two open tabs) could submit the same keyword twice. A keyword is now reserved in the database before its task is posted, so only one check per keyword can be pending. A submission whose outcome is unknown (timeout, network error) is recorded as failed instead of being retried automatically, since DataForSEO may already have billed it. Duplicate pending checks left by earlier versions are cleared at startup (the oldest is kept). Pending checks are no longer capped at 500 when polling.
- **DataForSEO errors no longer look like empty results** — Rank Tracker submissions and Geo-grid progress now tell an account-level error (for example an insufficient balance) or a failed task apart from a task still in progress. Requests to DataForSEO and the worker's calls have bounded timeouts.
- **PDF star ratings** — "★" no longer prints as "?" in PDF reports; it reads "stars".
- **Referring Domains** no longer fails with `Invalid Field: 'order_by'` ([#12](https://github.com/paulmassen/seo-playground/issues/12)). The page sorted on `domain_from_rank` and filtered on `dofollow`, two fields that `backlinks/referring_domains/live` does not have. It now sorts on `rank`, and the DR column, CSV export and history read that rank. Nofollow referring domains are now listed too, since the endpoint cannot filter them out.

---

## [0.5.0] — 2026-10-09

### Added
- **Cloudron package** — SEO Playground can be installed as a Cloudron community app (`CloudronManifest.json`, `Dockerfile.cloudron`, `cloudron/`). Cloudron's login sits in front of the app and Cloudron delivers updates; set `UPDATE_CHECK_DISABLED=true` to turn off the in-app update notice on any platform that ships its own updates.
- **Optional email + password login** — set `AUTH_ENABLED=true` to protect the dashboard and every `/api` route (Better Auth, SQLite). The first visit creates the only account at `/setup`, then registration closes. Accounts live in a separate `seo-playground.db.auth` file; the Geo-grid worker's `/api/cron` endpoint keeps its own secret. Off by default, so existing installs are unchanged. See README → Login.
- **Geo-grid business search** — the map search now looks businesses up on Google Maps (about $0.002 per search, biased to the area shown on the map and to the form's language). Picking a listing centers the grid on it and sets the target to that exact listing (its CID). Plain addresses still fall back to OpenStreetMap, ignoring suite/unit numbers.
- **Geo-grid: delete a monitor** — a Delete button on each monitor removes all of its snapshots and its schedule.
- **White-label reports** — Settings → "White-label reports" lets you brand every PDF export as your own: brand name, an uploaded PNG/JPEG logo (256 KB max, shown with its aspect ratio preserved), a report colour for the header, and a header style (straight or wavy bar). The footer has its own text, background colour, text colour and link colour; e-mail addresses and domains in the footer become clickable links. A live preview shows the header and footer while you edit. The settings apply to Site Audit, Google Reviews, AI Visibility, Geo-grid and Prompt Tracker reports. Blank fields keep the SEO Playground defaults.
- **Prompt Tracker** (`/dashboard/prompt-tracker`) — save a prompt with the brand and/or domain to look for, then re-run it on demand ("Check now" / "Check all now") or every day (optional schedule, run by the existing cron worker). Each check stores the answer, cited sources and cost, and the prompt shows whether the brand or domain was mentioned plus its overall mention rate. Checks are billed like AI Prompt Test runs and appear in Spending.
- **AI Prompt Test model list** — the model suggestions now match everything DataForSEO's LLM Responses models endpoint returns (ChatGPT 49, Claude 16, Gemini 12, Perplexity 3, including the newest GPT-5.6, Claude Sonnet/Opus 5 and Gemini 3.x releases). The default model per platform is set explicitly.
- **Rank Tracker AI Overview citations** — a keyword shows an "AI" badge when Google's AI Overview cites the tracked domain, even if the domain has no organic position. Checks now read DataForSEO's Advanced SERP format.
- **Rank Tracker top 10** — every check now saves the first page of organic results at no extra cost. Expanding a keyword lists the top 10 for any of the last 30 checks, with moves versus the previous check, new entries and the domains that left the top 10. Checks recorded before this release have no top 10.

### Fixed
- **Project isolation** — a search, check or settings change now always saves to the project it started in, even if the selected project changes (for example from another tab) while DataForSEO is still answering. A request still running when its project is deleted fails with "Project not found." instead of recreating the deleted project's database.
- **Maps behind strict proxies** — OpenStreetMap tiles and address search now always send a Referer, as OSM's usage policy requires, so maps no longer get blocked behind proxies that send `Referrer-Policy: same-origin` (such as Cloudron's).
- **Geo-grid target matching** — a picked Google listing matches on its CID only; a domain target matches whatever the protocol or `www.` (`https://example.com` no longer misses `www.example.com`), and a path in the target must appear in the listing URL.
- **Geo-grid PDF** — the competitive landscape table only lists the rows that fit above the footer, so a long competitor list no longer runs off the page. Logos in PDF headers keep their proportions instead of being stretched.
- **Rank Tracker** — "Add & Check" is now "Add": keywords appear in the list immediately instead of after every check had finished. Run the check afterwards with Queue or ↻. In dark mode the Queue and Add buttons no longer show a light glow while pending.
- **Site Audit** — the Pages table shows the word count again, and the Keyword Density, Duplicate Tags and Non-indexable tabs no longer fail with `Invalid Field` errors (`order_by`, `type`, `filters`). Non-indexable pages now come from DataForSEO's dedicated endpoint and list the reason each page is excluded.

### Changed
- **Node launches listen on `127.0.0.1` by default** — `npm run dev`, `npm start` and `npm run launch` no longer listen on every interface. Export `SEO_PLAYGROUND_BIND=0.0.0.0` before launching to expose the server deliberately, after enabling login or an authenticated reverse proxy. `HOSTNAME` no longer overrides this. Docker images are unchanged.
- **Security updates** — Next.js 15.5.27 (fixes middleware bypass, Server Actions and denial-of-service advisories) and jsPDF 4.2.1 (fixes PDF injection and path traversal). A new test renders the shared PDF helpers with the installed jsPDF.
- **Prompt Tracker PDFs** — the overview export now lists only the latest result of each prompt, as a card with a cited / not cited / error marker and the date of the check. The single-prompt export shows the latest result, a colour-coded weekly calendar of mentions and one marked card per check. Long prompts no longer run off the page, and "·" no longer prints as "?" in PDFs.
- **Cheaper Rank Tracker checks** — a check now stops crawling at the results page where the domain is found (`stop_crawl_on_match`), so it is billed for those pages instead of the full depth. The recorded cost is the amount DataForSEO reports once the task completes.
- **Rank Tracker "Not found"** — a check that does not find the domain now reads "Not found" with the last known position and its date, instead of a bare dash.
- **Project switcher** — switching projects now keeps you on the current page (for example Rank Tracker) instead of returning to the dashboard home.

---

## [0.4.0] — 2026-09-28

### Added
- **Multi-project workspace** — create one project per client or site and switch between them from the top bar (with the site's favicon). Each project has its own domain, default location/language/coordinates, Rank Tracker depth, search history, results and schedules, stored in its own SQLite file. DataForSEO credentials stay global. A new Projects page creates, edits and deletes projects.
- **Scheduled Geo-grid and Rank Tracker checks** — Geo-grid monitors can run daily or weekly, and Rank Tracker can re-check every keyword daily, at a chosen time in the browser's timezone (DST-aware). A lightweight background worker (`scripts/geo-grid-worker.mjs`) starts due runs and collects finished DataForSEO queue tasks with no browser tab open. `npm run dev`, `npm start`, `npm run launch` and both Compose files start it alongside the web app, with an automatically generated internal secret. Due schedules are claimed atomically, so overlapping checks can't start a run twice.
- **Rank Tracker Standard queue** — the Check buttons and daily schedules post up to 100 keywords per request to the cheaper Standard queue, with a status panel for queued checks. Newly added keywords are still checked immediately with the Live endpoint.
- **Geo-grid monitoring** — a timeline of snapshots per keyword/location monitor, a point-by-point comparison map between two snapshots, an average-position trend, and a grid analysis panel.
- **Task center** — queued Geo-grid runs stay visible, with their progress, from anywhere in the dashboard; the top bar keeps collecting them after you leave the Geo-grid page.
- **PDF and Excel exports** — branded PDF reports for Site Audit, Google Reviews, AI Visibility and Geo-grid, plus Excel exports for Site Audit and AI Visibility.
- **AI Visibility targeting** — "My domain/brand" and "Topic leaderboard" now accept a location and language (Google AI only; ChatGPT stays United States/English), and numeric DataForSEO location codes in the results are shown as country names.
- **Historical Rank: position distribution chart** — month-by-month split of ranking keywords by position bucket (#1, 2–3, 4–10, …).
- **Versioned release distribution** — production builds now carry an explicit application version instead of a Git commit SHA. GitHub Actions validates each change, then validates, builds, attests and publishes stable GitHub Releases as multi-architecture (`amd64`/`arm64`) images on GHCR. Self-hosted instances compare themselves with the latest stable GitHub Release and show its version, a concise note and links to the release/update guide. The dismissal is remembered per release, so a later release appears again.
- **Production Compose file** — `docker-compose.production.yml` consumes an immutable published image controlled by `SEO_PLAYGROUND_VERSION`, with a named persistent data volume shared by the web app and Geo-grid worker.
- **Geo-Grid: #1 markers are now stars** — grid points where the target ranks #1 render as a bulky, slightly oversized rounded star instead of a square, so first-place coverage pops against #2/#3 at a glance. Drawn as an SVG path (fat inner radius, round stroke joins) because CSS `clip-path` can't round polygon corners. A star on the grid center gets a white halo in place of the dashed border, so the center cue survives. Idea from a community fork.
- **Shared `callDataForSeo()`/`callDataForSeoFirst()` helper** (`src/lib/dataforseo.ts`) — 41 pages were reimplementing the same Basic-auth-header + `tasks[0].status_code !== 20000` + JSON-parse boilerplate inline; 3 of them had drifted enough to skip the status_code check entirely, and 28 had no `try/catch` around the fetch at all (a network blip crashed the server component instead of showing the app's normal error banner). Centralizes both auth/parsing and error handling in one tested helper, with an optional `timeoutMs` (via `AbortSignal.timeout`) for pages that need one. All ~40 eligible pages are now migrated — Backlinks and its 8 sub-pages, DataForSEO Labs/domain-analytics, Keyword/Competitors tools, AI Prompt Test, Instant Pages, SERP Checker, Reddit, Domain Technologies/Whois, Top Searches, Local Finder, Content Parsing. Left as-is: `rank-tracker/actions.ts` (a true multi-task batch endpoint — sends up to 100 keywords as separate tasks in one request and reads results back by index, which the helper's single-task contract doesn't fit) and `settings`/`api/balance` (a GET-based endpoint, not the POST `.../live` shape). Doesn't touch the async task_post/task_get polling flows (Site Audit, Google Reviews, Geo-Grid) — genuinely different shape.
- **First automated test suite** (`npm test`, via Vitest) — until now there were zero automated tests despite every DataForSEO call costing real money, so a regression that silently double-fires a request had nothing to catch it. Covers `stableSearchId()` (the shared dedupe helper ~40 pages rely on: determinism, param sensitivity, time-window bucketing, plus a documented edge case where `null`/`undefined`/`''` collapse to the same id) and a save/get roundtrip through `db.ts`'s settings, credentials, and the AI Optimization + Web Mentions caches — a regression guard for the exact missing-dedupe bug found on AI Optimization this session.
- **Web Mentions page** (`/dashboard/web-mentions`) — brand/keyword sentiment monitoring across the web: mentions list with per-item sentiment badge (positive/negative/neutral), a sentiment-polarity breakdown, emotional-reaction breakdown (anger/happiness/love/sadness/share/fun), and top domains/countries, via DataForSEO's Content Analysis API (`content_analysis/search/live` for the mention list, `content_analysis/summary/live` run in parallel for the aggregates). Optional page-type filter (ecommerce/news/blogs/message-boards/organization), history sidebar.
- **AI Visibility: "Trend over time" mode** — month-by-month mentions and AI search volume for a target, with a trend chart and an increasing/declining/flat delta badge, via `llm_mentions/historical/live` (new endpoint DataForSEO added for this; unlike `target_metrics`/`top_mentioned_*`, it *does* accept `location_name`/`language_name`/`date_from`/`date_to` as inputs). ChatGPT stays locked to United States/English same as the other LLM Mentions modes.
- **Query Fan-Out page** (`/dashboard/query-fan-out`) — surfaces the hidden "fan-out" sub-queries AI models (ChatGPT, Google AI) silently generate when answering prompts related to a seed keyword, then looks up each one's AI search volume. For each seed keyword, calls `llm_mentions/search/live` scoped with `search_scope: ['fan_out_queries']` (one request per seed — the endpoint rejects more than one task per POST body), dedupes the discovered fan-out queries across all seeds/mentions, then batches them through `ai_keyword_data/keywords_search_volume/live` for volume + 12-month trend. Shows seed-trigger rate, per-query origin seed(s) and mention count, sortable results table, history sidebar, Copy as Markdown. Note found while building this: `fan_out_queries` in the API response is an array of plain strings, not `{ keyword }` objects — the existing AI Optimization page's "Related queries" pills had been silently rendering blank because of this; fixed there too.
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
- **Geo-grid timeline dropped older snapshots** — a monitor's timeline and trend were cut from the 100 most recent runs of *all* monitors, so with several daily monitors each one only showed about a month. A series is now queried directly (indexed by `series_id`, with a one-time backfill of older runs).
- **A failed scheduled Geo-grid run was skipped until its next slot** (the next day, or week). When DataForSEO accepted none of the points, the run is retried every 5 minutes for up to 6 hours. When a large grid fails part-way, the points already posted (and billed) are kept as a partial run instead of being lost, and never posted twice. Posting also times out after 60 seconds instead of hanging.
- **A tab left on another project wrote into the active one** — the active project is shared by every tab and browser, so a tab still showing the previous project saved searches into the newly selected one. Open tabs now follow a project switch instantly within the same browser, and on focus from other browsers or devices, with a notice. A pending Geo-grid run keeps polling its own project.
- **Rank Tracker checks of several keywords at once** — they were sent as one multi-task request to `organic/live/regular`, which the Live endpoint rejects. Newly added keywords are now checked one per request (4 at a time), and the Check buttons use the Standard queue, which accepts up to 100 tasks per request.
- **Background worker cut off long passes** — the worker aborted its request after 30 seconds while the server kept working, so a pass through many projects was logged as a failure and the next one could start on top of it. The worker now waits up to 10 minutes, and the server runs one pass at a time (a concurrent call returns `{ busy: true }`).
- **Release notice showed raw Markdown** — the in-app update notice now strips inline Markdown (bold, links, code) from the release summary, and GitHub Releases use this changelog's section as their notes instead of auto-generated notes, which are empty without pull requests. `npm run check:release` fails when the version has no changelog section.
- **SERP Checker never checked `status_code`** — a failed DataForSEO call silently returned an empty result set instead of showing the error banner. Found and fixed while migrating the page onto the shared API helper.
- **Reddit search had zero `try/catch` around its fetch** — a network blip crashed the page instead of showing the normal error banner. Same for **Content Parsing**, which had the same gap. Both fixed while migrating onto the shared API helper.
- **Domain Intersection (top-level page) silently swallowed every DataForSEO error** as an empty result with `cost: 0`, instead of surfacing it — found and fixed while migrating onto the shared API helper. (Backlinks' own `domain-intersection` sub-page already handled this correctly; same name, different page.)
- **Dark mode gaps closed app-wide** — ~30 files across Local Finder, Google Reviews, Keyword Data/Difficulty/Overview, Related/Ranked Keywords, Domain Intersection, Competitors, Rank Tracker, Backlinks (hub, Anchors, Referring Domains), Reddit, OnPage (hub, Microdata, Instant Pages), SERP Checker, and AI Optimization stayed light-themed while the rest of the dashboard was dark-aware. Every dashboard page now has full `dark:` coverage.
- **Local Finder reimplemented its own dedupe hash** instead of reusing the shared `stableSearchId()` helper every other page uses — same FNV-1a/time-window logic, just copy-pasted. Now calls the shared helper directly; no behavior change.
- **`db.ts` migrations silently swallowed any error, not just "column already exists"** — the 9 `ALTER TABLE ... ADD COLUMN` migrations were wrapped in a blanket `catch {}`, which would also hide a real SQL syntax error or DB corruption issue on startup. Now only the specific "duplicate column name" SQLite error is swallowed; anything else rethrows. Also set `busy_timeout = 5000` (cheap insurance against a "database is locked" error if a write and a read ever overlap).
- **AI Optimization page had no caching/dedupe at all** — unlike ~35 other pages, it never checked `stableSearchId()`/a history table before firing a live DataForSEO call, so a refresh or back-navigation silently re-billed the same search every time. Found during an app-wide audit. Wired it into the same cache + history pattern as every other page (new `ai_optimization_searches` table), including a history sidebar it never had.
- **AI Optimization: "Invalid Field: 'location_name'" / "'language_name'" on ChatGPT** — `llm_mentions/search/live` only supports geo/language targeting on the `google` platform; ChatGPT isn't locale-aware the same way and the API rejects both fields outright when `platform=chat_gpt`. The request now only sends `location_name`/`language_name` for Google AI, and the form shows a note that both fields are ignored when ChatGPT is selected.
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

### Security
- **Dashboard no longer exposed to the whole network by default** — both Compose files publish port 3000 on `127.0.0.1` only. The app has no login, so anyone who could reach it could spend the DataForSEO credit. Set `SEO_PLAYGROUND_BIND=0.0.0.0` to restore the old behavior on a trusted network, or put an authenticating reverse proxy in front.

### Upgrade notes
- Back up your data first. On first start, the existing database becomes the "Default Project" (its search history stays in place) and a new `seo-playground.db.projects` file is created next to it for projects and credentials.
- Docker users: the dashboard now listens on `127.0.0.1` only; see Security above. The Compose files also start a second `worker` service.

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
