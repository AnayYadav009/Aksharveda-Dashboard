import { NextRequest, NextResponse } from "next/server";
import { parseAndCleanBlinkitRows } from "@/lib/parser";
import { generateUploadPreview } from "@/lib/data-layer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rawRows, fileName } = body;

    if (!Array.isArray(rawRows)) {
      return NextResponse.json({ error: "Invalid rows format: expected array" }, { status: 400 });
    }

    const { validRows, rejectedRows } = parseAndCleanBlinkitRows(rawRows);
    const preview = await generateUploadPreview(validRows, fileName || "upload.csv");
    preview.rows_rejected = rejectedRows.length;
    preview.rejected_rows = rejectedRows;
    preview.rows_total = rawRows.length;

    return NextResponse.json({ success: true, preview, validRows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error generating preview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
