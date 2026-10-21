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
 * Extracts city and facility_code from facility_name.
 * Examples:
 * - "Patna P2 - Feeder Warehouse" -> city: "Patna", facility_code: "P2"
 * - "Surat S2 - Feeder Warehouse" -> city: "Surat", facility_code: "S2"
 * - "Delhi Feeder Hub" -> city: "Delhi", facility_code: ""
 */
export function parseFacilityName(facilityName: string | undefined | null): {
  city: string;
  facility_code: string;
  facility_raw: string;
} {
  const facility_raw = (facilityName || "").trim();
  if (!facility_raw) {
    return { city: "Unknown", facility_code: "", facility_raw: "" };
  }

  // Regex pattern: matches "CityName Code - ..." or "CityName Code-..."
  const match = facility_raw.match(/^([A-Za-z\s]+?)\s+([A-Z0-9]+)\s*-\s*/i);
  if (match) {
    return {
      city: match[1].trim(),
      facility_code: match[2].trim(),
      facility_raw,
    };
  }

  // Fallback: match first word as city if followed by hyphen or space
  const fallbackMatch = facility_raw.match(/^([A-Za-z]+)\b/);
  const city = fallbackMatch ? fallbackMatch[1].trim() : facility_raw;

  return {
    city,
    facility_code: "",
    facility_raw,
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

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2; // Line 1 is CSV header

    // Quick skip for empty lines
    if (!row || Object.keys(row).length === 0 || !Object.values(row).some(v => Boolean(v))) {
      return;
    }

    // Ensure po_number is treated strictly as a string
    const sanitizedRaw: Record<string, unknown> = { ...row };
    if (sanitizedRaw.po_number !== undefined && sanitizedRaw.po_number !== null) {
      sanitizedRaw.po_number = String(sanitizedRaw.po_number).trim();
    }
    if (sanitizedRaw.item_id !== undefined && sanitizedRaw.item_id !== null) {
      sanitizedRaw.item_id = String(sanitizedRaw.item_id).trim();
    }

    const parseResult = BlinkitCsvRowSchema.safeParse(sanitizedRaw);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
      rejectedRows.push({
        row_number: rowNumber,
        po_number: String(sanitizedRaw.po_number || ""),
        item_id: String(sanitizedRaw.item_id || ""),
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
    });
  });

  return { validRows, rejectedRows };
}
