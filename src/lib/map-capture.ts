/**
 * OpenStreetMap's tile usage policy requires a Referer on every tile request and forbids
 * bypassing the browser cache. Some reverse proxies (Cloudron) send
 * `Referrer-Policy: same-origin`, which strips the Referer from cross-origin requests:
 * OSM then answers with its "Access blocked" tile. Every request to OSM must therefore set
 * its own referrer policy.
 */
export const OSM_REFERRER_POLICY: ReferrerPolicy = 'strict-origin-when-cross-origin';

/**
 * Options for html-to-image when capturing a Leaflet map with OSM tiles (PDF reports).
 * html-to-image re-fetches every <img> to inline it: reuse the tiles the map already loaded
 * (same URL, no cache-busting query string, CORS like the tile layer) and keep the Referer.
 */
export const MAP_CAPTURE_FETCH_OPTIONS = {
  cacheBust: false,
  fetchRequestInit: {
    mode: 'cors',
    cache: 'force-cache',
    referrerPolicy: OSM_REFERRER_POLICY,
  } satisfies RequestInit,
} as const;
