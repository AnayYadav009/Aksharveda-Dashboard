import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Allow public paths and static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname === "/login" ||
    pathname.startsWith("/api/health") ||
    pathname.match(/\.(png|jpg|jpeg|gif|ico|svg|css|js)$/)
  ) {
    return NextResponse.next();
  }

  // 2. If Supabase is not configured (e.g. offline dev mode without credentials), allow access
  if (!isSupabaseConfigured()) {
    return NextResponse.next();
  }

  // 3. Check for Supabase session cookies
  // Supabase stores auth cookies under sb-<project-ref>-auth-token or sb-access-token
  const cookies = req.cookies.getAll();
  const hasAuthToken = cookies.some(
    (c) =>
      c.name.includes("-auth-token") ||
      c.name.includes("access_token") ||
      c.name.includes("sb-access-token")
  );

  // If no auth cookie found, redirect pages to /login and return 401 for API routes
  if (!hasAuthToken) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized: Authentication required" },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
