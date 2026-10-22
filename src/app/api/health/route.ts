import { NextRequest, NextResponse } from "next/server";
import { getDataAdapterStatus } from "@/lib/data-layer";
import { HubSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const hubResult = HubSchema.safeParse(req.nextUrl.searchParams.get("hub"));
  if (!hubResult.success) {
    return NextResponse.json({ error: "Invalid or missing hub parameter: must be 'delhi' or 'kolkata'" }, { status: 400 });
  }
  const status = await getDataAdapterStatus();
  return NextResponse.json({
    isFallback: status.isFallback,
    adapter: status.adapter,
  });
}
