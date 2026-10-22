import { describe, it, expect, beforeEach } from "vitest";
import { generateUploadPreview, commitUploadTransaction, DatabaseStore } from "../src/lib/db";
import { CleanedBlinkitRow } from "../src/lib/types";

describe("Phase 2 Upload Logic Bugs Suite", () => {
  let store: DatabaseStore;

  beforeEach(() => {
    store = {
      channels: [{ id: "blinkit", name: "Blinkit" }],
      po_header: [],
      po_line: [],
      po_plan: [],
      po_line_dispatch: [],
      sku_master: [],
      stock_snapshot: [],
      po_state_history: [],
      upload_log: [],
      notification_recipients: [],
      in_app_notifications: [],
      settings: { near_expiry_days: 7 },
    };
  });

  const sampleRow1: CleanedBlinkitRow = {
    channel_id: "blinkit",
    hub: "delhi",
    po_number: "PO-1001",
    facility_raw: "Ghaziabad Feeder - Warehouse",
    city: "Ghaziabad",
    facility_code: "",
    region: "NCR",
    order_date: "2026-10-17",
    expiry_date: "2026-10-31",
    appointment_date: null,
    po_state: "Unscheduled",
    item_id: "ITEM-A",
    name: "Item A",
    uom_text: "1 pc",
    upc: "UPC-A",
    units_ordered: 10,
    total_grn_quantity: 0,
    remaining_quantity: 10,
    landing_rate: 100,
    cost_price: 90,
    margin_percentage: 10,
    tax_value: 5,
    total_amount: 1000,
    mrp: 150,
    entity_vendor_legal_name: "BLINK COMMERCE PRIVATE LIMITED",
  };

  const sampleRow2: CleanedBlinkitRow = {
    ...sampleRow1,
    item_id: "ITEM-B",
    name: "Item B",
    upc: "UPC-B",
    units_ordered: 5,
    remaining_quantity: 5,
    landing_rate: 200,
    total_amount: 1000,
  };

  it("change detection flags modified line attributes even when PO header totals appear unchanged", async () => {
    // Initial commit of PO-1001 with ITEM-A (units: 10, amount: 1000)
    await commitUploadTransaction([sampleRow1], "initial.csv", "tester", store, false);

    // Second upload: total units still 10, but total_grn_quantity changed from 0 to 4 and remaining from 10 to 6
    const modifiedRow: CleanedBlinkitRow = {
      ...sampleRow1,
      total_grn_quantity: 4,
      remaining_quantity: 6,
    };

    const preview = generateUploadPreview([modifiedRow], "update.csv", store);
    expect(preview.pos_updated).toBe(1);
    expect(preview.pos_unchanged).toBe(0);
    expect(preview.field_changes?.["PO-1001"]).toContain("total_grn_quantity");
    expect(preview.field_changes?.["PO-1001"]).toContain("remaining_quantity");
  });

  it("merged header totals are computed over incoming lines plus non-overlapping existing lines", async () => {
    // Initial upload has ITEM-A (10 units, 1000) and ITEM-B (5 units, 1000) => total_qty: 15, total_amount: 2000
    await commitUploadTransaction([sampleRow1, sampleRow2], "upload1.csv", "tester", store, false);

    const poHeader1 = store.po_header.find((h) => h.po_number === "PO-1001");
    expect(poHeader1?.total_qty).toBe(15);
    expect(poHeader1?.total_amount).toBe(2000);
    expect(poHeader1?.region).toBe("NCR");

    // Second upload contains ONLY ITEM-A updated to 12 units (amount 1200)
    // Merged set: ITEM-A (12 units, 1200) + existing ITEM-B (5 units, 1000) => total_qty: 17, total_amount: 2200
    const updatedRowA: CleanedBlinkitRow = {
      ...sampleRow1,
      units_ordered: 12,
      remaining_quantity: 12,
      total_amount: 1200,
    };

    await commitUploadTransaction([updatedRowA], "upload2.csv", "tester", store, false);

    const poHeader2 = store.po_header.find((h) => h.po_number === "PO-1001");
    expect(poHeader2?.total_qty).toBe(17);
    expect(poHeader2?.total_amount).toBe(2200);

    // Verify existing lines are intact in po_line
    const linesForPo = store.po_line.filter((l) => l.po_number === "PO-1001");
    expect(linesForPo).toHaveLength(2);
  });

  it("records rejected rows in preview and upload_log audit trail", async () => {
    const rejectedRows = [
      {
        row_number: 2,
        po_number: "PO-ERR",
        item_id: "BAD",
        reason: "Duplicate PO/item row",
      },
    ];

    const { uploadId, preview } = await commitUploadTransaction(
      [sampleRow1],
      "with_rejections.csv",
      "tester",
      store,
      false,
      rejectedRows
    );

    expect(preview.rows_rejected).toBe(1);
    expect(preview.rejected_rows).toHaveLength(1);
    expect(preview.rejected_rows[0].reason).toBe("Duplicate PO/item row");

    const log = store.upload_log.find((l) => l.id === uploadId);
    expect(log).toBeDefined();
    expect(log?.rows_rejected).toBe(1);
    expect(log?.error_report).toHaveLength(1);
    expect(log?.error_report[0].reason).toBe("Duplicate PO/item row");
  });
});
