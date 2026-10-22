import { NextRequest, NextResponse } from "next/server";
import { getStockData, updateStockData } from "@/lib/data-layer";
import { HubSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const hubParam = searchParams.get("hub");
    const hubResult = HubSchema.safeParse(hubParam);
    if (!hubResult.success) {
      return NextResponse.json(
        { error: "Invalid or missing hub parameter: must be 'delhi' or 'kolkata'" },
        { status: 400 }
      );
    }

    const stock = await getStockData(hubResult.data);
    return NextResponse.json({ stock });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error fetching stock";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { updates, item_id, qty_in_hand, updated_by, updatedBy, hub } = body;
    const hubResult = HubSchema.safeParse(hub);
    if (!hubResult.success) {
      return NextResponse.json(
        { error: "Invalid or missing hub field: must be 'delhi' or 'kolkata'" },
        { status: 400 }
      );
    }

    const actor = updated_by || updatedBy || "warehouse_team";

    if (item_id !== undefined && qty_in_hand !== undefined) {
      await updateStockData([{ item_id, qty_in_hand: Number(qty_in_hand) }], hubResult.data, actor);
      return NextResponse.json({ success: true });
    }

    if (Array.isArray(updates)) {
      const formatted = updates
        .filter((u) => Boolean(u.item_id))
        .map((u) => ({ item_id: u.item_id, qty_in_hand: Number(u.qty_in_hand || u.qty) || 0 }));
      const result = await updateStockData(formatted, hubResult.data, actor);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error updating stock";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
