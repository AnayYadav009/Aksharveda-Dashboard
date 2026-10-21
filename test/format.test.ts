import { describe, it, expect } from "vitest";
import { formatINR, formatUnits, formatDate, daysLeft } from "../src/lib/format";

describe("Formatting Helpers Suite (src/lib/format.ts)", () => {
  describe("formatINR", () => {
    it("correctly applies Indian grouping notation (3 then groups of 2)", () => {
      expect(formatINR(0)).toBe("₹0");
      expect(formatINR(500)).toBe("₹500");
      expect(formatINR(1000)).toBe("₹1,000");
      expect(formatINR(10000)).toBe("₹10,000");
      expect(formatINR(100000)).toBe("₹1,00,000");
      expect(formatINR(1000000)).toBe("₹10,00,000");
      expect(formatINR(10000000)).toBe("₹1,00,00,000");
      expect(formatINR(60314416)).toBe("₹6,03,14,416");
    });

    it("supports negative numbers and options", () => {
      expect(formatINR(-50000)).toBe("-₹50,000");
      expect(formatINR(12345.678, { showDecimals: true })).toBe("₹12,345.68");
      expect(formatINR(1234567, { includeSymbol: false })).toBe("12,34,567");
    });

    it("handles null and undefined gracefully", () => {
      expect(formatINR(null)).toBe("₹0");
      expect(formatINR(undefined)).toBe("₹0");
    });
  });

  describe("formatUnits", () => {
    it("formats quantity with Indian grouping and unit suffix", () => {
      expect(formatUnits(224224)).toBe("2,24,224 units");
      expect(formatUnits(0)).toBe("0 units");
      expect(formatUnits(5000, "cases")).toBe("5,000 cases");
      expect(formatUnits(null)).toBe("0 units");
    });
  });

  describe("formatDate", () => {
    it("formats date to IST short month day format (e.g., '17 Oct')", () => {
      // 2026-10-17 00:00:00 UTC = 2026-10-17 IST
      expect(formatDate("2026-10-17")).toBe("17 Oct");
      expect(formatDate("2026-10-31")).toBe("31 Oct");
      expect(formatDate("2026-11-04")).toBe("4 Nov");
    });

    it("formats full date with year when specified", () => {
      expect(formatDate("2026-10-17", "full")).toBe("17 Oct 2026");
    });

    it("handles blanks and invalid inputs", () => {
      expect(formatDate("")).toBe("—");
      expect(formatDate(null)).toBe("—");
      expect(formatDate("invalid-date")).toBe("—");
    });
  });

  describe("daysLeft", () => {
    const mockToday = new Date("2026-10-19T10:00:00+05:30");

    it("correctly calculates days remaining relative to IST date", () => {
      const todayRes = daysLeft("2026-10-19", mockToday);
      expect(todayRes.days).toBe(0);
      expect(todayRes.label).toBe("Expires Today");
      expect(todayRes.isUrgent).toBe(true);
      expect(todayRes.isExpired).toBe(false);

      const oneDayRes = daysLeft("2026-10-20", mockToday);
      expect(oneDayRes.days).toBe(1);
      expect(oneDayRes.label).toBe("1 day left");
      expect(oneDayRes.isUrgent).toBe(true);

      const urgentRes = daysLeft("2026-10-26", mockToday);
      expect(urgentRes.days).toBe(7);
      expect(urgentRes.label).toBe("7 days left");
      expect(urgentRes.isUrgent).toBe(true);

      const futureRes = daysLeft("2026-10-27", mockToday);
      expect(futureRes.days).toBe(8);
      expect(futureRes.label).toBe("8 days left");
      expect(futureRes.isUrgent).toBe(false);
    });

    it("correctly identifies expired dates", () => {
      const pastRes = daysLeft("2026-10-15", mockToday);
      expect(pastRes.days).toBe(-4);
      expect(pastRes.label).toBe("Expired (4d ago)");
      expect(pastRes.isExpired).toBe(true);
      expect(pastRes.isUrgent).toBe(false);
    });
  });
});
