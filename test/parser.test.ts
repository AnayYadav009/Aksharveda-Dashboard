import { describe, it, expect } from "vitest";
import {
  normalizeVendorLegalName,
  parseFacilityName,
  parseBlinkitDateToIST,
  calculateDaysToExpiry,
  parseAndCleanBlinkitRows,
} from "../src/lib/parser";

describe("Parser & Quirks Cleaning Suite", () => {
  describe("normalizeVendorLegalName", () => {
    it("strips outer quotes and normalizes casing to uppercase", () => {
      expect(normalizeVendorLegalName('"""BLINK COMMERCE PRIVATE LIMITED"""')).toBe("BLINK COMMERCE PRIVATE LIMITED");
      expect(normalizeVendorLegalName('"Blink Commerce Private Limited"')).toBe("BLINK COMMERCE PRIVATE LIMITED");
      expect(normalizeVendorLegalName("blink commerce private limited")).toBe("BLINK COMMERCE PRIVATE LIMITED");
      expect(normalizeVendorLegalName("  'Blink Commerce'  ")).toBe("BLINK COMMERCE");
    });
  });

  describe("parseFacilityName", () => {
    it("correctly extracts city, facility_code, and raw text", () => {
      const res1 = parseFacilityName("Patna P2 - Feeder Warehouse");
      expect(res1.city).toBe("Patna");
      expect(res1.facility_code).toBe("P2");
      expect(res1.facility_raw).toBe("Patna P2 - Feeder Warehouse");

      const res2 = parseFacilityName("Surat S2 - Feeder Warehouse");
      expect(res2.city).toBe("Surat");
      expect(res2.facility_code).toBe("S2");

      const res3 = parseFacilityName("Kolkata K5 - Feeder Warehouse");
      expect(res3.city).toBe("Kolkata");
      expect(res3.facility_code).toBe("K5");
    });

    it("gracefully falls back if format doesn't match standard feeder warehouse pattern", () => {
      const res = parseFacilityName("Bengaluru Central Hub");
      expect(res.city).toBe("Bengaluru");
      expect(res.facility_code).toBe("");
    });
  });

  describe("parseBlinkitDateToIST", () => {
    it("parses 00:00:00 UTC order dates properly", () => {
      const parsed = parseBlinkitDateToIST("2026-10-17 00:00:00 +0000 UTC");
      expect(parsed).toBe("2026-10-17");
    });

    it("parses 18:29:59 UTC expiry date into same day IST end of day", () => {
      // 18:29:59 UTC on Oct 31 is 23:59:59 IST Oct 31 (same calendar day)
      const parsed = parseBlinkitDateToIST("2026-10-31 18:29:59 +0000 UTC");
      expect(parsed).toBe("2026-10-31");
    });

    it("returns null for blanks and undefined", () => {
      expect(parseBlinkitDateToIST("")).toBeNull();
      expect(parseBlinkitDateToIST("   ")).toBeNull();
      expect(parseBlinkitDateToIST(null)).toBeNull();
      expect(parseBlinkitDateToIST(undefined)).toBeNull();
    });
  });

  describe("calculateDaysToExpiry", () => {
    it("computes accurate days remaining", () => {
      const fixedBase = new Date("2026-10-19T10:00:00+05:30");
      expect(calculateDaysToExpiry("2026-10-26", fixedBase)).toBe(7);
      expect(calculateDaysToExpiry("2026-10-19", fixedBase)).toBe(0);
      expect(calculateDaysToExpiry("2026-10-15", fixedBase)).toBe(-4);
    });
  });

  describe("parseAndCleanBlinkitRows", () => {
    it("validates and accepts valid sample row", () => {
      const sample = [
        {
          po_number: "51076110020473",
          facility_name: "Surat S2 - Feeder Warehouse",
          manufacturer_name: "AKSHARVEDA LIFESTYLE PRIVATE LIMITED",
          entity_vendor_legal_name: '"""BLINK COMMERCE PRIVATE LIMITED"""',
          vendor_name: "AKSHARVEDA LIFESTYLE PRIVATE LIMITED",
          order_date: "2026-10-17 00:00:00 +0000 UTC",
          appointment_date: "",
          expiry_date: "2026-10-31 18:29:59 +0000 UTC",
          po_state: "Unscheduled",
          item_id: "10241917",
          name: "Brass Lakshmi Ganesh Idol (1.5\") by Aksharveda(Box)",
          uom_text: "1 set",
          upc: "5949997615994",
          units_ordered: "24",
          total_grn_quantity: "0",
          remaining_quantity: "24",
          landing_rate: "485",
          cost_price: "461.9",
          margin_percentage: "53.77",
          cess_value: "0",
          sgst_value: "2.5",
          igst_value: "5",
          cgst_value: "2.5",
          tax_value: "5",
          total_amount: "11640",
          mrp: "1049",
        },
      ];

      const { validRows, rejectedRows } = parseAndCleanBlinkitRows(sample);
      expect(rejectedRows).toHaveLength(0);
      expect(validRows).toHaveLength(1);
      const row = validRows[0];
      expect(row.po_number).toBe("51076110020473");
      expect(row.city).toBe("Surat");
      expect(row.facility_code).toBe("S2");
      expect(row.order_date).toBe("2026-10-17");
      expect(row.expiry_date).toBe("2026-10-31");
      expect(row.appointment_date).toBeNull();
      expect(row.entity_vendor_legal_name).toBe("BLINK COMMERCE PRIVATE LIMITED");
      expect(row.units_ordered).toBe(24);
      expect(row.total_amount).toBe(11640);
    });

    it("rejects rows missing required fields and preserves line numbers", () => {
      const badSample = [
        {
          po_number: "", // missing
          facility_name: "Surat S2 - Feeder Warehouse",
          order_date: "2026-10-17 00:00:00 +0000 UTC",
          expiry_date: "2026-10-31 18:29:59 +0000 UTC",
          po_state: "Unscheduled",
          item_id: "10241917",
          name: "Item",
        },
      ];
      const { validRows, rejectedRows } = parseAndCleanBlinkitRows(badSample);
      expect(validRows).toHaveLength(0);
      expect(rejectedRows).toHaveLength(1);
      expect(rejectedRows[0].row_number).toBe(2);
      expect(rejectedRows[0].reason).toContain("po_number");
    });

    it("rejects duplicate (po_number, item_id) rows within the same upload", () => {
      const baseRow = {
        po_number: "51076110020473",
        facility_name: "Surat S2 - Feeder Warehouse",
        manufacturer_name: "AKSHARVEDA LIFESTYLE PRIVATE LIMITED",
        entity_vendor_legal_name: "BLINK COMMERCE PRIVATE LIMITED",
        vendor_name: "AKSHARVEDA LIFESTYLE PRIVATE LIMITED",
        order_date: "2026-10-17 00:00:00 +0000 UTC",
        appointment_date: "",
        expiry_date: "2026-10-31 18:29:59 +0000 UTC",
        po_state: "Unscheduled",
        item_id: "10241917",
        name: "Brass Lakshmi Ganesh Idol",
        uom_text: "1 set",
        upc: "5949997615994",
        units_ordered: "24",
        total_grn_quantity: "0",
        remaining_quantity: "24",
        landing_rate: "485",
        cost_price: "461.9",
        margin_percentage: "53.77",
        cess_value: "0",
        sgst_value: "2.5",
        igst_value: "5",
        cgst_value: "2.5",
        tax_value: "5",
        total_amount: "11640",
        mrp: "1049",
      };

      const rows = [{ ...baseRow }, { ...baseRow }];
      const { validRows, rejectedRows } = parseAndCleanBlinkitRows(rows);
      expect(validRows).toHaveLength(1);
      expect(rejectedRows).toHaveLength(1);
      expect(rejectedRows[0].reason).toBe("Duplicate PO/item row");
      expect(rejectedRows[0].row_number).toBe(3);
    });

    it("rejects Excel-mangled scientific notation numbers for po_number and item_id", () => {
      const rowWithMangledPo = {
        po_number: "5.10761E+13",
        facility_name: "Surat S2 - Feeder Warehouse",
        order_date: "2026-10-17 00:00:00 +0000 UTC",
        expiry_date: "2026-10-31 18:29:59 +0000 UTC",
        po_state: "Unscheduled",
        item_id: "10241917",
        name: "Item",
        uom_text: "1 set",
        upc: "5949997615994",
        units_ordered: "24",
        total_grn_quantity: "0",
        remaining_quantity: "24",
        landing_rate: "485",
        cost_price: "461.9",
        margin_percentage: "53.77",
        tax_value: "5",
        total_amount: "11640",
        mrp: "1049",
      };

      const { validRows, rejectedRows } = parseAndCleanBlinkitRows([rowWithMangledPo]);
      expect(validRows).toHaveLength(0);
      expect(rejectedRows).toHaveLength(1);
      expect(rejectedRows[0].reason).toContain("Excel-mangled numeric identifier detected");
    });
  });

  describe("Facility Parsing & Region Mapping Edge Cases", () => {
    it("handles non-standard facility names and correctly maps NCR region", () => {
      const resGhaziabad = parseFacilityName("Ghaziabad Feeder - Warehouse");
      expect(resGhaziabad.city).toBe("Ghaziabad");
      expect(resGhaziabad.facility_code).toBe("");
      expect(resGhaziabad.region).toBe("NCR");

      const resDelhi = parseFacilityName("New Delhi Hub");
      expect(resDelhi.city).toBe("New Delhi");
      expect(resDelhi.facility_code).toBe("");
      expect(resDelhi.region).toBe("NCR");

      const resBhiwandi = parseFacilityName("Bhiwandi B1 - Feeder Warehouse");
      expect(resBhiwandi.city).toBe("Bhiwandi");
      expect(resBhiwandi.facility_code).toBe("B1");
      expect(resBhiwandi.region).toBe("Mumbai (Bhiwandi)");
    });
  });
});
