import {
  CleanedBlinkitRow,
  POHeader,
  POLine,
  SKUMaster,
  POPlan,
  POLineDispatch,
  POStateHistory,
  StockSnapshot,
  UploadLog,
  NotificationRecipient,
  InAppNotification,
  UploadPreview,
} from "./types";
import { calculateDaysToExpiry } from "./parser";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";
import fs from "fs";
import path from "path";

// Local storage files for development and zero-config execution
const ROOT_DIR = "C:\\Anay\\Programming\\Projects\\Aksharveda Dashboard";
const DATA_DIR = path.join(ROOT_DIR, ".data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

export interface DatabaseStore {
  channels: Array<{ id: string; name: string }>;
  upload_log: UploadLog[];
  po_header: POHeader[];
  po_line: POLine[];
  sku_master: SKUMaster[];
  po_plan: POPlan[];
  po_line_dispatch: POLineDispatch[];
  stock_snapshot: StockSnapshot[];
  po_state_history: POStateHistory[];
  settings: Record<string, unknown>;
  notification_recipients: NotificationRecipient[];
  in_app_notifications: InAppNotification[];
}

function getInitialStore(): DatabaseStore {
  return {
    channels: [{ id: "blinkit", name: "Blinkit" }],
    upload_log: [],
    po_header: [],
    po_line: [],
    sku_master: [],
    po_plan: [],
    po_line_dispatch: [],
    stock_snapshot: [],
    po_state_history: [],
    settings: {
      near_expiry_days: 7,
      default_recent_days: 30,
    },
    notification_recipients: [
      {
        id: "recip-1",
        name: "Demand Lead",
        email: "demand@aksharveda.com",
        phone: "+919876543210",
        role: "Demand",
        channel_prefs: { email: true, whatsapp: true, in_app: true },
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "recip-2",
        name: "Warehouse Dispatch",
        email: "dispatch@aksharveda.com",
        phone: "+919876543211",
        role: "Warehouse",
        channel_prefs: { email: true, whatsapp: true, in_app: true },
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    in_app_notifications: [],
  };
}

export function loadStore(): DatabaseStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Error loading store:", err);
  }
  const initial = getInitialStore();
  saveStore(initial);
  return initial;
}

export function saveStore(store: DatabaseStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving store:", err);
  }
}

/**
 * Loads data from Supabase if configured, falling back to local JSON store.
 */
export async function getUnifiedStore(): Promise<DatabaseStore> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return loadStore();
  }

  try {
    const [
      channelsRes,
      headersRes,
      linesRes,
      skusRes,
      plansRes,
      dispatchRes,
      stockRes,
      historyRes,
      uploadsRes,
      recipientsRes,
      notifsRes,
    ] = await Promise.all([
      supabase.from("channels").select("*"),
      supabase.from("po_header").select("*"),
      supabase.from("po_line").select("*"),
      supabase.from("sku_master").select("*"),
      supabase.from("po_plan").select("*"),
      supabase.from("po_line_dispatch").select("*"),
      supabase.from("stock_snapshot").select("*"),
      supabase.from("po_state_history").select("*"),
      supabase.from("upload_log").select("*").order("uploaded_at", { ascending: false }),
      supabase.from("notification_recipients").select("*"),
      supabase.from("in_app_notifications").select("*").order("created_at", { ascending: false }),
    ]);

    return {
      channels: channelsRes.data || [{ id: "blinkit", name: "Blinkit" }],
      po_header: headersRes.data || [],
      po_line: linesRes.data || [],
      sku_master: skusRes.data || [],
      po_plan: plansRes.data || [],
      po_line_dispatch: dispatchRes.data || [],
      stock_snapshot: stockRes.data || [],
      po_state_history: historyRes.data || [],
      upload_log: uploadsRes.data || [],
      notification_recipients: recipientsRes.data || [],
      in_app_notifications: notifsRes.data || [],
      settings: {
        near_expiry_days: 7,
        default_recent_days: 30,
      },
    };
  } catch (err) {
    console.warn("Supabase query failed, falling back to local store:", err);
    return loadStore();
  }
}

/**
 * Generates an upload preview diff before committing changes
 */
