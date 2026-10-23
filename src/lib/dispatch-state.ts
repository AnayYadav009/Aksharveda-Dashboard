export const DISPATCH_STATES = ["UNSCHEDULED", "SCHEDULED", "DISPATCHED", "DELIVERED", "CANCELLED", "EXPIRED"] as const;
export type DispatchState = typeof DISPATCH_STATES[number];

export function isDispatchDateLocked(state: DispatchState) {
  return ["DISPATCHED", "DELIVERED", "CANCELLED", "EXPIRED"].includes(state);
}

export function normalizeDispatchState(state: string): DispatchState {
  const value = state.trim().toUpperCase().replaceAll(" ", "_");
  if (value === "FULFILLED") return "DELIVERED";
  if (value === "PARTIALLY_SCHEDULED") return "SCHEDULED";
  return DISPATCH_STATES.includes(value as DispatchState) ? value as DispatchState : "UNSCHEDULED";
}

export function validatePlannedDate(date: string | null, expiry: string, today: string) {
  if (date === null || date === "") return { valid: true, warning: null as string | null };
  const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!isIsoDate(date) || !isIsoDate(expiry) || !isIsoDate(today)) return { valid: false, error: "Enter a valid dispatch date." };
  if (date < today) return { valid: false, error: "Dispatch date cannot be in the past." };
  if (date > expiry) return { valid: false, error: "Dispatch date cannot be after the PO expiry date." };
  const delta = Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
  return { valid: true, warning: delta <= 1 ? "Dispatch date is within one day of expiry." : null };
}

export function validateTransition(from: DispatchState, to: DispatchState, plannedDate: string | null) {
  if (from === to) return { valid: true };
  const allowed: Record<DispatchState, DispatchState[]> = {
    UNSCHEDULED: ["SCHEDULED", "CANCELLED"],
    SCHEDULED: ["UNSCHEDULED", "DISPATCHED", "CANCELLED"],
    DISPATCHED: ["DELIVERED"],
    DELIVERED: [], CANCELLED: [], EXPIRED: [],
  };
  if (!allowed[from].includes(to)) return { valid: false, error: `Cannot change ${from} to ${to}.` };
  if (to === "SCHEDULED" && from === "UNSCHEDULED" && !plannedDate) return { valid: false, error: "A planned dispatch date is required." };
  if (to === "DISPATCHED" && !plannedDate) return { valid: false, error: "A planned dispatch date is required before dispatch." };
  return { valid: true };
}

export function validateBulkSchedule(entries: Array<{ po_number: string; state: DispatchState; date: string; expiry_date: string }>, today: string) {
  if (entries.length === 0) return { valid: false, error: "Select at least one PO to schedule." };
  for (const entry of entries) {
    const date = validatePlannedDate(entry.date, entry.expiry_date, today);
    if (!date.valid) return { valid: false, po_number: entry.po_number, error: date.error };
    const transition = validateTransition(entry.state, "SCHEDULED", entry.date);
    if (!transition.valid) return { valid: false, po_number: entry.po_number, error: transition.error };
  }
  return { valid: true };
}

export function formatSkuName(fullName: string, maxLength = 22) {
  const cleaned = fullName.replace(/\b(?:aksharveda|floral blooms)\b/gi, " ").replace(/\b(?:pack of|combo of|with|and|the|for)\b/gi, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned || fullName;
  const words = cleaned.split(" ");
  let output = "";
  for (const word of words) {
    const candidate = output ? `${output} ${word}` : word;
    if (candidate.length > maxLength) break;
    output = candidate;
  }
  return output || words[0] || fullName;
}
