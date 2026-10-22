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

    it("allows all authenticated roles to read data, but strictly denies pending", () => {
      expect(isActionAuthorized("demand", "read")).toBe(true);
      expect(isActionAuthorized("warehouse", "read")).toBe(true);
      expect(isActionAuthorized("management", "read")).toBe(true);
      expect(isActionAuthorized("pending", "read")).toBe(false);
    });

    it("strictly denies pending role any permission or action", () => {
      expect(isActionAuthorized("pending", "upload")).toBe(false);
      expect(isActionAuthorized("pending", "planning_edit")).toBe(false);
      expect(isActionAuthorized("pending", "stock_edit")).toBe(false);
      expect(isActionAuthorized("pending", "manage")).toBe(false);
      expect(isActionAuthorized("pending", "read")).toBe(false);
    });
  });

  describe("API Protection for Pending Role", () => {
    it("blocks pending user from /api/pos with 403 Forbidden", async () => {
      const { GET } = await import("../src/app/api/pos/route");
      const req = {
        nextUrl: new URL("http://localhost:3000/api/pos?hub=delhi"),
        headers: new Headers({ "x-test-role": "pending" }),
      } as any;

      const res = await GET(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("Forbidden");
    });

    it("allows demand, warehouse, and management users to access /api/pos", async () => {
      const { GET } = await import("../src/app/api/pos/route");
      for (const role of ["demand", "warehouse", "management"]) {
        const req = {
          nextUrl: new URL("http://localhost:3000/api/pos?hub=delhi"),
          headers: new Headers({ "x-test-role": role }),
        } as any;

        const res = await GET(req);
        expect(res.status).toBe(200);
      }
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

