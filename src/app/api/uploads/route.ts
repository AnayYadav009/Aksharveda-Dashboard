import { NextResponse } from "next/server";
import { getUploadLogs } from "@/lib/data-layer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const uploads = await getUploadLogs();
    return NextResponse.json({ uploads });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error fetching uploads";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
