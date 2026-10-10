import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !pass) return new NextResponse("Auth not configured", { status: 503 });

  const h = req.headers.get("authorization") ?? "";
  if (h.startsWith("Basic ")) {
    const d = atob(h.slice(6));
    const i = d.indexOf(":");
    if (i > 0 && d.slice(0, i) === user && d.slice(i + 1) === pass) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SEO", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
import { NextResponse, type NextRequest } from 'next/server';
import { authEnabled } from '@/lib/auth-config';

// Reachable without a session. /api/cron has its own bearer secret (used by the worker container).
const PUBLIC_PREFIXES = ['/login', '/setup', '/api/auth', '/api/cron'];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * The Edge runtime cannot open the SQLite file, so the session is validated by asking the
 * auth handler of this same server. Sessions that were revoked (sign-out, expiry) are rejected immediately.
 */
async function hasValidSession(request: NextRequest): Promise<boolean> {
  const cookie = request.headers.get('cookie');
  if (!cookie || !cookie.includes('session_token')) return false;
  const port = process.env.PORT?.trim() || request.nextUrl.port || '3000';
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/get-session`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!response.ok) return false;
    const data = await response.json() as { session?: unknown } | null;
    return Boolean(data?.session);
  } catch {
    return false; // Fail closed.
  }
}

export async function middleware(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();
  if (await hasValidSession(request)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' || pathname === '/dashboard' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
