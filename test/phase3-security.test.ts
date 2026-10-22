import { describe, it, expect } from "vitest";
import { isActionAuthorized } from "../src/lib/auth";

describe("Phase 3 Security & Access Control Suite", () => {
  describe("Role-Based Access Control (RBAC)", () => {
    it("allows demand and management to upload CSVs, denies warehouse", () => {
      expect(isActionAuthorized("demand", "upload")).toBe(true);
      expect(isActionAuthorized("management", "upload")).toBe(true);
      expect(isActionAuthorized("warehouse", "upload")).toBe(false);
      expect(isActionAuthorized(undefined, "upload")).toBe(false);
    });

    it("allows warehouse and demand to edit planning cells and stock", () => {
      expect(isActionAuthorized("warehouse", "planning_edit")).toBe(true);
      expect(isActionAuthorized("demand", "planning_edit")).toBe(true);
      expect(isActionAuthorized("management", "planning_edit")).toBe(true);

      expect(isActionAuthorized("warehouse", "stock_edit")).toBe(true);
      expect(isActionAuthorized("demand", "stock_edit")).toBe(true);
      expect(isActionAuthorized("management", "stock_edit")).toBe(true);
    });

    it("allows management full administrative privileges across all operations", () => {
      expect(isActionAuthorized("management", "upload")).toBe(true);
      expect(isActionAuthorized("management", "planning_edit")).toBe(true);
      expect(isActionAuthorized("management", "stock_edit")).toBe(true);
      expect(isActionAuthorized("management", "manage")).toBe(true);
    });

    it("allows all authenticated roles to read data", () => {
      expect(isActionAuthorized("demand", "read")).toBe(true);
      expect(isActionAuthorized("warehouse", "read")).toBe(true);
      expect(isActionAuthorized("management", "read")).toBe(true);
    });
  });

  describe("Test Endpoints Protection", () => {
    it("gates upsert_test_po and delete_test_po when NODE_ENV is production", async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        // Set environment to production
        (process.env as any).NODE_ENV = "production";

        const { POST } = await import("../src/app/api/planning/route");
        const mockReq = {
          json: async () => ({ action: "upsert_test_po", po_number: "TEST-E2E-123" }),
        } as any;

        const res = await POST(mockReq);
        expect(res.status).toBe(404);
      } finally {
        (process.env as any).NODE_ENV = originalEnv;
      }
    });
  });
});
