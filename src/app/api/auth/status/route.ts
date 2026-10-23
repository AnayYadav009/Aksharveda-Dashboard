import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getAdminSupabaseClient, getOrCreateRole } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const session = createServerClient(url, anon, { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } });
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getAdminSupabaseClient();
  if (!admin) return NextResponse.json({ error: "Database service is not configured" }, { status: 503 });
  const result = await getOrCreateRole(admin, user);
  if (result.databaseNotReady) return NextResponse.json({ error: "The database is not set up yet. Ask an administrator to run the migrations", databaseNotReady: true }, { status: 503 });
  return NextResponse.json({ role: result.role });
}
