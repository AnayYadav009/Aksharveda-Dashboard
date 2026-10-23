import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { UserRole } from "./types";
import { getAdminSupabaseClient, getOrCreateRole } from "./admin-auth";

export interface AuthContext {
  userId: string;
  role: UserRole | string;
}

/**
 * Validates request authentication in API Route handlers.
 * Extracts user session and checks profile role:
 * - If Supabase is not configured, allows request (local dev/fallback mode).
 * - If user is unauthenticated, returns 401 Unauthorized NextResponse.
 * - If user role is 'pending', returns 403 Forbidden NextResponse.
 * - Otherwise returns AuthContext with userId and role.
 */
export async function authenticateApiRequest(
  req: NextRequest
): Promise<NextResponse | AuthContext> {
  // Check header-based or cookie-based test role for isolated unit testing
  const testRole = req.headers.get("x-test-role") as UserRole | null;
  if (testRole && process.env.NODE_ENV !== "production") {
    if (testRole === "pending") {
      return NextResponse.json(
        { error: "Forbidden: Account pending approval" },
        { status: 403 }
      );
    }
    return { userId: "test-user-id", role: testRole };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  const isConfigured =
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes("supabase.invalid") &&
    !supabaseUrl.includes("your-project") &&
    !supabaseAnonKey.includes("invalid-") &&
    !supabaseAnonKey.includes("your-");

  if (!isConfigured) {
    // Offline local fallback mode
    return { userId: "local-dev-user", role: "management" };
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {
        // API routes don't mutate session cookies during auth verification
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required" },
      { status: 401 }
    );
  }

  const admin = getAdminSupabaseClient();
  if (!admin) return NextResponse.json({ error: "Database service is not configured" }, { status: 503 });
  let lookup;
  try { lookup = await getOrCreateRole(admin, user); }
  catch { return NextResponse.json({ error: "Unable to read account role" }, { status: 503 }); }
  if (lookup.databaseNotReady) return NextResponse.json({ error: "The database is not set up yet. Ask an administrator to run the migrations" }, { status: 503 });
  const role = lookup.role;

  if (role === "pending") {
    return NextResponse.json(
      { error: "Forbidden: Account pending approval" },
      { status: 403 }
    );
  }

  return {
    userId: user.id,
    role: role || "pending",
  };
}
