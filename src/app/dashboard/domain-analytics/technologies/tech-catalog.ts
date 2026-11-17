import fs from 'node:fs';
import path from 'node:path';
import type { DfsCredentials } from '@/lib/dataforseo';
import type { TechCatalog, TechCatalogGroup } from './tech-shared';

export type { TechCatalog, TechCatalogGroup };

// DataForSEO's list of detectable technologies (GET domain_analytics/technologies/technologies,
// free of charge). A snapshot ships in data/dfs-technologies.json; it is refreshed from the API at
// most once every 30 days when credentials are available, and kept in memory between requests.


const FILE = path.join(process.cwd(), 'data', 'dfs-technologies.json');
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

let memo: TechCatalog | null = null;
let refreshing: Promise<void> | null = null;

function readFile(): TechCatalog | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as TechCatalog;
    return Array.isArray(parsed.groups) ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchCatalog(creds: DfsCredentials): Promise<TechCatalog | null> {
  // This endpoint is a GET; callDataForSeo only POSTs, so it is called directly.
  try {
    const res = await fetch('https://api.dataforseo.com/v3/domain_analytics/technologies/technologies', {
      headers: { Authorization: `Basic ${btoa(`${creds.login}:${creds.pass}`)}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { tasks?: Array<{ status_code?: number; result?: Array<{ groups?: TechCatalogGroup[] }> }> };
    const task = data.tasks?.[0];
    const groups = task?.status_code === 20000 ? task.result?.[0]?.groups : undefined;
    if (!groups?.length) return null;
    return {
      fetched_at: new Date().toISOString(),
      groups: groups.map((g) => ({
        id: g.id,
        title: g.title,
        categories: (g.categories ?? []).map((c) => ({ id: c.id, path: c.path, title: c.title, technologies: c.technologies ?? [] })),
      })),
    };
  } catch {
    return null;
  }
}

/** Catalogue for the current request; triggers a background refresh when the snapshot is stale. */
export function getTechCatalog(creds: DfsCredentials | null): TechCatalog {
  if (!memo) memo = readFile() ?? { fetched_at: '', groups: [] };
  const age = memo.fetched_at ? Date.now() - Date.parse(memo.fetched_at) : Infinity;
  if (creds && age > MAX_AGE_MS && !refreshing) {
    refreshing = fetchCatalog(creds)
      .then((fresh) => {
        if (!fresh) return;
        memo = fresh;
        try { fs.writeFileSync(FILE, JSON.stringify(fresh)); } catch { /* read-only install: keep it in memory */ }
      })
      .finally(() => { refreshing = null; });
  }
  return memo;
}

/** Sorted unique technology names. */
export function catalogTechNames(catalog: TechCatalog): string[] {
  const names = new Set<string>();
  for (const g of catalog.groups) for (const c of g.categories) for (const t of c.technologies) names.add(t.trim());
  return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

/** Exact (case-insensitive) catalogue spelling of a technology, or null. */
export function canonicalTechName(catalog: TechCatalog, name: string): string | null {
  const wanted = name.trim().toLowerCase();
  for (const g of catalog.groups) for (const c of g.categories) for (const t of c.technologies) if (t.trim().toLowerCase() === wanted) return t.trim();
  return null;
}

/** Closest catalogue names for a misspelt technology (substring first, then shared prefix). */
export function suggestTechNames(catalog: TechCatalog, name: string, max = 6): string[] {
  const q = name.trim().toLowerCase();
  if (!q) return [];
  const names = catalogTechNames(catalog);
  const contains = names.filter((n) => n.toLowerCase().includes(q) || q.includes(n.toLowerCase()));
  const prefix = names.filter((n) => n.toLowerCase().startsWith(q.slice(0, 3)) && !contains.includes(n));
  return [...contains, ...prefix].slice(0, max);
}
