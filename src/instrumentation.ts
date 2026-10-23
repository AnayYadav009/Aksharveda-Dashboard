import { getAdminSupabaseClient } from "@/lib/admin-auth";

export async function register() {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_RUNTIME !== "nodejs") return;
  const admin = getAdminSupabaseClient();
  if (!admin) return;
  const required = ["channels", "sku_master", "upload_log", "po_header", "po_line", "po_plan", "po_line_dispatch", "po_state_history", "stock_snapshot", "settings", "notification_recipients", "in_app_notifications", "profiles"];
  const missing: string[] = [];
  for (const table of required) {
    const { error } = await admin.from(table).select("*").limit(0);
    if (error) missing.push(table);
  }
  if (!missing.includes("po_header")) {
    const { error } = await admin.from("po_header").select("hub").limit(0);
    if (error) missing.push("po_header.hub");
  }
  if (missing.length) console.warn(`[database] Setup check failed. Missing: ${missing.join(", ")}`);
}
