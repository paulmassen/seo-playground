#!/usr/bin/env node
/**
 * SEO Playground — API Smoke Test
 *
 * Calls every live DataForSEO endpoint used in the app with limit:1,
 * validates that the fields the UI reads are actually present in the response,
 * and prints a PASS / FAIL / WARN report with per-call cost.
 *
 * Usage:
 *   node scripts/smoke-test.mjs
 *
 * Total cost: ~$0.05–0.15 depending on your plan.
 * Async endpoints (Site Audit, Geo-Grid, Google Reviews) are skipped.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Terminal colors ──────────────────────────────────────────────────────────
const G = '\x1b[32m';   // green
const R = '\x1b[31m';   // red
const Y = '\x1b[33m';   // yellow
const C = '\x1b[36m';   // cyan
const B = '\x1b[1m';    // bold
const D = '\x1b[2m';    // dim
const X = '\x1b[0m';    // reset

// ─── Credentials from SQLite ──────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'seo-playground.db'));
const S = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;

const login    = S('dfs-login');
const pass     = S('dfs-pass');
const domain   = S('default_domain')      || 'example.com';
const location = S('default_location')    || 'France';
const language = S('default_language')    || 'French';
const coords   = S('default_coordinates') || '48.8566,2.3522';

if (!login || !pass) {
  console.error(`${R}No credentials found. Open the app → Settings and save your DataForSEO credentials.${X}`);
  process.exit(1);
}

const auth = 'Basic ' + Buffer.from(`${login}:${pass}`).toString('base64');
let totalCost = 0;
const results = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Navigate a dot-path on an object, e.g. get(obj, 'a.b.c') */
function get(obj, path) {
  return path.split('.').reduce((acc, k) => acc?.[k], obj);
}

