import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function isMissingProfilesTable(error: { code?: string } | null | undefined) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export async function getOrCreateRole(client: SupabaseClient, user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
  const { data: profile, error } = await client.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (error) {
    if (isMissingProfilesTable(error)) return { role: null, databaseNotReady: true as const };
    throw error;
  }
  if (profile?.role) return { role: profile.role, databaseNotReady: false as const };
  const name = typeof user.user_metadata?.name === "string" && user.user_metadata.name ? user.user_metadata.name : (user.email?.split("@")[0] || "User");
  const { error: insertError } = await client.from("profiles").upsert({ user_id: user.id, name, role: "pending" }, { onConflict: "user_id", ignoreDuplicates: true });
  if (insertError) {
    if (isMissingProfilesTable(insertError)) return { role: null, databaseNotReady: true as const };
    throw insertError;
  }
  const { data: insertedOrExisting, error: rereadError } = await client.from("profiles").select("role").eq("user_id", user.id).single();
  if (rereadError) {
    if (isMissingProfilesTable(rereadError)) return { role: null, databaseNotReady: true as const };
    throw rereadError;
  }
  return { role: insertedOrExisting.role, databaseNotReady: false as const };
}

export function canManageUsers(role: string | null | undefined) { return role === "management"; }
export function shouldRejectLastManagerDemotion(targetRole: string, newRole: string, managerCount: number, actorId: string, targetId: string) {
  return targetRole === "management" && newRole !== "management" && managerCount <= 1 && actorId === targetId;
}
