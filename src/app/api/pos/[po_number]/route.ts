import { NextRequest, NextResponse } from "next/server";
import { getPODetail } from "@/lib/data-layer";
import { HubSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ po_number: string }> }
) {
  try {
    const { po_number } = await params;
    const hubResult = HubSchema.safeParse(req.nextUrl.searchParams.get("hub"));
    if (!hubResult.success) {
      return NextResponse.json({ error: "Invalid or missing hub parameter: must be 'delhi' or 'kolkata'" }, { status: 400 });
    }
    const detail = await getPODetail(po_number, hubResult.data);
    if (!detail) {
      return NextResponse.json({ error: "PO not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error fetching PO detail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
