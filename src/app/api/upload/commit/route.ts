import { NextRequest, NextResponse } from "next/server";
import { commitUploadTransaction } from "@/lib/data-layer";
import { CleanedBlinkitRow, HubSchema } from "@/lib/types";
import { getNotificationDispatcher } from "@/lib/notifications/notifier";
import { loadStore } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { validRows, rejectedRows, fileName, uploadedBy, forceErrorAfterHeader, hub } = body;

    const targetHub = hub || (Array.isArray(validRows) && validRows[0]?.hub);
    const hubResult = HubSchema.safeParse(targetHub);
    if (!hubResult.success) {
      return NextResponse.json(
        { error: "Invalid or missing hub: must be 'delhi' or 'kolkata'" },
        { status: 400 }
      );
    }

    if (!Array.isArray(validRows) || validRows.length === 0) {
      return NextResponse.json({ error: "No valid rows provided for commit" }, { status: 400 });
    }

    const { uploadId, preview } = await commitUploadTransaction(
      validRows as CleanedBlinkitRow[],
      fileName || "upload.csv",
      uploadedBy || "demand_team",
      Boolean(forceErrorAfterHeader),
      Array.isArray(rejectedRows) ? rejectedRows : []
    );

    const store = loadStore();
    const dispatcher = getNotificationDispatcher();

    // Trigger upload notification based strictly on new POs
    if (preview.pos_new > 0) {
      // Find the new PO headers from validRows
      const existingPoNumbers = new Set(
        store.po_header
          .filter((h) => h.first_upload_id !== uploadId)
          .map((h) => h.po_number)
      );
      const newRows = (validRows as CleanedBlinkitRow[]).filter((r) => !existingPoNumbers.has(r.po_number));
      const newPOMap = new Map<string, { po_number: string; facility_raw: string; expiry_date: string; total_amount: number; total_qty: number }>();
      newRows.forEach((r) => {
        if (!newPOMap.has(r.po_number)) {
          newPOMap.set(r.po_number, {
            po_number: r.po_number,
            facility_raw: r.facility_raw,
            expiry_date: r.expiry_date,
            total_amount: 0,
            total_qty: 0,
          });
        }
        const item = newPOMap.get(r.po_number)!;
        item.total_amount += r.total_amount;
        item.total_qty += r.units_ordered;
      });

      await dispatcher.notifyUploadSuccess(preview, store, Array.from(newPOMap.values()));
    }

    // Trigger state change alert separately (Fixes Check 32 & Item 6)
    if (preview.state_changes && preview.state_changes.length > 0) {
      await dispatcher.notifyStateChanges(preview.state_changes, store);
    }

    return NextResponse.json({
      success: true,
      uploadId,
      preview,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error committing upload";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
