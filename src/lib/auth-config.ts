/**
 * Login is opt-in so existing local installs keep working untouched. This file is
 * imported by the Edge middleware, so it must not use Node-only modules.
 */
export function authEnabled(): boolean {
  const flag = process.env.AUTH_ENABLED?.trim().toLowerCase();
  return flag === 'true' || flag === '1';
}

/** Only allow same-site relative paths after login, never `//host` or absolute URLs. */
export function safeNextPath(value: string | string[] | null | undefined, fallback = '/dashboard'): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || /[\r\n]/.test(raw)) return fallback;
  if (raw === '/login' || raw === '/setup' || raw.startsWith('/api/')) return fallback;
  return raw;
}
