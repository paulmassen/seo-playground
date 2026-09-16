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
