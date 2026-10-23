import { describe, expect, it } from "vitest";
import { canManageUsers, isMissingProfilesTable, shouldRejectLastManagerDemotion } from "../src/lib/admin-auth";

describe("management access safeguards", () => {
  it("allows only management users to administer profiles", () => {
    expect(canManageUsers("management")).toBe(true);
    expect(canManageUsers("demand")).toBe(false);
    expect(canManageUsers("pending")).toBe(false);
    expect(canManageUsers(undefined)).toBe(false);
  });

  it("blocks the last manager from demoting themselves", () => {
    expect(shouldRejectLastManagerDemotion("management", "demand", 1, "user-1", "user-1")).toBe(true);
    expect(shouldRejectLastManagerDemotion("management", "demand", 2, "user-1", "user-1")).toBe(false);
    expect(shouldRejectLastManagerDemotion("management", "demand", 1, "user-2", "user-1")).toBe(false);
    expect(shouldRejectLastManagerDemotion("demand", "pending", 1, "user-1", "user-1")).toBe(false);
  });

  it("recognizes missing-table errors from Postgres and PostgREST", () => {
    expect(isMissingProfilesTable({ code: "42P01" })).toBe(true);
    expect(isMissingProfilesTable({ code: "PGRST205" })).toBe(true);
    expect(isMissingProfilesTable({ code: "42501" })).toBe(false);
  });
});
