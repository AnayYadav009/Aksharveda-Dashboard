import { z } from "zod";

// Raw CSV Row input schema from Blinkit export
export const BlinkitCsvRowSchema = z.object({
  po_number: z.string().min(1, "PO Number is required"),
  facility_name: z.string().min(1, "Facility Name is required"),
  manufacturer_name: z.string().optional().default(""),
  entity_vendor_legal_name: z.string().optional().default(""),
  vendor_name: z.string().optional().default(""),
  order_date: z.string().min(1, "Order Date is required"),
  appointment_date: z.string().optional().nullable().default(null),
  expiry_date: z.string().min(1, "Expiry Date is required"),
  po_state: z.string().min(1, "PO State is required"),
  item_id: z.string().min(1, "Item ID is required"),
  name: z.string().min(1, "Item Name is required"),
  uom_text: z.string().optional().default(""),
  upc: z.string().optional().default(""),
  units_ordered: z.coerce.number().int().nonnegative().default(0),
  total_grn_quantity: z.coerce.number().int().nonnegative().default(0),
  remaining_quantity: z.coerce.number().int().nonnegative().default(0),
  landing_rate: z.coerce.number().nonnegative().default(0),
  cost_price: z.coerce.number().nonnegative().default(0),
  margin_percentage: z.coerce.number().default(0),
  cess_value: z.coerce.number().default(0),
  sgst_value: z.coerce.number().default(0),
  igst_value: z.coerce.number().default(0),
  cgst_value: z.coerce.number().default(0),
  tax_value: z.coerce.number().default(0),
  total_amount: z.coerce.number().nonnegative().default(0),
  mrp: z.coerce.number().nonnegative().default(0),
});

export type BlinkitCsvRow = z.infer<typeof BlinkitCsvRowSchema>;

// Normalized Clean Row
export interface CleanedBlinkitRow {
  channel_id: string;
  po_number: string;
  facility_raw: string;
  city: string;
  facility_code: string;
  order_date: string; // YYYY-MM-DD
  expiry_date: string; // YYYY-MM-DD
  appointment_date: string | null; // YYYY-MM-DD or null
  po_state: "Unscheduled" | "Scheduled" | "Partially Scheduled" | "Fulfilled" | "Expired" | string;
  item_id: string;
  name: string;
  short_name?: string | null;
  uom_text: string;
  upc: string;
  units_ordered: number;
  total_grn_quantity: number;
  remaining_quantity: number;
  landing_rate: number;
  cost_price: number;
  margin_percentage: number;
  tax_value: number;
  total_amount: number;
  mrp: number;
  entity_vendor_legal_name: string;
  region?: string | null;
}

// Upload Validation / Preview Types
export interface RejectedRow {
  row_number: number;
  po_number?: string;
  item_id?: string;
  reason: string;
  raw_data?: Record<string, unknown>;
}

export interface StateChangePreview {
  po_number: string;
  old_state: string;
  new_state: string;
}

export interface UploadPreview {
  file_name: string;
  rows_total: number;
  rows_valid: number;
  rows_rejected: number;
  pos_total: number;
  pos_new: number;
  pos_updated: number;
  pos_unchanged: number;
  pos_near_expiry: number; // <= near_expiry_days
  total_units: number; // Reconciliation sum(units_ordered)
  total_amount: number; // Reconciliation sum(total_amount)
  state_changes: StateChangePreview[];
  rejected_rows: RejectedRow[];
  field_changes?: Record<string, string[]>;
}

// Database entities
export interface POHeader {
  channel_id: string;
  po_number: string;
  facility_raw: string;
  city: string;
  facility_code: string;
  region?: string | null;
  order_date: string;
  expiry_date: string;
  appointment_date: string | null;
  po_state: string;
  total_qty: number;
  total_amount: number;
  first_seen_at: string;
  last_seen_at: string;
  first_upload_id?: string;
  last_upload_id?: string;
  is_deleted: boolean;
}

export interface POLine {
  channel_id: string;
  po_number: string;
  item_id: string;
  units_ordered: number;
  total_grn_quantity: number;
  remaining_quantity: number;
  landing_rate: number;
  cost_price: number;
  margin_percentage: number;
  tax_value: number;
  total_amount: number;
}

export interface POPlan {
  channel_id: string;
  po_number: string;
  remarks: string;
  central_appointment_date: string | null;
  internal_dispatch_date: string | null;
  actual_dispatch_date: string | null;
  updated_at: string;
  updated_by: string;
}

export interface POLineDispatch {
  channel_id: string;
  po_number: string;
  item_id: string;
  qty_dispatched: number;
  updated_at: string;
  updated_by: string;
}

export interface SKUMaster {
  item_id: string;
  name: string;
  short_name?: string | null;
  upc: string;
  uom_text: string;
  mrp: number;
}

export interface StockSnapshot {
  item_id: string;
  qty_in_hand: number;
  updated_at: string;
  updated_by: string;
}

export interface POStateHistory {
  id?: string;
  channel_id: string;
  po_number: string;
  old_state: string;
  new_state: string;
  changed_at: string;
  upload_id?: string;
}

export interface UploadLog {
  id: string;
  channel_id: string;
  file_name: string;
  uploaded_by: string;
  uploaded_at: string;
  rows_total: number;
  pos_new: number;
  pos_updated: number;
  pos_unchanged: number;
  rows_rejected: number;
  total_units: number;
  total_amount: number;
  status: string;
  error_report: RejectedRow[];
}

export interface NotificationRecipient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  channel_prefs: {
    email: boolean;
    whatsapp: boolean;
    in_app: boolean;
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InAppNotification {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "alert" | "success";
  metadata?: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export type UserRole = "pending" | "demand" | "warehouse" | "management";

export interface UserProfile {
  user_id: string;
  name: string;
  role: UserRole;
  created_at?: string;
}
