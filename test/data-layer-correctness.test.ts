import { describe, it, expect, vi } from "vitest";
import { commitUploadTransaction, getDashboardData } from "../src/lib/data-layer";
import * as supabaseModule from "../src/lib/supabase";
import { CleanedBlinkitRow } from "../src/lib/types";

describe("Phase 1 Data Layer Integrity Suite", () => {
  it("throws on Supabase errors and does not swallow them", async () => {
    const errorMsg = "Database connection timed out";
    const createQueryChain = (hasError = false) => ({
      range: vi.fn().mockImplementation(() => {
        if (hasError) return Promise.resolve({ data: null, error: new Error(errorMsg) });
        return Promise.resolve({ data: [], error: null });
      }),
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
          eq: vi.fn().mockImplementation(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { value: 7 }, error: null }),
          })),
          limit: vi.fn().mockResolvedValue({ data: [{ id: "blinkit" }], error: null }),
        })),
      })),
    };

    const spy = vi.spyOn(supabaseModule, "getSupabaseClient").mockReturnValue(mockSupabase as any);

    const result = await getDashboardData({ view: "month", month: "2026-10", paginate: false });
    expect(result.summary.total_pos).toBe(1500);
    expect(result.pos.length).toBe(1500);

    spy.mockRestore();
  });

  it("respects foreign-key order during commit: upload_log -> sku_master -> po_header -> po_line -> po_plan", async () => {
    const callOrder: string[] = [];

    const createQueryChain = () => ({
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
      order: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
      limit: vi.fn().mockResolvedValue({ data: [{ id: "blinkit" }], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: { value: 7 }, error: null }),
    });

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

    const sampleRow: CleanedBlinkitRow = {
      channel_id: "blinkit",
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
  });
});
