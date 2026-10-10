// Shared by the Sidebar (client, writes them) and the dashboard layout (server, reads them on render).
// Cookies rather than localStorage so the server renders the sidebar in its final state, without a flash.
export const SIDEBAR_COLLAPSED_COOKIE = 'sidebar_collapsed';
export const SIDEBAR_FAVORITES_COOKIE = 'sidebar_favorites';

/** Section key of the Favorites group, stored in the collapsed cookie like any other section. */
export const FAVORITES_SECTION_KEY = 'favorites';

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  try {
    return decodeURIComponent(value).split(',').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function parseCollapsedSections(value: string | undefined): string[] {
  return parseList(value);
}

/** Favorite tool hrefs, in the order they were starred, deduplicated. Unknown hrefs are filtered by the Sidebar. */
export function parseFavorites(value: string | undefined): string[] {
  return [...new Set(parseList(value).filter((href) => href.startsWith('/dashboard')))];
}

export function serializeList(values: Iterable<string>): string {
  return encodeURIComponent([...values].join(','));
}
