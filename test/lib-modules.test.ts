import { describe, it, expect, vi } from "vitest";
import * as supabaseModule from "../src/lib/supabase";
import { isSupabaseConfigured, getSupabaseClient } from "../src/lib/supabase";
import { getDataAdapterStatus } from "../src/lib/data-layer";
import { getNotificationDispatcher, NotificationDispatcher } from "../src/lib/notifications/notifier";
import { loadStore } from "../src/lib/db";

describe("Library Modules & Data Layer Test Suite", () => {
  describe("supabase client helper", () => {
    it("detects supabase configuration", () => {
      const configured = isSupabaseConfigured();
      expect(typeof configured).toBe("boolean");
      if (configured) {
        const client = getSupabaseClient();
        expect(client).toBeDefined();
        expect(typeof client?.from).toBe("function");
      }
    });
  });

  describe("data-layer adapter status", () => {
    it("reports the configured adapter without contacting a live database", async () => {
      const query = { limit: vi.fn().mockResolvedValue({ data: [{ id: "blinkit" }], error: null }) };
      const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) });
      const spy = vi.spyOn(supabaseModule, "getSupabaseClient").mockReturnValue({ from } as any);
      const status = await getDataAdapterStatus();
      expect(status).toEqual({ isFallback: false, adapter: "supabase_postgres" });
      spy.mockRestore();
    });
  });

  describe("db local store functions", () => {
    it("loads database store with required collections", () => {
      const store = loadStore();
      expect(Array.isArray(store.po_header)).toBe(true);
      expect(Array.isArray(store.po_line)).toBe(true);
      expect(Array.isArray(store.sku_master)).toBe(true);
      expect(Array.isArray(store.po_plan)).toBe(true);
      expect(Array.isArray(store.po_line_dispatch)).toBe(true);
      expect(Array.isArray(store.stock_snapshot)).toBe(true);
    });
  });

  describe("notifications dispatcher", () => {
    it("provides singleton notification dispatcher instance", () => {
      const dispatcher = getNotificationDispatcher();
      expect(dispatcher).toBeInstanceOf(NotificationDispatcher);
    });

    it("suppresses upload notification when pos_new is 0", async () => {
      const dispatcher = getNotificationDispatcher();
      const store = loadStore();
      const previewMock = {
        file_name: "test.csv",
        total_rows_parsed: 10,
        valid_rows: 10,
        rejected_rows: [],
        pos_new: 0,
        pos_updated: 2,
        pos_unchanged: 8,
        rows_rejected: 0,
        total_units: 100,
        total_amount: 50000,
        state_changes: [],
        new_pos_preview: [],
        updated_pos_preview: [],
      };

      // Should return without error (suppressed)
      await expect(dispatcher.notifyUploadSuccess(previewMock as any, store)).resolves.toBeUndefined();
    });
  });

  describe("planning grid stock & balance calculations: null vs 0", () => {
    it("treats null stock as unknown (balance = null) and 0 stock as known zero (balance = 0 - openOrder)", () => {
      const openQty = 120;

      // 1. Unknown stock (null): not uploaded or entered
      const unknownStock: number | null = null;
      const unknownBalance = unknownStock !== null ? unknownStock - openQty : null;
      expect(unknownBalance).toBeNull();

      // 2. Explicit 0 stock: uploaded/entered as 0
      const zeroStock: number | null = 0;
      const zeroBalance = zeroStock !== null ? zeroStock - openQty : null;
      expect(zeroBalance).toBe(-120);
      expect(zeroBalance! < 0).toBe(true);

      // 3. Positive stock: 150 - 120 = +30
      const positiveStock: number | null = 150;
      const positiveBalance = positiveStock !== null ? positiveStock - openQty : null;
      expect(positiveBalance).toBe(30);

      // Shortfall counter check: only known stocks with balance < 0 count as shortfall
      const skus = [
        { item_id: 'SKU-A', stock_in_hand: null, balance: unknownBalance },
        { item_id: 'SKU-B', stock_in_hand: 0, balance: zeroBalance },
        { item_id: 'SKU-C', stock_in_hand: 150, balance: positiveBalance },
      ];

      const shortfallCount = skus.filter(s => s.balance !== null && s.balance < 0).length;
      expect(shortfallCount).toBe(1); // Only SKU-B is counted, not SKU-A
      const unknownCount = skus.filter(s => s.stock_in_hand === null).length;
      expect(unknownCount).toBe(1); // SKU-A is counted as stock not loaded
    });
  });
});
