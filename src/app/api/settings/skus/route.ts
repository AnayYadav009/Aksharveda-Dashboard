import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/server-auth";
import { isActionAuthorized } from "@/lib/auth";
import { getAdminSupabaseClient } from "@/lib/admin-auth";

async function authorize(req: NextRequest) {
  const caller = await authenticateApiRequest(req);
  if (caller instanceof NextResponse) return { error: caller };
  if (!isActionAuthorized(caller.role, "manage")) return { error: NextResponse.json({ error: "Management access is required" }, { status: 403 }) };
  const admin = getAdminSupabaseClient();
  if (!admin) return { error: NextResponse.json({ error: "Database unavailable" }, { status: 503 }) };
  return { admin };
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req); if (auth.error) return auth.error;
  const { data, error } = await auth.admin.from("sku_master").select("item_id,name,short_name,ean,display_name").order("name").limit(2000);
  if (error) return NextResponse.json({ error: "Unable to load SKU master" }, { status: 500 });
  return NextResponse.json({ skus: data || [] });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorize(req); if (auth.error) return auth.error;
  const body = await req.json().catch(() => null);
  if (typeof body?.item_id !== "string" || typeof body?.display_name !== "string" || !body.item_id.trim() || body.display_name.trim().length > 120) return NextResponse.json({ error: "Provide a SKU and a display name up to 120 characters" }, { status: 400 });
  const name = body.display_name.trim();
  const { error } = await auth.admin.from("sku_master").update({ display_name: name || null }).eq("item_id", body.item_id);
  if (error) return NextResponse.json({ error: "Unable to save SKU display name" }, { status: 500 });
  return NextResponse.json({ ok: true, item_id: body.item_id, display_name: name });
}
