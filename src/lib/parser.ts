import { BlinkitCsvRow, CleanedBlinkitRow, RejectedRow, BlinkitCsvRowSchema } from "./types";

/**
 * Normalizes entity vendor legal name by stripping quotes and uppercasing.
 * E.g., '"""BLINK COMMERCE PRIVATE LIMITED"""' -> 'BLINK COMMERCE PRIVATE LIMITED'
 */
export function normalizeVendorLegalName(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/""+/g, '"')
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Region mapping for Northern and Western fulfillment hubs.
 */
export const CITY_REGION_MAP: Record<string, string> = {
  Delhi: "NCR",
  "New Delhi": "NCR",
  Gurgaon: "NCR",
  Gurugram: "NCR",
  Noida: "NCR",
  "Greater Noida": "NCR",
  Ghaziabad: "NCR",
  Faridabad: "NCR",
  Bhiwandi: "Mumbai (Bhiwandi)",
};

export function getRegionForCity(city: string): string | null {
  return CITY_REGION_MAP[city] || null;
}

/**
 * Extracts city and facility_code from facility_name.
 * Examples:
 * - "Patna P2 - Feeder Warehouse" -> city: "Patna", facility_code: "P2"
 * - "Ghaziabad Feeder - Warehouse" -> city: "Ghaziabad", facility_code: ""
 * - "New Delhi Hub" -> city: "New Delhi", facility_code: ""
 */
export function parseFacilityName(facilityName: string | undefined | null): {
  city: string;
  facility_code: string;
  facility_raw: string;
  region: string | null;
} {
  const facility_raw = (facilityName || "").trim();
  if (!facility_raw) {
    return { city: "Unknown", facility_code: "", facility_raw: "", region: null };
  }

  // Regex pattern: requiring one letter followed by digits (e.g. P2, K5, S12), no /i flag
  const match = facility_raw.match(/^([A-Za-z\s]+?)\s+([A-Z]\d+)\s*-\s*/);
  if (match) {
    const city = match[1].trim();
    return {
      city,
      facility_code: match[2].trim(),
      facility_raw,
      region: getRegionForCity(city),
    };
  }

  // Fallback: keep full text before " Feeder", " Hub", " Central", or "-" as the city
  const fallbackMatch = facility_raw.match(/^([^-\n]+?)(?:\s+(?:Feeder|Hub|Central)|\s*-|$)/i);
  let city = fallbackMatch && fallbackMatch[1].trim() ? fallbackMatch[1].trim() : facility_raw;
  // Clean up any remaining trailing tokens if needed
  city = city.replace(/\s+(Feeder|Hub|Central|Warehouse)$/i, "").trim();

  return {
    city: city || facility_raw,
    facility_code: "",
    facility_raw,
    region: getRegionForCity(city),
  };
}

/**
 * Converts a UTC timestamp string to an IST (Asia/Kolkata) calendar date string: YYYY-MM-DD.
 * Handles timestamps like:
 * - "2026-10-17 00:00:00 +0000 UTC" -> "2026-10-17"
 * - "2026-10-31 18:29:59 +0000 UTC" -> "2026-10-31" (18:29:59 UTC = 23:59:59 IST, same day)
 */
export function parseBlinkitDateToIST(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;

  // Clean date string e.g. "2026-10-17 00:00:00 +0000 UTC" -> "2026-10-17T00:00:00Z"
  let isoFormat = trimmed;
  const utcPattern = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+\+0000\s+UTC$/i;
  const match = trimmed.match(utcPattern);
  if (match) {
    isoFormat = `${match[1]}T${match[2]}Z`;
  }

  const d = new Date(isoFormat);
  if (isNaN(d.getTime())) {
    // If simple YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    return null;
  }

  // Convert to Asia/Kolkata calendar date
  const istFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return istFormatter.format(d);
}

/**
 * Calculate days remaining between today and target expiry date in IST
 */
