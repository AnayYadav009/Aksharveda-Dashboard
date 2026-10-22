import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { parseAndCleanBlinkitRows } from "../src/lib/parser";
import { commitUploadTransaction, DatabaseStore } from "../src/lib/db";

describe("CSV Reconciliation & Domain Integrity Suite", () => {
  it("reconciles raw CSV sums with store import", async () => {
    const realCsv = path.join(process.cwd(), "sample-data", "bulk_po_csv-3672559.csv");
    const anonCsv = path.join(process.cwd(), "sample-data", "sample_po_anonymized.csv");
    const csvPath = fs.existsSync(realCsv) ? realCsv : anonCsv;
    expect(fs.existsSync(csvPath)).toBe(true);

    const rawCsv = fs.readFileSync(csvPath, "utf-8");

    // Independent plain parser
    const parsed = Papa.parse<Record<string, unknown>>(rawCsv, {
      header: true,
      skipEmptyLines: "greedy",
      dynamicTyping: false,
    });

    const rawRows = parsed.data;
    expect(rawRows.length).toBe(2124);

    let rawTotalUnits = 0;
    let rawTotalAmount = 0;
    const rawPoSet = new Set<string>();

    rawRows.forEach((r) => {
      rawTotalUnits += Number(r.units_ordered) || 0;
      rawTotalAmount += Number(r.total_amount) || 0;
      if (r.po_number) {
        rawPoSet.add(String(r.po_number).trim());
      }
    });

    // Assert source baseline numbers
    expect(rawPoSet.size).toBe(389);
    expect(rawTotalUnits).toBe(224224);
    expect(rawTotalAmount).toBe(60314416);

    // Import into clean isolated store
    const { validRows, rejectedRows } = parseAndCleanBlinkitRows(rawRows);
    expect(rejectedRows).toHaveLength(0);
    expect(validRows).toHaveLength(2124);

    const testStore: DatabaseStore = {
      channels: [{ id: "blinkit", name: "Blinkit" }],
      upload_log: [],
      po_header: [],
      po_line: [],
      sku_master: [],
      po_plan: [],
      po_line_dispatch: [],
      stock_snapshot: [],
      po_state_history: [],
      settings: { near_expiry_days: 7, default_recent_days: 30 },
      notification_recipients: [],
      in_app_notifications: [],
    };

    const { preview } = await commitUploadTransaction(
      validRows,
      "reconciliation_test.csv",
      "test_runner",
      testStore,
      false
    );

    // Assert Reconciliation Totals in Preview
    expect(preview.pos_total).toBe(389);
    expect(preview.pos_new).toBe(389);
    expect(preview.total_units).toBe(224224);
    expect(preview.total_amount).toBe(60314416);

    // Assert Reconciliation Totals in Database Store
    expect(testStore.po_header.length).toBe(389);
    expect(testStore.po_line.length).toBe(2124);

    const storeHeaderUnits = testStore.po_header.reduce((acc, h) => acc + h.total_qty, 0);
    const storeHeaderAmount = testStore.po_header.reduce((acc, h) => acc + h.total_amount, 0);
    expect(storeHeaderUnits).toBe(224224);
    expect(storeHeaderAmount).toBe(60314416);

    const storeLineUnits = testStore.po_line.reduce((acc, l) => acc + l.units_ordered, 0);
    const storeLineAmount = testStore.po_line.reduce((acc, l) => acc + l.total_amount, 0);
    expect(storeLineUnits).toBe(224224);
    expect(storeLineAmount).toBe(60314416);

    // Assert Reconciliation Totals in Upload Log
    expect(testStore.upload_log).toHaveLength(1);
    expect(testStore.upload_log[0].total_units).toBe(224224);
    expect(testStore.upload_log[0].total_amount).toBe(60314416);
  });

  it("guarantees idempotency and non-destruction of team planning data", async () => {
    const sample = [
      {
        channel_id: "blinkit",
        po_number: "51076110020473",
        facility_raw: "Surat S2 - Feeder Warehouse",
        city: "Surat",
        facility_code: "S2",
        order_date: "2026-10-17",
        expiry_date: "2026-11-01",
        appointment_date: null,
        po_state: "Unscheduled",
        item_id: "10241917",
        name: 'Brass Lakshmi Ganesh Idol (1.5") by Aksharveda(Box)',
        uom_text: "1 set",
        upc: "5949997615994",
        units_ordered: 24,
        total_grn_quantity: 0,
        remaining_quantity: 24,
        landing_rate: 485,
        cost_price: 461.9,
        margin_percentage: 53.77,
        tax_value: 5,
        total_amount: 11640,
        mrp: 1049,
        entity_vendor_legal_name: "BLINK COMMERCE PRIVATE LIMITED",
      },
    ];

    const testStore: DatabaseStore = {
      channels: [{ id: "blinkit", name: "Blinkit" }],
      upload_log: [],
      po_header: [],
      po_line: [],
      sku_master: [],
      po_plan: [],
      po_line_dispatch: [],
      stock_snapshot: [],
      po_state_history: [],
      settings: { near_expiry_days: 7, default_recent_days: 30 },
      notification_recipients: [],
      in_app_notifications: [],
    };

    // First upload
    const res1 = await commitUploadTransaction(sample, "test1.csv", "tester", testStore, false);
    expect(res1.preview.pos_new).toBe(1);
    expect(testStore.po_plan).toHaveLength(1);

    // Ops team enters custom remarks and dispatch date
    testStore.po_plan[0].remarks = "Urgent Surat Diwali order";
    testStore.po_plan[0].internal_dispatch_date = "2026-10-20";

    // Second upload (idempotent)
    const res2 = await commitUploadTransaction(sample, "test1.csv", "tester", testStore, false);
    expect(res2.preview.pos_new).toBe(0);
    expect(res2.preview.pos_unchanged).toBe(1);

    // Verify team data remained untouched
    expect(testStore.po_plan[0].remarks).toBe("Urgent Surat Diwali order");
    expect(testStore.po_plan[0].internal_dispatch_date).toBe("2026-10-20");

    // Verify state transition audit history
    const stateChangeRow = [{ ...sample[0], po_state: "Scheduled" }];
    const res3 = await commitUploadTransaction(stateChangeRow, "test2.csv", "tester", testStore, false);
    expect(res3.preview.pos_updated).toBe(1);
    expect(testStore.po_state_history).toHaveLength(1);
    expect(testStore.po_state_history[0].old_state).toBe("Unscheduled");
    expect(testStore.po_state_history[0].new_state).toBe("Scheduled");
  });
});
