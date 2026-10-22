import { NextRequest, NextResponse } from "next/server";
import { getUploadLogs } from "@/lib/data-layer";
import { HubSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const hubResult = HubSchema.safeParse(req.nextUrl.searchParams.get("hub"));
    if (!hubResult.success) {
      return NextResponse.json({ error: "Invalid or missing hub parameter: must be 'delhi' or 'kolkata'" }, { status: 400 });
    }
    const uploads = await getUploadLogs(hubResult.data);
    return NextResponse.json({ uploads });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error fetching uploads";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
