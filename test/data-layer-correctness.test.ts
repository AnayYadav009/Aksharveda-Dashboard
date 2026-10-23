import { describe, it, expect, vi } from "vitest";
import { commitUploadTransaction, getDashboardData } from "../src/lib/data-layer";
import * as supabaseModule from "../src/lib/supabase";
import { CleanedBlinkitRow } from "../src/lib/types";

vi.mock("../src/lib/db", async (importOriginal) => {
  const db = await importOriginal<typeof import("../src/lib/db")>();
  return { ...db, saveStore: vi.fn() };
});

describe("Phase 1 Data Layer Integrity Suite", () => {
  it("throws on Supabase errors and does not swallow them", async () => {
    const errorMsg = "Database connection timed out";
    const createQueryChain = (hasError = false) => ({
      range: vi.fn().mockImplementation(() => {
        if (hasError) return Promise.resolve({ data: null, error: new Error(errorMsg) });
        return Promise.resolve({ data: [], error: null });
      }),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
      limit: vi.fn().mockResolvedValue({ data: [{ id: "blinkit" }], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: { value: 7 }, error: null }),
    });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => ({
        select: vi.fn().mockImplementation(() => createQueryChain(false)),
        insert: vi.fn().mockImplementation(() => {
          if (table === "upload_log") {
            return Promise.resolve({ error: new Error(errorMsg) });
          }
          return Promise.resolve({ error: null });
        }),
        upsert: vi.fn().mockResolvedValue({ error: new Error(errorMsg) }),
        delete: vi.fn().mockImplementation(() => ({
          in: vi.fn().mockResolvedValue({ error: null }),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      })),
    };

    const spy = vi.spyOn(supabaseModule, "getSupabaseClient").mockReturnValue(mockSupabase as any);

    const sampleRow: CleanedBlinkitRow = {
      channel_id: "blinkit",
      hub: "delhi",
      po_number: "999888777",
      facility_raw: "Delhi Hub",
      city: "Delhi",
      facility_code: "D1",
      order_date: "2026-10-20",
      expiry_date: "2026-10-30",
      appointment_date: null,
      po_state: "Unscheduled",
      item_id: "ITEM123",
      name: "Diya Set",
      uom_text: "1 pc",
      upc: "UPC123",
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

    await expect(
      commitUploadTransaction([sampleRow], "test.csv", "tester")
    ).rejects.toThrow();

    spy.mockRestore();
  });

  it("reads back >1000 rows across PostgREST 1000-row pagination without truncation", async () => {
    const { invalidateDataCache } = await import("../src/lib/data-layer");
    invalidateDataCache();

    // Generate 1500 mock headers
    const mockHeaders = Array.from({ length: 1500 }, (_, i) => ({
      channel_id: "blinkit",
      hub: "delhi",
      po_number: `PO-${100000 + i}`,
      facility_raw: "Delhi Hub",
      city: "Delhi",
      facility_code: "D1",
      order_date: "2026-10-15",
      expiry_date: "2026-10-25",
      appointment_date: null,
      po_state: "Unscheduled",
      total_qty: 10,
      total_amount: 500,
      first_seen_at: "2026-10-15T00:00:00Z",
      last_seen_at: "2026-10-15T00:00:00Z",
      is_deleted: false,
    }));

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => ({
        select: vi.fn().mockImplementation((cols: string) => ({
          range: vi.fn().mockImplementation((from: number, to: number) => {
            const slice = mockHeaders.slice(from, to + 1);
            return Promise.resolve({ data: slice, error: null });
          }),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { value: 7 }, error: null }),
          limit: vi.fn().mockResolvedValue({ data: [{ id: "blinkit" }], error: null }),
        })),
      })),
    };

    const spy = vi.spyOn(supabaseModule, "getSupabaseClient").mockReturnValue(mockSupabase as any);

    const result = await getDashboardData({ hub: "delhi", view: "month", month: "2026-10", paginate: false });
    expect(result.summary.total_pos).toBe(1500);
    expect(result.pos.length).toBe(1500);

    spy.mockRestore();
  });

  it("respects foreign-key order during commit: upload_log -> sku_master -> po_header -> po_line -> po_plan", async () => {
    const callOrder: string[] = [];

    const createQueryChain = () => {
      const chain: any = {
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        in: vi.fn().mockImplementation(() => chain),
        limit: vi.fn().mockResolvedValue({ data: [{ id: "blinkit" }], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: { value: 7 }, error: null }),
      };
      // Allow awaiting chain directly
      chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
      return chain;
    };

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => ({
        select: vi.fn().mockImplementation(() => createQueryChain()),
        insert: vi.fn().mockImplementation(() => {
          callOrder.push(`insert:${table}`);
          return Promise.resolve({ error: null });
        }),
        upsert: vi.fn().mockImplementation(() => {
          callOrder.push(`upsert:${table}`);
          return Promise.resolve({ error: null });
        }),
        delete: vi.fn().mockImplementation(() => ({
          in: vi.fn().mockResolvedValue({ error: null }),
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      })),
    };

    const spy = vi.spyOn(supabaseModule, "getSupabaseClient").mockReturnValue(mockSupabase as any);

    const dbModule = await import("../src/lib/db");
    const mirrorStore = {
      channels: [{ id: "blinkit", name: "Blinkit" }],
      upload_log: [], po_header: [], po_line: [], sku_master: [], po_plan: [],
      po_line_dispatch: [], stock_snapshot: [], po_state_history: [],
      settings: {}, notification_recipients: [], in_app_notifications: [],
    } as any;
    const loadMirrorSpy = vi.spyOn(dbModule, "loadStore").mockReturnValue(mirrorStore);
    const saveMirrorSpy = vi.spyOn(dbModule, "saveStore").mockImplementation(() => {});

    const sampleRow: CleanedBlinkitRow = {
      channel_id: "blinkit",
      hub: "delhi",
      po_number: "PO-FK-TEST",
      facility_raw: "Delhi Hub",
      city: "Delhi",
      facility_code: "D1",
      order_date: "2026-10-20",
      expiry_date: "2026-10-30",
      appointment_date: null,
      po_state: "Unscheduled",
      item_id: "ITEM-FK",
      name: "Incense Box",
      uom_text: "1 pc",
      upc: "UPC-FK",
      units_ordered: 5,
      total_grn_quantity: 0,
      remaining_quantity: 5,
      landing_rate: 50,
      cost_price: 45,
      margin_percentage: 10,
      tax_value: 5,
      total_amount: 250,
      mrp: 75,
      entity_vendor_legal_name: "BLINK COMMERCE PRIVATE LIMITED",
    };

    await commitUploadTransaction([sampleRow], "fk_test.csv", "tester");

    // Foreign-key order verification:
    // 1. upload_log
    // 2. sku_master
    // 3. po_header
    // 4. po_line
    // 5. po_plan (for new POs)
    expect(callOrder.slice(0, 5)).toEqual([
      "insert:upload_log",
      "upsert:sku_master",
      "upsert:po_header",
      "upsert:po_line",
      "insert:po_plan",
    ]);

    spy.mockRestore();
    loadMirrorSpy.mockRestore();
    saveMirrorSpy.mockRestore();
  });

  it("handles the same PO number across Delhi and Kolkata independently and prevents re-upload overwrite across hubs", async () => {
    const { commitUploadTransaction: localCommit } = await import("../src/lib/db");
    const { getDashboardData: liveGetDashboardData } = await import("../src/lib/data-layer");
    const dbModule = await import("../src/lib/db");

    const store: any = {
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
      settings: { near_expiry_days: 7, default_recent_days: 30 },
    };

    const dataLayerModule = await import("../src/lib/data-layer");
    dataLayerModule.invalidateDataCache();
    const supabaseSpy = vi.spyOn(supabaseModule, "getSupabaseClient").mockReturnValue(null as any);

    const loadStoreSpy = vi.spyOn(dbModule, "loadStore").mockImplementation(() => store);
    const saveStoreSpy = vi.spyOn(dbModule, "saveStore").mockImplementation((newStore) => {
      Object.assign(store, newStore);
    });

    const delhiRow: CleanedBlinkitRow = {
      channel_id: "blinkit",
      hub: "delhi",
      po_number: "PO-SHARED-999",
      facility_raw: "Delhi Hub Warehouse",
      city: "Delhi",
      facility_code: "D1",
      region: "NCR",
      order_date: "2026-10-20",
      expiry_date: "2026-10-30",
      appointment_date: null,
      po_state: "Unscheduled",
      item_id: "ITEM-DELHI",
      name: "Delhi Diya",
      uom_text: "1 pc",
      upc: "UPC-DELHI",
      units_ordered: 100,
      total_grn_quantity: 0,
      remaining_quantity: 100,
      landing_rate: 50,
      cost_price: 45,
      margin_percentage: 10,
      tax_value: 5,
      total_amount: 5000,
      mrp: 75,
      entity_vendor_legal_name: "BLINK COMMERCE PRIVATE LIMITED",
    };

    const kolkataRow: CleanedBlinkitRow = {
      channel_id: "blinkit",
      hub: "kolkata",
      po_number: "PO-SHARED-999",
      facility_raw: "Kolkata Hub Warehouse",
      city: "Kolkata",
      facility_code: "K1",
      region: "East",
      order_date: "2026-10-21",
      expiry_date: "2026-10-31",
      appointment_date: null,
      po_state: "Unscheduled",
      item_id: "ITEM-KOLKATA",
      name: "Kolkata Candle",
      uom_text: "1 set",
      upc: "UPC-KOLKATA",
      units_ordered: 250,
      total_grn_quantity: 0,
      remaining_quantity: 250,
      landing_rate: 80,
      cost_price: 70,
      margin_percentage: 12,
      tax_value: 5,
      total_amount: 20000,
      mrp: 120,
      entity_vendor_legal_name: "BLINK COMMERCE PRIVATE LIMITED",
    };

    // 1. Upload Delhi row
    await localCommit([delhiRow], "delhi_upload.csv", "delhi_team", store, false);

    // 2. Upload Kolkata row with same PO number
    await localCommit([kolkataRow], "kolkata_upload.csv", "kolkata_team", store, false);

    // 3. Assert both headers exist independently in the store
    expect(store.po_header).toHaveLength(2);
    const storedDelhiHeader = store.po_header.find((h: any) => h.hub === "delhi");
    const storedKolkataHeader = store.po_header.find((h: any) => h.hub === "kolkata");

    expect(storedDelhiHeader.po_number).toBe("PO-SHARED-999");
    expect(storedDelhiHeader.total_qty).toBe(100);
    expect(storedDelhiHeader.total_amount).toBe(5000);

    expect(storedKolkataHeader.po_number).toBe("PO-SHARED-999");
    expect(storedKolkataHeader.total_qty).toBe(250);
    expect(storedKolkataHeader.total_amount).toBe(20000);

    // 4. Assert dashboard filtering by hub isolates rows
    const { updatePlanningRow } = await import("../src/lib/data-layer");

    try {
      // 4. Assert dashboard filtering by hub isolates rows
      const delhiDash = await liveGetDashboardData({ hub: "delhi", view: "month", month: "2026-10", paginate: false });
      expect(delhiDash.summary.total_pos).toBe(1);
      expect(delhiDash.pos[0].total_qty).toBe(100);

      const kolkataDash = await liveGetDashboardData({ hub: "kolkata", view: "month", month: "2026-10", paginate: false });
      expect(kolkataDash.summary.total_pos).toBe(1);
      expect(kolkataDash.pos[0].total_qty).toBe(250);

      // 5. Add team-owned remarks to Kolkata's PO plan
      await updatePlanningRow({
        hub: "kolkata",
        po_number: "PO-SHARED-999",
        remarks: "Urgent Kolkata delivery",
      });

      const kolkataPlanBefore = store.po_plan.find((p: any) => p.hub === "kolkata" && p.po_number === "PO-SHARED-999");
      expect(kolkataPlanBefore.remarks).toBe("Urgent Kolkata delivery");

      // 6. Re-upload Delhi row with updated quantities and state
      const updatedDelhiRow: CleanedBlinkitRow = {
        ...delhiRow,
        units_ordered: 120,
        remaining_quantity: 120,
        total_amount: 6000,
        po_state: "Confirmed",
      };
      await localCommit([updatedDelhiRow], "delhi_reupload.csv", "delhi_team", store, false);

      // 7. Verify Delhi PO was updated
      const delhiHeaderAfter = store.po_header.find((h: any) => h.hub === "delhi");
      expect(delhiHeaderAfter.total_qty).toBe(120);
      expect(delhiHeaderAfter.total_amount).toBe(6000);
      expect(delhiHeaderAfter.po_state).toBe("Confirmed");

      // 8. Verify Kolkata PO, lines, and plan remarks were NOT touched at all
      const kolkataHeaderAfter = store.po_header.find((h: any) => h.hub === "kolkata");
      expect(kolkataHeaderAfter.total_qty).toBe(250);
      expect(kolkataHeaderAfter.total_amount).toBe(20000);
      expect(kolkataHeaderAfter.po_state).toBe("Unscheduled");

      const kolkataLinesAfter = store.po_line.filter((l: any) => l.hub === "kolkata");
      expect(kolkataLinesAfter).toHaveLength(1);
      expect(kolkataLinesAfter[0].units_ordered).toBe(250);

      const kolkataPlanAfter = store.po_plan.find((p: any) => p.hub === "kolkata" && p.po_number === "PO-SHARED-999");
      expect(kolkataPlanAfter.remarks).toBe("Urgent Kolkata delivery");
    } finally {
      supabaseSpy.mockRestore();
      loadStoreSpy.mockRestore();
      saveStoreSpy.mockRestore();
      dataLayerModule.invalidateDataCache();
    }
  });
});
