import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Allow public paths and static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.match(/\.(png|jpg|jpeg|gif|ico|svg|css|js)$/)
  ) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  // 2. If Supabase is not configured (e.g. offline dev mode without credentials), allow access
  const isConfigured =
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes("supabase.invalid") &&
    !supabaseUrl.includes("your-project") &&
    !supabaseAnonKey.includes("invalid-") &&
    !supabaseAnonKey.includes("your-");

  if (!isConfigured) {
    return NextResponse.next();
  }

  // 3. Create Supabase Server Client to validate session via cookies
  let response = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        response = NextResponse.next({
          request: {
            headers: req.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // If no authenticated user, redirect pages to /login and return 401 for API routes
  if (authError || !user) {
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

  // 4. Check user profile role for approval status
  // Query profiles table using user.id
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  // Missing profiles are treated as unapproved, just like pending profiles.
  const userRole = profile?.role || "pending";

  // If role is pending:
  // - API routes must return 403 Forbidden
  // - If visiting /pending, allow access
  // - If visiting any other page, redirect to /pending
  if (userRole === "pending") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Forbidden: Account pending approval" },
        { status: 403 }
      );
    }
    if (pathname !== "/pending") {
      return NextResponse.redirect(new URL("/pending", req.url));
    }
    return response;
  }

  // If an approved user visits /pending, redirect them to dashboard /pos
  if (pathname === "/pending" && userRole && userRole !== "pending") {
    return NextResponse.redirect(new URL("/pos", req.url));
  }

  return response;
}

// Backward compatibility export if Next.js invokes default or middleware
export default proxy;
export const middleware = proxy;

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
