import { createClient } from "@supabase/supabase-js";
import { UserProfile, UserRole } from "./types";

/**
 * Returns an unprivileged browser Supabase client (using anon key).
 */
export function getBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

/**
 * Verifies if a given role is allowed to perform a specific action:
 * - only demand and management may upload CSVs
 * - warehouse may edit planning cells and stock
 * - management can do everything
 * - all roles can read
 */
export function isActionAuthorized(
  role: UserRole | string | undefined,
  action: "upload" | "planning_edit" | "stock_edit" | "read" | "manage"
): boolean {
  if (!role) return false;
  if (role === "management") return true;
  if (action === "read") return true;

  if (action === "upload") {
    return role === "demand";
  }

  if (action === "planning_edit" || action === "stock_edit") {
    return role === "warehouse" || role === "demand";
  }

  return false;
}
