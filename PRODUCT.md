# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary audiences, served equally:

- **Consultants and small agencies** managing several client sites, often in local SEO. They switch between client projects, run recurring checks (Geo-grid, Rank Tracker, Review Velocity, Prompt Tracker), and hand branded PDF/Excel reports to clients.
- **Solo site owners** analysing their own site or business, usually one project, working for themselves rather than producing deliverables.

Both are paying DataForSEO per API call out of their own pocket, so cost awareness is part of every task.

## Product Purpose

SEO Playground is a self-hosted dashboard that runs SEO and local SEO queries directly against the DataForSEO API. It groups 40+ tools by task (keywords, domains and competitors, backlinks, SERP and local, AI visibility, business reviews, site audit). Every result is stored locally in SQLite so history can be revisited without paying for a new call.

Success: a user gets the answer they came for with the fewest paid calls, finds it again later in history, and (for agencies) turns it into a client-ready report.

## Positioning

- **Free and open source.** No SaaS subscription; the code is public on GitHub (paulmassen/seo-playground).
- **Pay-per-use through DataForSEO.** Users pay only for the API calls they make, and the Spending page shows exactly what each tool cost. A Semrush/Ahrefs-style subscription product cannot truthfully make this claim.
- **Self-hosted, local data.** Everything lives in SQLite on the user's own machine or server (Node, Docker, Cloudron); no cloud infrastructure is involved.

## Operating Context

- Runs locally (`127.0.0.1` by default) or on a self-hosted server behind optional login (`AUTH_ENABLED=true`) or a reverse proxy (Cloudron proxyAuth).
- Multi-project workspace: one project per client or site, each with its own defaults, history and SQLite file. The active project is selected from the sidebar.
- Long-running and scheduled work (Geo-grid queue, Rank Tracker checks, Review Velocity fetches) continues in the background via a worker; progress surfaces in the top-bar Tasks bell.
- Deliverables leave the app as white-label PDF reports (brand name, logo, colours, footer) and Excel/CSV/Markdown exports.
- Updates are announced in-app; releases are versioned Docker images.

## Capabilities and Constraints

- **Interface language: English only.** No internationalisation is planned; all UI copy stays in English.
- DataForSEO credentials are required before any tool works; they are stored locally only.
- API modes with different cost/latency trade-offs exist (e.g. Geo-grid Live, Priority, Standard) and must stay explicit to the user.
- Project identity must be captured at server-operation entry (`withProjectScope`, `runWithCurrentProject`); see `docs/project-scope.md`.
- Undecided: mobile support level and a formal accessibility target were not set as product requirements.

## Brand Commitments

- Name: **SEO Playground**.
- The DataForSEO affiliate link is always disclosed as an affiliate link, offered as optional support "at no extra cost", for new customers only.
- Support links (Buy Me a Coffee, Ko-fi) belong to the README/project pages.

## Evidence on Hand

- README screenshots and demos: `public/readme/hero.png`, `public/readme/geo-grid.gif`, `public/readme/google-reviews.gif`, `public/readme/web-mentions.gif`, plus `public/screenshot-rank-tracker.png` and `public/screenshot-local-finder.png`.
- Public changelog (`CHANGELOG.md`) and GitHub issues.
- No testimonials, customer logos, usage numbers or benchmarks exist; future work must not invent them.

## Product Principles

1. **Every paid call is visible.** Show cost and API mode before and after a call; never hide spend.
2. **Pay once, read many times.** Saved history is a first-class way back to results, not an afterthought.
3. **Serve the agency and the solo owner alike.** Multi-project and white-label features must not burden a single-site user.
4. **The user owns the data.** Local storage and self-hosting are core promises, not deployment details.
5. **Honest by default.** Affiliation, estimates and unknown costs are labelled as such.