export function generateUploadPreview(
  cleanedRows: CleanedBlinkitRow[],
  fileName: string,
  store: DatabaseStore = loadStore()
): UploadPreview {
  const nearExpiryDays = (store.settings.near_expiry_days as number) || 7;
  const existingHeadersMap = new Map<string, POHeader>();
  store.po_header.forEach((h) => {
    existingHeadersMap.set(`${h.channel_id}:${h.po_number}`, h);
  });

  const rowMap = new Map<string, CleanedBlinkitRow[]>();
  cleanedRows.forEach((row) => {
    const key = `${row.channel_id}:${row.po_number}`;
    if (!rowMap.has(key)) {
      rowMap.set(key, []);
    }
    rowMap.get(key)!.push(row);
  });

  let posNew = 0;
  let posUpdated = 0;
  let posUnchanged = 0;
  let posNearExpiry = 0;
  const stateChanges: UploadPreview["state_changes"] = [];

  rowMap.forEach((lines, key) => {
    const first = lines[0];
    const existing = existingHeadersMap.get(key);
    const daysToExpiry = calculateDaysToExpiry(first.expiry_date);
    if (daysToExpiry <= nearExpiryDays && daysToExpiry >= 0) {
      posNearExpiry++;
    }

    if (!existing) {
      posNew++;
    } else {
      let isChanged = false;
      if (existing.po_state !== first.po_state) {
        isChanged = true;
        stateChanges.push({
          po_number: first.po_number,
          old_state: existing.po_state,
          new_state: first.po_state,
        });
      }
      if (
        existing.expiry_date !== first.expiry_date ||
        existing.appointment_date !== first.appointment_date
      ) {
        isChanged = true;
      }

      if (isChanged) {
        posUpdated++;
      } else {
        posUnchanged++;
      }
    }
  });

  const totalUnits = cleanedRows.reduce((acc, cur) => acc + cur.units_ordered, 0);
  const totalAmount = cleanedRows.reduce((acc, cur) => acc + cur.total_amount, 0);

  return {
    file_name: fileName,
    rows_total: cleanedRows.length,
    rows_valid: cleanedRows.length,
    rows_rejected: 0,
    pos_total: rowMap.size,
    pos_new: posNew,
    pos_updated: posUpdated,
    pos_unchanged: posUnchanged,
    pos_near_expiry: posNearExpiry,
    total_units: totalUnits,
    total_amount: totalAmount,
    state_changes: stateChanges,
    rejected_rows: [],
  };
}

/**
 * Commits cleaned rows atomically to the database.
 * CRITICAL RULE:
 * 1. Blinkit-owned data (po_header, po_line, sku_master) is updated.
 * 2. Team-owned data (po_plan, po_line_dispatch) is NEVER overwritten.
 * 3. Initial po_plan is inserted ONLY for newly discovered POs.
 */
