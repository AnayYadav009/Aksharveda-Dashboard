import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { canManageUsers, getAdminSupabaseClient, shouldRejectLastManagerDemotion } from "@/lib/admin-auth";

async function authorize(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "", anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const session = createServerClient(url, anon, { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } });
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const admin = getAdminSupabaseClient();
  if (!admin) return { error: NextResponse.json({ error: "Database service is not configured" }, { status: 503 }) };
  const { data: profile } = await admin.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (!canManageUsers(profile?.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user, admin };
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req); if (auth.error) return auth.error;
  const { data: profiles, error } = await auth.admin.from("profiles").select("user_id,name,role");
  if (error) return NextResponse.json({ error: "Unable to load profiles" }, { status: 500 });
  const { data: users, error: usersError } = await auth.admin.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) return NextResponse.json({ error: "Unable to load user emails" }, { status: 500 });
  const emailById = new Map(users.users.map(u => [u.id, u.email || ""]));
  const list = (profiles || []).map(p => ({ ...p, email: emailById.get(p.user_id) || "" })).sort((a,b) => Number(b.role === "pending") - Number(a.role === "pending") || a.name.localeCompare(b.name));
  return NextResponse.json({ users: list });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorize(req); if (auth.error) return auth.error;
  const body = await req.json().catch(() => null);
  const targetId = body?.userId, newRole = body?.role;
  if (typeof targetId !== "string" || !["pending","demand","warehouse","management"].includes(newRole)) return NextResponse.json({ error: "Invalid user or role" }, { status: 400 });
  const { data: target, error: targetError } = await auth.admin.from("profiles").select("role").eq("user_id", targetId).single();
  if (targetError || !target) return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  if (target.role === "management" && newRole !== "management") {
    const { count, error } = await auth.admin.from("profiles").select("user_id", { count: "exact", head: true }).eq("role", "management");
    if (error) return NextResponse.json({ error: "Unable to verify management users" }, { status: 500 });
    if (shouldRejectLastManagerDemotion(target.role, newRole, count || 0, auth.user.id, targetId)) return NextResponse.json({ error: "The last management user cannot be demoted" }, { status: 409 });
  }
  const { error } = await auth.admin.from("profiles").update({ role: newRole }).eq("user_id", targetId);
  if (error) return NextResponse.json({ error: "Unable to update role" }, { status: 500 });
  console.info("Profile role updated", { actor: auth.user.id, target: targetId, oldRole: target.role, newRole });
  return NextResponse.json({ ok: true });
}
