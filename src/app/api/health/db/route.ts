import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabaseClient } from "@/lib/admin-auth";
import { createServerClient } from "@supabase/ssr";

const TABLES = ["channels", "sku_master", "upload_log", "po_header", "po_line", "po_plan", "po_line_dispatch", "po_state_history", "stock_snapshot", "settings", "notification_recipients", "in_app_notifications", "profiles"];
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "", anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const session = createServerClient(url, anon, { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } });
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = getAdminSupabaseClient();
    if (!admin) return NextResponse.json({ error: "Database service is not configured" }, { status: 503 });
    const { data: profile } = await admin.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    if (profile?.role !== "management") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const admin = getAdminSupabaseClient();
  if (!admin) return NextResponse.json({ ok: false, missing: [...TABLES, "po_header.hub"] });
  const missing: string[] = [];
  for (const table of TABLES) {
    const { error } = await admin.from(table).select("*").limit(0);
    if (error) missing.push(table);
  }
  if (!missing.includes("po_header")) {
    const { error } = await admin.from("po_header").select("hub").limit(0);
    if (error) missing.push("po_header.hub");
  }
  return NextResponse.json({ ok: missing.length === 0, missing });
}
