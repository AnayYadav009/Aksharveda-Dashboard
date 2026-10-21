import { NextRequest, NextResponse } from "next/server";
import { getPODetail } from "@/lib/data-layer";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ po_number: string }> }
) {
  try {
    const { po_number } = await params;
    const detail = await getPODetail(po_number);
    if (!detail) {
      return NextResponse.json({ error: "PO not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error fetching PO detail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
