import { createBrowserClient } from "@supabase/ssr";
import { UserRole } from "./types";

/**
 * Returns a browser Supabase client (cookie-based via @supabase/ssr).
 */
export function getBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createBrowserClient(url, anonKey);
}

/**
 * Verifies if a given role is allowed to perform a specific action:
 * - 'pending' has NO permissions, including read
 * - only demand and management may upload CSVs
 * - warehouse may edit planning cells and stock
 * - management can do everything
 * - demand, warehouse, management can read
 */
export function isActionAuthorized(
  role: UserRole | string | undefined,
  action: "upload" | "planning_edit" | "stock_edit" | "read" | "manage"
): boolean {
  if (!role || role === "pending") return false;
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