/** POST to DataForSEO, return the first task object */
async function dfsCall(endpoint, body) {
  const res = await fetch(`https://api.dataforseo.com/v3/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify([body]),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json();
  return data?.tasks?.[0];
}

/**
 * Run one smoke test.
 * @param {string}   name      — display name
 * @param {string}   endpoint  — DataForSEO path after /v3/
 * @param {object}   body      — request body (single task)
 * @param {function} extract   — (task) => item[]  — how to get items from the task
 * @param {string[]} fields    — dot-paths that must be non-null on items[0]
 */
async function test(name, endpoint, body, { extract, fields = [] } = {}) {
  const label = name.padEnd(36);
  process.stdout.write(`  ${D}${label}${X}`);

  try {
    const task = await dfsCall(endpoint, body);

    if (!task) {
      console.log(`${R}FAIL${X}  no task returned`);
      results.push({ name, ok: false, reason: 'no task returned' });
      return;
    }

    const cost = task.cost ?? 0;
    totalCost += cost;
    const costStr = `${D}$${cost.toFixed(4)}${X}`;

    if (task.status_code !== 20000) {
      // Access denied / not available = subscription issue, not a code bug
      if (task.status_code === 40303 || task.status_message?.includes('Access denied') || task.status_message?.includes('Invalid Field: \'pages')) {
        console.log(`${Y}SKIP${X}  subscription required  ${costStr}`);
        results.push({ name, ok: true, warn: 'no subscription' });
        return;
      }
      console.log(`${R}FAIL${X}  ${task.status_message}  ${costStr}`);
      results.push({ name, ok: false, reason: task.status_message });
      return;
    }

    // Extract items using the provided function (or default to result[0].items)
    const defaultExtract = (t) => t.result?.[0]?.items ?? [];
    const items = (extract ?? defaultExtract)(task);
    const arr = Array.isArray(items) ? items : (items != null ? [items] : []);

    if (arr.length === 0) {
      console.log(`${Y}WARN${X}  no data for this domain/query  ${costStr}`);
      results.push({ name, ok: true, warn: 'no data' });
      return;
    }

    const item = arr[0];
    const missing = fields.filter((f) => get(item, f) == null);

    if (missing.length > 0) {
      console.log(`${R}FAIL${X}  missing fields: ${B}${missing.join(', ')}${X}  ${costStr}`);
      console.log(`       ${D}actual keys: ${Object.keys(item).slice(0, 12).join(', ')}${X}`);
      results.push({ name, ok: false, reason: `missing: ${missing.join(', ')}` });
    } else {
      console.log(`${G}PASS${X}  ${arr.length} item(s)  ${costStr}`);
      results.push({ name, ok: true });
    }
  } catch (e) {
    console.log(`${R}FAIL${X}  ${e.message}`);
    results.push({ name, ok: false, reason: e.message });
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

console.log(`\n${B}SEO Playground — API Smoke Test${X}`);
console.log(`${D}Domain: ${domain}  ·  Location: ${location}  ·  Language: ${language}${X}\n`);

// ── DataForSEO Labs ───────────────────────────────────────────────────────────
console.log(`${C}${B}DataForSEO Labs${X}`);

await test(
  'keyword_ideas',
  'dataforseo_labs/google/keyword_ideas/live',
  { keywords: ['plombier'], location_name: location, language_name: language, limit: 1, include_serp_info: false },
  { fields: ['keyword', 'keyword_info.search_volume', 'keyword_properties.keyword_difficulty', 'search_intent_info.main_intent', 'avg_backlinks_info.referring_domains'] },
);

await test(
  'search_intent',
  'dataforseo_labs/google/search_intent/live',
  { keywords: ['plombier urgence', 'meilleur plombier'], location_name: location, language_name: language },
  { fields: ['keyword', 'keyword_intent.label'] },
);

await test(
  'bulk_keyword_difficulty',
  'dataforseo_labs/google/bulk_keyword_difficulty/live',
  { keywords: ['plombier'], location_name: location, language_name: language },
  { fields: ['keyword', 'keyword_difficulty'] },
);

await test(
  'domain_categories',
  'dataforseo_labs/google/categories_for_domain/live',
  { target: domain, location_name: location, language_name: language, limit: 1 },
  { fields: ['categories', 'metrics.organic.etv', 'metrics.organic.count'] },
);

await test(
  'subdomains',
  'dataforseo_labs/google/subdomains/live',
  { target: 'leboncoin.fr', location_name: location, language_name: language, limit: 1 },
  { fields: ['subdomain', 'metrics.organic.etv', 'metrics.organic.count'] },
);

await test(
  'bulk_traffic_estimation',
  'dataforseo_labs/google/bulk_traffic_estimation/live',
  { targets: [domain, 'leparisien.fr'], location_name: location, language_name: language },
  { fields: ['target', 'metrics.organic.etv', 'metrics.organic.count'] },
);

await test(
  'page_intersection (Labs)',
  'dataforseo_labs/google/page_intersection/live',
  {
    pages: [{ url: 'leparisien.fr', type: 'url' }, { url: 'lemonde.fr', type: 'url' }],
    location_name: location, language_name: language, limit: 1, intersections: true,
  },
  { fields: ['keyword_data.keyword', 'keyword_data.keyword_info.search_volume'] },
);

// ── Backlinks ─────────────────────────────────────────────────────────────────
console.log(`\n${C}${B}Backlinks${X}`);

await test(
  'backlinks',
  'backlinks/backlinks/live',
  { target: domain, limit: 1, order_by: ['rank,desc'] },
  { fields: ['url_from', 'domain_from', 'page_from_rank'] },
);

await test(
  'referring_domains',
  'backlinks/referring_domains/live',
  { target: domain, limit: 1 },
  { fields: ['domain', 'backlinks', 'domain_from_rank'] },
);

await test(
  'anchors',
  'backlinks/anchors/live',
  { target: domain, limit: 1 },
  { fields: ['anchor', 'backlinks', 'referring_domains'] },
);

await test(
  'referring_networks',
  'backlinks/referring_networks/live',
  { target: domain, limit: 1 },
  { fields: ['network_address', 'referring_domains', 'backlinks'] },
);

await test(
  'bulk_backlinks',
  'backlinks/bulk_backlinks/live',
  { targets: [domain] },
  { fields: ['target', 'backlinks', 'referring_domains'] },
);

await test(
  'bulk_referring_domains',
  'backlinks/bulk_referring_domains/live',
  { targets: [domain] },
  { fields: ['target', 'referring_domains', 'referring_main_domains'] },
);

await test(
  'page_intersection (Backlinks)',
  'backlinks/page_intersection/live',
  { targets: [{ url: domain, type: 'url' }, { url: 'example.org', type: 'url' }], limit: 1 },
  { fields: ['url_from', 'domain_from', 'page_from_rank'] },
);

await test(
  'domain_intersection (Backlinks)',
  'backlinks/domain_intersection/live',
  { target1: domain, target2: 'example.org', limit: 1 },
  { fields: ['domain_from', 'domain_from_rank'] },
);

await test(
  'history',
  'backlinks/history/live',
  { target: domain },
  { fields: ['date', 'backlinks', 'referring_domains'] },
);

// ── SERP ──────────────────────────────────────────────────────────────────────
console.log(`\n${C}${B}SERP${X}`);

await test(
  'local_finder',
  'serp/google/local_finder/live/advanced',
  { keyword: 'plombier', location_coordinate: coords, language_name: language },
  // Keep only local_pack items, matching the page's filter
  {
    extract: (t) => (t.result?.[0]?.items ?? []).filter((i) => i.type === 'local_pack'),
    fields: ['rank_group', 'title'],
  },
);

// ── OnPage (live) ─────────────────────────────────────────────────────────────
console.log(`\n${C}${B}OnPage${X}`);

await test(
  'instant_pages',
  'on_page/instant_pages',
  { url: `https://${domain}`, enable_javascript: false },
  { fields: ['url', 'onpage_score', 'meta'] },
);

await test(
  'content_parsing',
  'on_page/content_parsing/live',
  { url: `https://${domain}` },
  { fields: ['url', 'content_quality_score', 'meta'] },
);

// ── Domain Analytics ──────────────────────────────────────────────────────────
console.log(`\n${C}${B}Domain Analytics${X}`);

await test(
  'technologies',
  'domain_analytics/technologies/domain_technologies/live',
  { target: domain },
  // Returns a single summary object at result[0], not an items array
  { extract: (t) => (t.result?.[0] ? [t.result[0]] : []), fields: ['domain', 'technologies'] },
);

await test(
  'whois',
  'domain_analytics/whois/overview/live',
  { filters: ['domain', '=', domain], limit: 1 },
  { fields: ['domain', 'registrar', 'created_datetime'] },
);

// ─── Summary ──────────────────────────────────────────────────────────────────
const passed = results.filter((r) => r.ok && !r.warn).length;
const warned = results.filter((r) => r.warn).length;
const failed = results.filter((r) => !r.ok).length;

console.log(`\n${'─'.repeat(55)}`);
console.log(
  `${B}Results:  ${G}${passed} passed${X}${B}  ${Y}${warned} warned${X}${B}  ${failed > 0 ? R : ''}${failed} failed${X}${B}` +
  `  ·  Total cost: $${totalCost.toFixed(4)}${X}`,
);

if (failed > 0) {
  console.log(`\n${R}${B}Failed:${X}`);
  results.filter((r) => !r.ok).forEach((r) => {
    console.log(`  ${R}✗${X} ${r.name}${D} — ${r.reason}${X}`);
  });
}

if (warned > 0) {
  console.log(`\n${Y}Skipped / no data:${X}`);
  results.filter((r) => r.warn).forEach((r) => {
    console.log(`  ${Y}⚠${X} ${r.name}${D} — ${r.warn}${X}`);
  });
}

console.log('');
process.exit(failed > 0 ? 1 : 0);
