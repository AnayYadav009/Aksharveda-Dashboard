export interface DaysLeftResult {
  days: number;
  label: string;
  isUrgent: boolean; // 0 to 7 days
  isExpired: boolean; // < 0 days
}

/**
 * Format a number into Indian Rupee grouping (e.g. 60314416 -> "₹6,03,14,416" or "₹1,234.50")
 * Uses standard Indian numbering system: 3 digits for first thousands, then groups of 2.
 */
export function formatINR(value: number | null | undefined, options?: { showDecimals?: boolean; includeSymbol?: boolean }): string {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return options?.includeSymbol !== false ? "₹0" : "0";
  }

  const num = Number(value);
  const includeSymbol = options?.includeSymbol !== false;
  const showDecimals = options?.showDecimals ?? false;

  const symbol = includeSymbol ? "₹" : "";
  const sign = num < 0 ? "-" : "";
  const absNum = Math.abs(num);

  const parts = showDecimals ? absNum.toFixed(2).split(".") : [Math.round(absNum).toString()];
  let integerPart = parts[0];
  const decimalPart = parts[1] ? `.${parts[1]}` : "";

  if (integerPart.length <= 3) {
    return `${sign}${symbol}${integerPart}${decimalPart}`;
  }

  const lastThree = integerPart.substring(integerPart.length - 3);
  const otherDigits = integerPart.substring(0, integerPart.length - 3);
  const formattedOther = otherDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ",");

  return `${sign}${symbol}${formattedOther},${lastThree}${decimalPart}`;
}

/**
 * Format quantity units with Indian comma grouping (e.g. 224224 -> "2,24,224 units")
 */
export function formatUnits(value: number | null | undefined, suffix = "units"): string {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return `0 ${suffix}`.trim();
  }

  const formatted = formatINR(value, { includeSymbol: false, showDecimals: false });
  return suffix ? `${formatted} ${suffix}` : formatted;
}

/**
 * Format an ISO or UTC date string to IST date string, e.g. "17 Oct" or "17 Oct 2026"
 */
export function formatDate(
  dateStr: string | null | undefined,
  formatType: "short" | "full" | "monthYear" = "short"
): string {
  if (!dateStr || dateStr === "null" || dateStr === "undefined" || !dateStr.trim()) {
    return "—";
  }

  const trimmed = dateStr.trim();
  // Handle formats like "YYYY-MM-DD" or timestamps
  let d: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    d = new Date(`${trimmed}T00:00:00+05:30`);
  } else {
    d = new Date(trimmed);
  }

  if (isNaN(d.getTime())) {
    return "—";
  }

  if (formatType === "monthYear") {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "short",
      year: "numeric",
    }).format(d);
  }

  if (formatType === "full") {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  }

  // default short: e.g. "17 Oct"
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  }).format(d);
}

/**
 * Calculate days remaining until expiry date in IST relative to baseDate (or current time)
 * Returns object with days, friendly label, isUrgent (0-7 days), and isExpired (<0 days).
 */
export function daysLeft(expiryDateStr: string | null | undefined, baseDate?: Date): DaysLeftResult {
  if (!expiryDateStr || expiryDateStr === "null" || expiryDateStr === "undefined" || !expiryDateStr.trim()) {
    return { days: 0, label: "—", isUrgent: false, isExpired: false };
  }

  const trimmed = expiryDateStr.trim().split(" ")[0]; // clean YYYY-MM-DD
  const target = new Date(`${trimmed}T00:00:00+05:30`);

  const now = baseDate || new Date();
  const istNowStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const start = new Date(`${istNowStr}T00:00:00+05:30`);
  const diffMs = target.getTime() - start.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return {
      days,
      label: `Expired (${Math.abs(days)}d ago)`,
      isUrgent: false,
      isExpired: true,
    };
  }

  if (days === 0) {
    return {
      days: 0,
      label: "Expires Today",
      isUrgent: true,
      isExpired: false,
    };
  }

  if (days === 1) {
    return {
      days: 1,
      label: "1 day left",
      isUrgent: true,
      isExpired: false,
    };
  }

  return {
    days,
    label: `${days} days left`,
    isUrgent: days <= 7,
    isExpired: false,
  };
}
