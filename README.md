# SEO Playground — SEO and Local SEO Dashboard

> **New:** New Query Fan-Out page (surfaces the hidden sub-queries AI models generate when answering prompts, with their AI search volume). New AI Visibility page (see how often a domain/brand is mentioned by LLMs, and who dominates a topic). Nearly every results table across the app is now sortable and has a "Copy as Markdown" button. See the [changelog](#changelog) below.

> **Work in progress** — new DataForSEO endpoints are being added progressively.

SEO Playground is a self-hosted dashboard that lets you run SEO and local SEO queries directly against the [DataForSEO API](https://dataforseo.com/). Every search is saved locally in a SQLite database, so you can browse your history and revisit results without making additional API calls. There is no cloud infrastructure involved — everything runs on your machine.

If you find this useful, consider supporting the project:

[![Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/paulmassendari)
[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/paulmassendari)

## Screenshots

![Local Finder — Grid Search](public/screenshot-local-finder.png)
*Local Finder: grid search showing local rankings across a geographic area*

![Rank Tracker](public/screenshot-rank-tracker.png)
*Rank Tracker: monitor keyword positions over time for any domain*

![Google Reviews Analysis](public/review-analysis-screenshot.png)
*Google Reviews: rating distribution, monthly review chart, and rating goal calculator*

## Features

- **Rank Tracker** — Track keyword positions over time for any domain
- **SERP Checker** — Analyze Google organic results with target domain highlighting
- **Ranked Keywords** — Discover what keywords a domain ranks for
- **Keyword Overview** — Metrics (volume, CPC, competition) for a list of keywords
- **Keyword Data** — Google Ads & Bing keyword research
- **Keyword Difficulty** — Bulk difficulty scores via DataForSEO Labs
- **Keyword Ideas** — Keyword ideas from a seed with volume, difficulty and intent
- **Search Intent** — Classify keywords by search intent (informational, navigational, commercial, transactional)
- **Related Keywords** — Related keyword suggestions from a seed keyword
- **Competitors** — Find competing domains in the SERPs
- **Domain Intersection** — Common keywords between two domains
- **Historical Rank** — Ranking history overview for a domain
- **Domain Categories** — Thematic categories for any domain
- **Subdomains** — Top subdomains by organic traffic
- **Traffic Estimation** — Bulk organic traffic estimate for a list of domains
- **Page Intersection (Labs)** — Keywords shared between multiple pages
- **Backlinks** — Full backlink profile: list, referring domains, anchors, referring networks, history
- **Backlinks Page Intersection** — Pages linking to multiple of your targets simultaneously
- **Backlinks Domain Intersection** — Domains linking to you and a competitor
- **Bulk Backlinks / Bulk Referring Domains** — Aggregated backlink metrics for a domain list
- **Local Finder** — Google local pack results for any keyword and location, with map-based coordinate picker
- **Geo-Grid Ranking** — Local visibility heatmap across a configurable grid of points (3×3 to 11×11). Choose between three API modes: Live (~6 s, instant results), Priority (~1 min, 40% cheaper) or Standard (background queue, 70% cheaper). Results are color-coded by rank position and saved locally for later review. Includes a competitive landscape panel (top competitors by grid presence, with a one-click "view on grid" toggle) and a visibility-by-distance breakdown.
- **On-Page Site Audit** — Full site crawl with pages, links, resources, duplicate tags and non-indexable pages
- **On-Page Instant Pages** — Instant single-page audit without crawling
- **Microdata Analysis** — Structured data inspection for any crawled URL
- **Content Parsing** — Quality score, readability (ARI), word count, meta tags, content blocks
- **Google Reviews** — Fetch and analyze Google Business reviews: rating distribution, monthly chart, and rating goal calculator
- **AI Optimization** — Visibility in AI-generated answers
- **AI Visibility** — Target overview (mentions, AI search volume, source/platform breakdown) or topic leaderboard (top mentioned domains and brands) via DataForSEO LLM Mentions
- **Reddit Mentions** — Discover Reddit threads linking to or discussing your URLs
- **Top Searches** — Local search trends
- **Settings** — Store your DataForSEO credentials and defaults locally

## Requirements

- Node.js 18+
- A [DataForSEO](https://dataforseo.com/) account (API key)

## Getting Started

### Option 1 — Docker (recommended)

The easiest and fastest way to run the app. Docker builds a production image so the app is fully optimized.

```bash
# Build and start (first run)
docker compose up --build

# Subsequent runs
docker compose up
```

The database is persisted in `./data/seo-playground.db` on your machine.

### Option 2 — Node.js (production mode)

Faster than dev mode — build once, then run.

```bash
npm install
npm run build
npm start
```

### Option 3 — Node.js (dev mode)

Convenient for development but noticeably slower — Next.js recompiles on every request and skips all optimizations. Not recommended for daily use.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and go to **Settings** to enter your DataForSEO API credentials.

## Testing

```bash
npm test
```

Runs the Vitest suite (dedupe/cache helpers). No DataForSEO credentials or network access needed — it uses a throwaway SQLite file.

## Configuration

All settings (API credentials, default location, language, coordinates, domain) are stored locally in `seo-playground.db` (SQLite). No `.env` file is needed — configure everything from the Settings page.

## Data Storage

Search history and results are cached locally in `seo-playground.db`. The database is created automatically on first run.

## Tech Stack

- [Next.js 15](https://nextjs.org/) — App Router, Server Actions
- [React 19](https://react.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — local SQLite storage
- [Leaflet](https://leafletjs.com/) — maps
- [Lucide React](https://lucide.dev/) — icons

## Changelog

Full detailed history: [CHANGELOG.md](CHANGELOG.md).

- **2026-08-30** — New Web Mentions page (brand sentiment monitoring via DataForSEO Content Analysis API). New "Trend over time" mode on AI Visibility (month-by-month mentions/volume via `llm_mentions/historical`). App-wide audit: added the first automated test suite (`npm test`, Vitest), fixed AI Optimization page missing caching/dedupe (was re-billing on every refresh), `db.ts` migrations swallowing real errors (not just "column already exists"), migrated ~40 pages onto a new shared `callDataForSeo()` API helper (uniform auth/error handling, catching a few real bugs along the way: SERP Checker and Domain Intersection silently swallowing API errors, Reddit and Content Parsing with no `try/catch` around their fetch), and closed the remaining dark mode gaps across ~30 files (Local Finder, Google Reviews, Keyword Data/Difficulty/Overview, Related/Ranked Keywords, Domain Intersection, Competitors, Rank Tracker, Backlinks, Reddit, OnPage, SERP Checker, AI Optimization) — every dashboard page is now fully dark-mode aware.
- **2026-08-09** — New Query Fan-Out page (hidden AI sub-queries + their search volume). New AI Visibility page (LLM mention tracking). Sortable tables + "Copy as Markdown" across ~30 pages. Fixed location targeting on Labs pages, Domain Categories names, Bulk Backlinks columns, repeated billing on double-submits app-wide, and blank "Related queries" pills on AI Optimization.
- **2026-07-25** — Geo-Grid competitive analysis (top competitors, visibility-by-distance) and several Geo-Grid reliability/cost-tracking fixes.
- **2026-06-01** — Geo-Grid Ranking split out into its own dedicated page.
- **2026-05-31 and earlier** — Labs endpoint field-mapping fixes, Docker support, UI redesign, initial release of core rank tracking, keyword research, backlinks, and on-page features.

## License

MIT
