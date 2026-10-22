import { NextRequest, NextResponse } from "next/server";
import { parseAndCleanBlinkitRows } from "@/lib/parser";
import { generateUploadPreview } from "@/lib/data-layer";
import { HubSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rawRows, fileName, hub } = body;

    const hubResult = HubSchema.safeParse(hub);
    if (!hubResult.success) {
      return NextResponse.json(
        { error: "Invalid or missing hub: must be 'delhi' or 'kolkata'" },
        { status: 400 }
      );
    }

    if (!Array.isArray(rawRows)) {
      return NextResponse.json({ error: "Invalid rows format: expected array" }, { status: 400 });
    }

    const { validRows, rejectedRows } = parseAndCleanBlinkitRows(rawRows, hubResult.data);
    const preview = await generateUploadPreview(validRows, fileName || "upload.csv", rejectedRows);

    return NextResponse.json({ success: true, preview, validRows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error generating preview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
