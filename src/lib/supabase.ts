import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Auto-load .env.local when running outside Next.js (e.g. tsx, vitest, node)
function ensureEnvLoaded() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const envPath = path.resolve(process.cwd(), ".env.local");
      if (fs.existsSync(envPath)) {
        require("dotenv").config({ path: envPath });
      }
    } catch {}
  }
}

export function getSupabaseCredentials() {
  ensureEnvLoaded();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  // Strictly require service role key for backend operations - no silent fallback to anon key
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key && url && !url.includes("supabase.invalid")) {
    console.error("FATAL: SUPABASE_SERVICE_ROLE_KEY is not defined. Failing loudly to prevent unauthorized or silent fallback operations.");
  }
  return { url, key };
}

/**
 * Returns true if usable Supabase credentials are configured.
 */
export function isSupabaseConfigured(): boolean {
  const { url, key } = getSupabaseCredentials();
  if (!url || !key) return false;
  if (url.includes("supabase.invalid") || url.includes("your-project")) {
    return false;
  }
  if (key.includes("invalid-") || key.includes("your-")) {
    return false;
  }
  return true;
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const { url, key } = getSupabaseCredentials();
  if (!supabaseInstance) {
    supabaseInstance = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return supabaseInstance;
}
