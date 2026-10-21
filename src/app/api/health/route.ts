import { NextResponse } from "next/server";
import { getDataAdapterStatus } from "@/lib/data-layer";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getDataAdapterStatus();
  return NextResponse.json({
    isFallback: status.isFallback,
    adapter: status.adapter,
  });
}