export function calculateDaysToExpiry(expiryDateStr: string, baseDate?: Date): number {
  const target = new Date(`${expiryDateStr}T00:00:00+05:30`);
  const now = baseDate || new Date();
  
  // Format now in IST
  const istNowStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const start = new Date(`${istNowStr}T00:00:00+05:30`);
  const diffMs = target.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Parses and validates an array of raw CSV row records from PapaParse.
 * Returns valid cleaned rows and rejected rows with row numbers and failure reasons.
 */
export function parseAndCleanBlinkitRows(
  rawRows: Array<Record<string, unknown>>,
  channelId = "blinkit"
): {
  validRows: CleanedBlinkitRow[];
  rejectedRows: RejectedRow[];
} {
  const validRows: CleanedBlinkitRow[] = [];
  const rejectedRows: RejectedRow[] = [];
  const seenPoItemSet = new Set<string>();

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2; // Line 1 is CSV header

    // Quick skip for empty lines
    if (!row || Object.keys(row).length === 0 || !Object.values(row).some(v => Boolean(v))) {
      return;
    }

    // Ensure po_number and item_id are treated strictly as strings
    const sanitizedRaw: Record<string, unknown> = { ...row };
    const poNumberStr = sanitizedRaw.po_number !== undefined && sanitizedRaw.po_number !== null ? String(sanitizedRaw.po_number).trim() : "";
    const itemIdStr = sanitizedRaw.item_id !== undefined && sanitizedRaw.item_id !== null ? String(sanitizedRaw.item_id).trim() : "";

    sanitizedRaw.po_number = poNumberStr;
    sanitizedRaw.item_id = itemIdStr;

    // Excel-mangled PO numbers or item IDs check
    const isMangled = (val: string) => /e\+/i.test(val) || val.includes(".");
    if (isMangled(poNumberStr) || isMangled(itemIdStr)) {
      rejectedRows.push({
        row_number: rowNumber,
        po_number: poNumberStr,
        item_id: itemIdStr,
        reason: "Excel-mangled numeric identifier detected (scientific notation or decimal point). Please re-export the CSV from Blinkit and upload directly without opening/saving in Excel.",
        raw_data: sanitizedRaw,
      });
      return;
    }

    // Duplicate (po_number, item_id) check within single file
    const poItemKey = `${poNumberStr}:${itemIdStr}`;
    if (poNumberStr && itemIdStr) {
      if (seenPoItemSet.has(poItemKey)) {
        rejectedRows.push({
          row_number: rowNumber,
          po_number: poNumberStr,
          item_id: itemIdStr,
          reason: "Duplicate PO/item row",
          raw_data: sanitizedRaw,
        });
        return;
      }
      seenPoItemSet.add(poItemKey);
    }

    const parseResult = BlinkitCsvRowSchema.safeParse(sanitizedRaw);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
      rejectedRows.push({
        row_number: rowNumber,
        po_number: poNumberStr,
        item_id: itemIdStr,
        reason: errorMsg,
        raw_data: sanitizedRaw,
      });
      return;
    }

    const data: BlinkitCsvRow = parseResult.data;

    // Dates
    const order_date = parseBlinkitDateToIST(data.order_date);
    const expiry_date = parseBlinkitDateToIST(data.expiry_date);
    const appointment_date = data.appointment_date ? parseBlinkitDateToIST(data.appointment_date) : null;

    if (!order_date) {
      rejectedRows.push({
        row_number: rowNumber,
        po_number: data.po_number,
        item_id: data.item_id,
        reason: `Invalid order_date: "${data.order_date}"`,
        raw_data: sanitizedRaw,
      });
      return;
    }

    if (!expiry_date) {
      rejectedRows.push({
        row_number: rowNumber,
        po_number: data.po_number,
        item_id: data.item_id,
        reason: `Invalid expiry_date: "${data.expiry_date}"`,
        raw_data: sanitizedRaw,
      });
      return;
    }

    const facility = parseFacilityName(data.facility_name);
    const vendor_legal = normalizeVendorLegalName(data.entity_vendor_legal_name);

    validRows.push({
      channel_id: channelId,
      po_number: data.po_number,
      facility_raw: facility.facility_raw,
      city: facility.city,
      facility_code: facility.facility_code,
      order_date,
      expiry_date,
      appointment_date,
      po_state: data.po_state.trim(),
      item_id: data.item_id,
      name: data.name.trim(),
      uom_text: data.uom_text.trim(),
      upc: data.upc.trim(),
      units_ordered: data.units_ordered,
      total_grn_quantity: data.total_grn_quantity,
      remaining_quantity: data.remaining_quantity,
      landing_rate: data.landing_rate,
      cost_price: data.cost_price,
      margin_percentage: data.margin_percentage,
      tax_value: data.tax_value,
      total_amount: data.total_amount,
      mrp: data.mrp,
      entity_vendor_legal_name: vendor_legal,
      region: facility.region,
    });
  });

  return { validRows, rejectedRows };
}
