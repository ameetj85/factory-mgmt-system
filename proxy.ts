import { NextResponse, type NextRequest } from "next/server";

// Must match SESSION_COOKIE in lib/auth/session.ts (that module is server-only, so it isn't imported here).
const SESSION_COOKIE = "fms_session";
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/setup"];

/**
 * Optimistic check only: sends visitors without a session cookie to the login page.
 * Real session validation and authorization happen in the data access layer (lib/auth/dal.ts).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isPublic && !request.cookies.has(SESSION_COOKIE)) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
