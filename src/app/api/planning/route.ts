import { NextRequest, NextResponse } from "next/server";
import { getPlanningGrid, updatePlanningRow } from "../../../lib/data-layer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const hideClosed = searchParams.get("hideClosed") !== "false";
    const city = searchParams.get("city") || "";
    const state = searchParams.get("state") || "";

    const data = await getPlanningGrid({
      hideClosed,
      city,
      state,
    });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error fetching planning sheet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "update_sku_short_name" && body.item_id && typeof body.short_name === "string") {
      const { updateSKUShortName } = await import("@/lib/data-layer");
      const result = await updateSKUShortName(body.item_id, body.short_name.trim());
      return NextResponse.json(result);
    }
    if (body.action === "upsert_test_po" || body.action === "delete_test_po") {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (body.action === "upsert_test_po" && body.po_number?.startsWith("TEST-E2E-")) {
        const { upsertTestPO } = await import("../../../lib/data-layer");
        const result = await upsertTestPO(body.po_number);
        return NextResponse.json(result);
      }
      if (body.action === "delete_test_po" && body.po_number?.startsWith("TEST-E2E-")) {
        const { deleteTestPO } = await import("../../../lib/data-layer");
        const result = await deleteTestPO(body.po_number);
        return NextResponse.json(result);
      }
    }
    const result = await updatePlanningRow(body);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error saving planning update";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