export function commitUploadTransaction(
  cleanedRows: CleanedBlinkitRow[],
  fileName: string,
  uploadedBy = "demand_team",
  store: DatabaseStore = loadStore(),
  persistToDisk = true
): {
  uploadId: string;
  preview: UploadPreview;
} {
  const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();
  const preview = generateUploadPreview(cleanedRows, fileName, store);

  // Group rows by PO
  const poMap = new Map<string, CleanedBlinkitRow[]>();
  cleanedRows.forEach((r) => {
    const key = `${r.channel_id}:${r.po_number}`;
    if (!poMap.has(key)) poMap.set(key, []);
    poMap.get(key)!.push(r);
  });

  const skuMap = new Map<string, SKUMaster>();
  store.sku_master.forEach((s) => skuMap.set(s.item_id, s));

  // 1. Upsert SKU Master
  cleanedRows.forEach((r) => {
    const existing = skuMap.get(r.item_id);
    if (!existing) {
      skuMap.set(r.item_id, {
        item_id: r.item_id,
        name: r.name,
        short_name: null,
        upc: r.upc,
        uom_text: r.uom_text,
        mrp: r.mrp,
      });
    } else {
      // Retain existing short_name, update base properties
      skuMap.set(r.item_id, {
        ...existing,
        name: r.name,
        upc: r.upc || existing.upc,
        uom_text: r.uom_text || existing.uom_text,
        mrp: r.mrp || existing.mrp,
      });
    }
  });
  store.sku_master = Array.from(skuMap.values());

  // Existing maps
  const headerMap = new Map<string, POHeader>();
  store.po_header.forEach((h) => headerMap.set(`${h.channel_id}:${h.po_number}`, h));

  const planMap = new Map<string, POPlan>();
  store.po_plan.forEach((p) => planMap.set(`${p.channel_id}:${p.po_number}`, p));

  const lineMap = new Map<string, POLine>();
  store.po_line.forEach((l) => lineMap.set(`${l.channel_id}:${l.po_number}:${l.item_id}`, l));

  // 2. Process each PO
  poMap.forEach((lines, poKey) => {
    const first = lines[0];
    const totalQty = lines.reduce((acc, cur) => acc + cur.units_ordered, 0);
    const totalAmount = lines.reduce((acc, cur) => acc + cur.total_amount, 0);
    const existingHeader = headerMap.get(poKey);

    if (existingHeader) {
      // Check state change
      if (existingHeader.po_state !== first.po_state) {
        store.po_state_history.push({
          id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          channel_id: first.channel_id,
          po_number: first.po_number,
          old_state: existingHeader.po_state,
          new_state: first.po_state,
          changed_at: nowIso,
          upload_id: uploadId,
        });
      }

      // Update Blinkit-owned header
      headerMap.set(poKey, {
        ...existingHeader,
        facility_raw: first.facility_raw,
        city: first.city,
        facility_code: first.facility_code,
        order_date: first.order_date,
        expiry_date: first.expiry_date,
        appointment_date: first.appointment_date,
        po_state: first.po_state,
        total_qty: totalQty,
        total_amount: totalAmount,
        last_seen_at: nowIso,
        last_upload_id: uploadId,
      });
    } else {
      // Brand new PO header
      headerMap.set(poKey, {
        channel_id: first.channel_id,
        po_number: first.po_number,
        facility_raw: first.facility_raw,
        city: first.city,
        facility_code: first.facility_code,
        order_date: first.order_date,
        expiry_date: first.expiry_date,
        appointment_date: first.appointment_date,
        po_state: first.po_state,
        total_qty: totalQty,
        total_amount: totalAmount,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        first_upload_id: uploadId,
        last_upload_id: uploadId,
        is_deleted: false,
      });

      // Insert empty PO Plan ONLY for new PO
      planMap.set(poKey, {
        channel_id: first.channel_id,
        po_number: first.po_number,
        remarks: "",
        central_appointment_date: null,
        internal_dispatch_date: null,
        actual_dispatch_date: null,
        updated_at: nowIso,
        updated_by: "system_init",
      });
    }

    // 3. Upsert PO Lines (Blinkit-owned)
    lines.forEach((line) => {
      const lineKey = `${line.channel_id}:${line.po_number}:${line.item_id}`;
      lineMap.set(lineKey, {
        channel_id: line.channel_id,
        po_number: line.po_number,
        item_id: line.item_id,
        units_ordered: line.units_ordered,
        total_grn_quantity: line.total_grn_quantity,
        remaining_quantity: line.remaining_quantity,
        landing_rate: line.landing_rate,
        cost_price: line.cost_price,
        margin_percentage: line.margin_percentage,
        tax_value: line.tax_value,
        total_amount: line.total_amount,
      });
    });
  });

  store.po_header = Array.from(headerMap.values());
  store.po_plan = Array.from(planMap.values());
  store.po_line = Array.from(lineMap.values());

  // 4. Log upload
  const uploadLogEntry: UploadLog = {
    id: uploadId,
    channel_id: "blinkit",
    file_name: fileName,
    uploaded_by: uploadedBy,
    uploaded_at: nowIso,
    rows_total: cleanedRows.length,
    pos_new: preview.pos_new,
    pos_updated: preview.pos_updated,
    pos_unchanged: preview.pos_unchanged,
    rows_rejected: preview.rows_rejected,
    total_units: preview.total_units,
    total_amount: preview.total_amount,
    status: "completed",
    error_report: preview.rejected_rows,
  };
  store.upload_log.unshift(uploadLogEntry);

  if (persistToDisk) {
    saveStore(store);
  }

  // Sync with Supabase if configured
  const supabase = getSupabaseClient();
  if (supabase) {
    (async () => {
      try {
        await supabase.from("sku_master").upsert(store.sku_master, { onConflict: "item_id" });
        await supabase.from("po_header").upsert(store.po_header, { onConflict: "channel_id,po_number" });
        await supabase.from("po_line").upsert(store.po_line, { onConflict: "channel_id,po_number,item_id" });
        await supabase.from("upload_log").insert(uploadLogEntry);
      } catch (err) {
        console.error("Async Supabase sync error:", err);
      }
    })();
  }

  return { uploadId, preview };
}
