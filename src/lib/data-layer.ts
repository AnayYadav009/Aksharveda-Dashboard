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
  RejectedRow,
  Hub,
} from "./types";
import { calculateDaysToExpiry } from "./parser";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";
import { loadStore, saveStore, DatabaseStore } from "./db";
import { getNotificationDispatcher } from "./notifications/notifier";
import crypto from "crypto";

export interface DataAdapterStatus {
  isFallback: boolean;
  adapter: "supabase_postgres" | "json_fallback";
}

// In-memory cache with short TTL (e.g. 15s) for instant sub-100ms reads, invalidated on commits/mutations
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const queryCache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 20000; // 20s

export function invalidateDataCache(prefix?: string) {
  if (!prefix) {
    queryCache.clear();
  } else {
    for (const key of queryCache.keys()) {
      if (key.startsWith(prefix)) queryCache.delete(key);
    }
  }
}

/**
 * Checks connection to Supabase via a real live query.
 * In production (NODE_ENV === "production"), if Supabase is not configured or fails,
 * throws a clear error instead of falling back to JSON store.
 */
export async function getDataAdapterStatus(): Promise<DataAdapterStatus> {
  const cacheKey = "status:adapter";
  const cached = queryCache.get(cacheKey) as CacheEntry<DataAdapterStatus> | undefined;
  if (cached && Date.now() - cached.timestamp < 10000) {
    return cached.data;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const supabase = getSupabaseClient();
  if (!supabase) {
    if (isProduction) {
      throw new Error("Supabase is not configured in production environment (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required). Local fallback is disabled in production.");
    }
    return { isFallback: true, adapter: "json_fallback" };
  }

  try {
    const { error } = await supabase.from("channels").select("id").limit(1);
    if (error) {
      console.warn("Supabase health check query failed:", error.message);
      if (isProduction) {
        throw new Error(`Supabase query failed in production: ${error.message}. Local fallback is disabled in production.`);
      }
      return { isFallback: true, adapter: "json_fallback" };
    }
    const result: DataAdapterStatus = { isFallback: false, adapter: "supabase_postgres" };
    queryCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    if (isProduction) {
      throw new Error(`Supabase connection error in production: ${err instanceof Error ? err.message : String(err)}. Local fallback is disabled in production.`);
    }
    console.warn("Supabase health check exception:", err);
    return { isFallback: true, adapter: "json_fallback" };
  }
}

/**
 * Helper to upsert rows in chunks of 500, checking and throwing on error.
 */
async function mustUpsert<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof getSupabaseClient>,
  table: string,
  rows: T[],
  onConflict: string,
  chunkSize = 500
): Promise<void> {
  if (!supabase) throw new Error("Supabase client is not available for mustUpsert");
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk as any, { onConflict });
    if (error) {
      throw new Error(`mustUpsert failed on table '${table}' [chunk ${i}-${i + chunk.length}]: ${error.message}`);
    }
  }
}

/**
 * Helper to fetch all rows across PostgREST's 1000-row pagination limit.
 */
async function fetchAllRows<T>(
  table: string,
  columns = "*",
  orderBy?: { column: string; ascending: boolean },
  filters: Array<{ column: string; value: unknown }> = []
): Promise<T[]> {
  const filterKey = filters.map(({ column, value }) => `${column}-${String(value)}`).join(",");
  const cacheKey = `table:${table}:${columns}:${orderBy ? `${orderBy.column}-${orderBy.ascending}` : 'none'}:${filterKey}`;
  const cached = queryCache.get(cacheKey) as CacheEntry<T[]> | undefined;
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const allRows: T[] = [];
  const pageSize = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase.from(table).select(columns);
    for (const filter of filters) {
      query = query.eq(filter.column, filter.value);
    }
    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending });
    }
    query = query.range(from, from + pageSize - 1);
    const { data, error } = await query;
    if (error) {
      console.error(`Error fetching from ${table}:`, error.message);
      throw error;
    }
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allRows.push(...(data as unknown as T[]));
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
      }
    }
  }
  queryCache.set(cacheKey, { data: allRows, timestamp: Date.now() });
  return allRows;
}

/**
 * 1. DASHBOARD: Fetch POs and Top Summary
 */
export async function getDashboardData(options: {
  hub: Hub;
  view?: string;
  month?: string | null;
  days?: number;
  search?: string;
  city?: string;
  state?: string;
  page?: number;
  pageSize?: number;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  paginate?: boolean;
}) {
  const status = await getDataAdapterStatus();
  const search = options.search?.toLowerCase() || "";
  const city = options.city || "";
  const state = options.state || "";
  const view = options.view || "month";
  const days = options.days || 30;
  const page = options.page || 1;
  const pageSize = options.pageSize || 50;
  const paginate = options.paginate ?? true;
  const sortKey = options.sortKey || "order_date";
  const sortDir = options.sortDir || "desc";
  const hub = options.hub;

  let headers: POHeader[] = [];
  let nearExpiryDays = 7;

  if (!status.isFallback) {
    headers = await fetchAllRows<POHeader>("po_header", "*", undefined, [{ column: "hub", value: hub }]);
    // Get settings
    const supabase = getSupabaseClient()!;
    const { data: setRow } = await supabase.from("settings").select("value").eq("key", "near_expiry_days").maybeSingle();
    if (setRow && typeof setRow.value === "number") {
      nearExpiryDays = setRow.value;
    }
  } else {
    const store = loadStore();
    headers = [...store.po_header];
    nearExpiryDays = (store.settings?.near_expiry_days as number) || 7;
  }

  // Filter by hub
  headers = headers.filter((h) => h.hub === hub);

  // Filter by search, city, state
  if (search) {
    headers = headers.filter(
      (h) =>
        h.po_number.toLowerCase().includes(search) ||
        h.facility_raw.toLowerCase().includes(search) ||
        (h.city && h.city.toLowerCase().includes(search))
    );
  }
  if (city) headers = headers.filter((h) => h.city === city);
  if (state) headers = headers.filter((h) => h.po_state === state);

  // Available distinct months
  const allMonthsSet = new Set<string>();
  headers.forEach((h) => {
    if (h.order_date && h.order_date.length >= 7) {
      allMonthsSet.add(h.order_date.substring(0, 7));
    }
  });
  const availableMonths = Array.from(allMonthsSet).sort().reverse();
  const activeMonth = options.month || (availableMonths.length > 0 ? availableMonths[0] : "2026-10");

  if (view === "month") {
    headers = headers.filter((h) => h.order_date.startsWith(activeMonth));
  } else if (view === "recent") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    headers = headers.filter((h) => h.order_date >= cutoffStr);
  }

  // Calculate near expiry strictly for OPEN POs (not Expired or Fulfilled)
  let allPos = headers.map((h) => {
    const daysToExpiry = calculateDaysToExpiry(h.expiry_date);
    const isOpen = h.po_state !== "Expired" && h.po_state !== "Fulfilled";
    const isNear = isOpen && daysToExpiry <= nearExpiryDays && daysToExpiry >= 0;
    return {
      po_number: h.po_number,
      facility_raw: h.facility_raw,
      city: h.city,
      facility_code: h.facility_code,
      order_date: h.order_date,
      expiry_date: h.expiry_date,
      days_to_expiry: daysToExpiry,
      is_near_expiry: isNear,
      po_state: h.po_state,
      total_qty: Number(h.total_qty),
      total_amount: Number(h.total_amount),
    };
  });

  // Calculate full database/filter aggregates BEFORE pagination
  const totalPOs = allPos.length;
  const totalValue = allPos.reduce((acc, cur) => acc + Number(cur.total_amount), 0);
  const totalUnits = allPos.reduce((acc, cur) => acc + Number(cur.total_qty), 0);
  const nearExpiryCount = allPos.filter((p) => p.is_near_expiry).length;

  // Sorting
  allPos.sort((a, b) => {
    let valA: any = a[sortKey as keyof typeof a];
    let valB: any = b[sortKey as keyof typeof b];
    if (typeof valA === "string") {
      const cmp = valA.localeCompare(valB || "");
      return sortDir === "asc" ? cmp : -cmp;
    }
    return sortDir === "asc" ? (valA > valB ? 1 : -1) : valA < valB ? 1 : -1;
  });

  const totalPages = Math.max(1, Math.ceil(totalPOs / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  // Paginated slice
  const paginatedPos = paginate
    ? allPos.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : allPos;

  const cities = Array.from(new Set(headers.map((h) => h.city).filter(Boolean))).sort();
  const states = Array.from(new Set(headers.map((h) => h.po_state).filter(Boolean))).sort();

  return {
    summary: {
      total_pos: totalPOs,
      total_value: Math.round(totalValue),
      total_units: totalUnits,
      near_expiry_count: nearExpiryCount,
    },
    pagination: {
      page: currentPage,
      page_size: pageSize,
      total_pages: totalPages,
      total_count: totalPOs,
    },
    available_months: availableMonths,
    active_month: activeMonth,
    cities,
    states,
    pos: paginatedPos,
  };
}

/**
 * 2. PO DETAIL: Fetch single PO drawer info
 */
export async function getPODetail(poNumber: string, hub: Hub) {
  const status = await getDataAdapterStatus();

  if (!status.isFallback) {
    const supabase = getSupabaseClient()!;
    let headerQuery = supabase.from("po_header").select("*").eq("channel_id", "blinkit").eq("po_number", poNumber);
    let linesQuery = supabase.from("po_line").select("*").eq("channel_id", "blinkit").eq("po_number", poNumber);
    let planQuery = supabase.from("po_plan").select("*").eq("channel_id", "blinkit").eq("po_number", poNumber);
    let histQuery = supabase.from("po_state_history").select("*").eq("channel_id", "blinkit").eq("po_number", poNumber).order("changed_at", { ascending: false });

    headerQuery = headerQuery.eq("hub", hub);
    linesQuery = linesQuery.eq("hub", hub);
    planQuery = planQuery.eq("hub", hub);
    histQuery = histQuery.eq("hub", hub);

    const [headerRes, linesRes, skusList, planRes, histRes] = await Promise.all([
      headerQuery.maybeSingle(),
      linesQuery,
      fetchAllRows<SKUMaster>("sku_master"),
      planQuery.maybeSingle(),
      histQuery,
    ]);

    if (!headerRes.data) return null;

    const skuMap = new Map<string, SKUMaster>();
    skusList.forEach((s) => skuMap.set(s.item_id, s));

    const lines = (linesRes.data || []).map((l) => {
      const sku = skuMap.get(l.item_id);
      return {
        ...l,
        sku_name: sku?.name || "Unknown SKU",
        short_name: sku?.short_name || null,
        upc: sku?.upc || "",
        mrp: sku?.mrp || 0,
      };
    });

    return {
      header: headerRes.data,
      lines,
      plan: planRes.data || null,
      stateHistory: histRes.data || [],
      state_history: histRes.data || [],
    };
  } else {
    const store = loadStore();
    const header = store.po_header.find((h) => h.channel_id === "blinkit" && h.po_number === poNumber && h.hub === hub);
    if (!header) return null;

    const targetHub = header.hub;

    const lines = store.po_line
      .filter((l) => l.channel_id === "blinkit" && l.po_number === poNumber && l.hub === targetHub)
      .map((l) => {
        const sku = store.sku_master.find((s) => s.item_id === l.item_id);
        return {
          ...l,
          sku_name: sku?.name || "Unknown SKU",
          short_name: sku?.short_name || null,
          upc: sku?.upc || "",
          mrp: sku?.mrp || 0,
        };
      });

    const plan = store.po_plan.find((p) => p.channel_id === "blinkit" && p.po_number === poNumber && p.hub === targetHub) || null;
    const stateHistory = store.po_state_history
      .filter((h) => h.channel_id === "blinkit" && h.po_number === poNumber && h.hub === targetHub)
      .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());

    return { header, lines, plan, stateHistory, state_history: stateHistory };
  }
}

/**
 * 3. PLANNING SHEET: Fetch Matrix Data
 */
export async function getPlanningGrid(options: { hideClosed: boolean; city?: string; state?: string; hub: Hub }) {
  const status = await getDataAdapterStatus();
  let headers: POHeader[] = [];
  let lines: POLine[] = [];
  let skusMaster: SKUMaster[] = [];
  let stockSnapshot: StockSnapshot[] = [];
  let plans: POPlan[] = [];
  let dispatches: POLineDispatch[] = [];

  if (!status.isFallback) {
    const [hList, lList, sList, stockList, pList, dList] = await Promise.all([
      fetchAllRows<POHeader>("po_header", "*", undefined, [{ column: "hub", value: options.hub }]),
      fetchAllRows<POLine>("po_line", "*", undefined, [{ column: "hub", value: options.hub }]),
      fetchAllRows<SKUMaster>("sku_master"),
      fetchAllRows<StockSnapshot>("stock_snapshot", "*", undefined, [{ column: "hub", value: options.hub }]),
      fetchAllRows<POPlan>("po_plan", "*", undefined, [{ column: "hub", value: options.hub }]),
      fetchAllRows<POLineDispatch>("po_line_dispatch", "*", undefined, [{ column: "hub", value: options.hub }]),
    ]);
    headers = hList;
    lines = lList;
    skusMaster = sList;
    stockSnapshot = stockList;
    plans = pList;
    dispatches = dList;
  } else {
    const store = loadStore();
    headers = [...store.po_header];
    lines = [...store.po_line];
    skusMaster = [...store.sku_master];
    stockSnapshot = [...store.stock_snapshot];
    plans = [...store.po_plan];
    dispatches = [...store.po_line_dispatch];
  }

  // Filter by hub
  headers = headers.filter((h) => h.hub === options.hub);
  lines = lines.filter((l) => l.hub === options.hub);
  plans = plans.filter((p) => p.hub === options.hub);
  dispatches = dispatches.filter((d) => d.hub === options.hub);
  stockSnapshot = stockSnapshot.filter((s) => s.hub === options.hub);

  // Filter headers
  if (options.hideClosed) {
    headers = headers.filter((h) => h.po_state !== "Fulfilled" && h.po_state !== "Expired");
  }
  if (options.city) headers = headers.filter((h) => h.city === options.city);
  if (options.state) headers = headers.filter((h) => h.po_state === options.state);

  const activePoKeys = new Set(headers.map((h) => `${h.channel_id}:${h.hub}:${h.po_number}`));
  const activeLines = lines.filter((l) => activePoKeys.has(`${l.channel_id}:${l.hub}:${l.po_number}`));
  const activeSkuIds = Array.from(new Set(activeLines.map((l) => l.item_id)));

  // Open order calculations (Unscheduled, Scheduled, Partially Scheduled)
  const openPoKeys = new Set(
    headers
      .filter((h) => ["Unscheduled", "Scheduled", "Partially Scheduled"].includes(h.po_state))
      .map((h) => `${h.channel_id}:${h.hub}:${h.po_number}`)
  );

  // Store known stock values. If not in stock_snapshot, stock is unknown (null)
  const stockMap = new Map<string, number>();
  stockSnapshot.forEach((s) => stockMap.set(s.item_id, s.qty_in_hand));

  const openQtyMap = new Map<string, number>();
  lines.forEach((l) => {
    const key = `${l.channel_id}:${l.hub}:${l.po_number}`;
    if (openPoKeys.has(key)) {
      openQtyMap.set(l.item_id, (openQtyMap.get(l.item_id) || 0) + l.units_ordered);
    }
  });

  const isStockLoaded = stockSnapshot.length > 0;

  const skus = activeSkuIds.map((itemId) => {
    const sku = skusMaster.find((s) => s.item_id === itemId);
    const hasStock = stockMap.has(itemId);
    const stockInHand = hasStock ? stockMap.get(itemId)! : null;
    const totalOpenOrder = openQtyMap.get(itemId) || 0;
    const balance = stockInHand !== null ? stockInHand - totalOpenOrder : null;
    return {
      item_id: itemId,
      name: sku?.name || itemId,
      short_name: sku?.short_name || sku?.name || itemId,
      stock_in_hand: stockInHand,
      is_stock_known: hasStock,
      total_open_order: totalOpenOrder,
      balance,
    };
  });

  const totalMasterSkus = skusMaster.length > 0 ? skusMaster.length : 47;
  const hiddenSkusCount = Math.max(0, totalMasterSkus - skus.length);

  const lineQtyMap: Record<string, Record<string, number>> = {};
  activeLines.forEach((l) => {
    const key = `${l.channel_id}:${l.hub}:${l.po_number}`;
    if (!lineQtyMap[key]) lineQtyMap[key] = {};
    lineQtyMap[key][l.item_id] = l.units_ordered;
  });

  const planMap = new Map<string, POPlan>();
  plans.forEach((p) => planMap.set(`${p.channel_id}:${p.hub}:${p.po_number}`, p));

  const dispatchMap: Record<string, number> = {};
  dispatches.forEach((d) => {
    const key = `${d.channel_id}:${d.hub}:${d.po_number}`;
    dispatchMap[key] = (dispatchMap[key] || 0) + d.qty_dispatched;
  });

  const rows = headers.map((h) => {
    const key = `${h.channel_id}:${h.hub}:${h.po_number}`;
    const plan = planMap.get(key);
    const daysToExpiry = calculateDaysToExpiry(h.expiry_date);
    return {
      channel_id: h.channel_id,
      hub: h.hub,
      channel_name: "Blinkit",
      po_number: h.po_number,
      facility_raw: h.facility_raw,
      city: h.city,
      facility_code: h.facility_code,
      order_date: h.order_date,
      expiry_date: h.expiry_date,
      days_to_expiry: daysToExpiry,
      po_state: h.po_state,
      total_amount: Number(h.total_amount),
      total_qty: Number(h.total_qty),
      remarks: plan?.remarks || "",
      central_appointment_date: plan?.central_appointment_date || "",
      internal_dispatch_date: plan?.internal_dispatch_date || "",
      actual_dispatch_date: plan?.actual_dispatch_date || "",
      qty_dispatched: dispatchMap[key] || 0,
      sku_quantities: lineQtyMap[key] || {},
    };
  });

  const cities = Array.from(new Set(headers.map((h) => h.city).filter(Boolean))).sort();
  const states = Array.from(new Set(headers.map((h) => h.po_state).filter(Boolean))).sort();

  return { skus, rows, cities, states, isStockLoaded, totalMasterSkus, hiddenSkusCount };
}

/**
 * 4. UPDATE PLANNING ROW (remarks, dates, dispatch qty)
 */
export async function updatePlanningRow(body: {
  po_number: string;
  hub: Hub;
  remarks?: string;
  central_appointment_date?: string | null;
  internal_dispatch_date?: string | null;
  actual_dispatch_date?: string | null;
  qty_dispatched?: number;
  item_id?: string;
  updated_by?: string;
}) {
  const status = await getDataAdapterStatus();
  const { po_number, remarks, central_appointment_date, internal_dispatch_date, actual_dispatch_date, qty_dispatched, item_id, updated_by = "ops_team" } = body;
  const nowIso = new Date().toISOString();

  if (!po_number) throw new Error("po_number is required");

  if (!status.isFallback) {
    const supabase = getSupabaseClient()!;

    const targetHub = body.hub;

    // 1. Upsert po_plan
    const planQuery = supabase.from("po_plan").select("*").eq("channel_id", "blinkit").eq("hub", targetHub).eq("po_number", po_number);
    const { data: existingPlan } = await planQuery.maybeSingle();

    const planPayload: POPlan = {
      channel_id: "blinkit",
      hub: targetHub,
      po_number,
      remarks: remarks !== undefined ? remarks : existingPlan?.remarks || "",
      central_appointment_date: central_appointment_date !== undefined ? central_appointment_date : existingPlan?.central_appointment_date || null,
      internal_dispatch_date: internal_dispatch_date !== undefined ? internal_dispatch_date : existingPlan?.internal_dispatch_date || null,
      actual_dispatch_date: actual_dispatch_date !== undefined ? actual_dispatch_date : existingPlan?.actual_dispatch_date || null,
      updated_at: nowIso,
      updated_by,
    };
    await supabase.from("po_plan").upsert(planPayload, { onConflict: "channel_id,hub,po_number" });

    // 2. Upsert po_line_dispatch if provided
    if (qty_dispatched !== undefined) {
      let targetItemId = item_id;
      if (!targetItemId) {
        // Find first line item for this PO
        const lineQuery = supabase.from("po_line").select("item_id").eq("channel_id", "blinkit").eq("hub", targetHub).eq("po_number", po_number);
        const { data: lineRow } = await lineQuery.limit(1).maybeSingle();
        targetItemId = lineRow?.item_id;
      }
      if (targetItemId) {
        await supabase.from("po_line_dispatch").upsert({
          channel_id: "blinkit",
          hub: targetHub,
          po_number,
          item_id: targetItemId,
          qty_dispatched: Number(qty_dispatched) || 0,
          updated_at: nowIso,
          updated_by,
        }, { onConflict: "channel_id,hub,po_number,item_id" });
      }
    }

    // Also mirror to local store for offline consistency
    try {
      const store = loadStore();
      let plan = store.po_plan.find((p) => p.po_number === po_number && (targetHub ? p.hub === targetHub : true));
      if (!plan) {
        store.po_plan.push(planPayload);
      } else {
        if (remarks !== undefined) plan.remarks = remarks;
        if (central_appointment_date !== undefined) plan.central_appointment_date = central_appointment_date || null;
        if (internal_dispatch_date !== undefined) plan.internal_dispatch_date = internal_dispatch_date || null;
        if (actual_dispatch_date !== undefined) plan.actual_dispatch_date = actual_dispatch_date || null;
        plan.updated_at = nowIso;
        plan.updated_by = updated_by;
      }
      if (qty_dispatched !== undefined) {
        const targetItemId = item_id || store.po_line.find((l) => l.po_number === po_number && (targetHub ? l.hub === targetHub : true))?.item_id || "total_summary";
        let dispatch = store.po_line_dispatch.find((d) => d.po_number === po_number && (targetHub ? d.hub === targetHub : true) && (item_id ? d.item_id === item_id : true));
        if (!dispatch) {
          store.po_line_dispatch.push({
            channel_id: "blinkit",
            hub: targetHub,
            po_number,
            item_id: targetItemId,
            qty_dispatched: Number(qty_dispatched) || 0,
            updated_at: nowIso,
            updated_by,
          });
        } else {
          dispatch.qty_dispatched = Number(qty_dispatched) || 0;
          dispatch.updated_at = nowIso;
          dispatch.updated_by = updated_by;
        }
      }
      saveStore(store);
    } catch {}

    invalidateDataCache("table:po_plan");
    invalidateDataCache("table:po_line_dispatch");

    return { success: true, plan: planPayload };
  } else {
    const store = loadStore();
    const resolvedHub = body.hub;
    let plan = store.po_plan.find((p) => p.po_number === po_number && p.hub === resolvedHub);
    if (!plan) {
      plan = {
        channel_id: "blinkit",
        hub: resolvedHub,
        po_number,
        remarks: remarks || "",
        central_appointment_date: central_appointment_date || null,
        internal_dispatch_date: internal_dispatch_date || null,
        actual_dispatch_date: actual_dispatch_date || null,
        updated_at: nowIso,
        updated_by,
      };
      store.po_plan.push(plan);
    } else {
      if (remarks !== undefined) plan.remarks = remarks;
      if (central_appointment_date !== undefined) plan.central_appointment_date = central_appointment_date || null;
      if (internal_dispatch_date !== undefined) plan.internal_dispatch_date = internal_dispatch_date || null;
      if (actual_dispatch_date !== undefined) plan.actual_dispatch_date = actual_dispatch_date || null;
      plan.updated_at = nowIso;
      plan.updated_by = updated_by;
    }

    if (qty_dispatched !== undefined) {
      const targetItemId = item_id || store.po_line.find((l) => l.po_number === po_number && l.hub === resolvedHub)?.item_id || "total_summary";
      let dispatch = store.po_line_dispatch.find((d) => d.po_number === po_number && d.hub === resolvedHub && (item_id ? d.item_id === item_id : true));
      if (!dispatch) {
        store.po_line_dispatch.push({
          channel_id: "blinkit",
          hub: resolvedHub,
          po_number,
          item_id: targetItemId,
          qty_dispatched: Number(qty_dispatched) || 0,
          updated_at: nowIso,
          updated_by,
        });
      } else {
        dispatch.qty_dispatched = Number(qty_dispatched) || 0;
        dispatch.updated_at = nowIso;
        dispatch.updated_by = updated_by;
      }
    }

    saveStore(store);
    return { success: true, plan };
  }
}

/**
 * 5. COMPREHENSIVE CHANGE DETECTION & PREVIEW
 * Compares ALL Blinkit-owned fields per PO and per line (Item 3).
 */
export async function generateUploadPreview(
  cleanedRows: CleanedBlinkitRow[],
  fileName: string,
  rejectedRows: RejectedRow[] = []
): Promise<UploadPreview> {
  const status = await getDataAdapterStatus();
  let existingHeaders: POHeader[] = [];
  let existingLines: POLine[] = [];
  let nearExpiryDays = 7;

  if (!status.isFallback) {
    const hub = cleanedRows[0]?.hub;
    if (!hub) throw new Error("hub is required for upload preview");
    existingHeaders = await fetchAllRows<POHeader>("po_header", "*", undefined, [{ column: "hub", value: hub }]);
    existingLines = await fetchAllRows<POLine>("po_line", "*", undefined, [{ column: "hub", value: hub }]);
  } else {
    const store = loadStore();
    existingHeaders = [...store.po_header];
    existingLines = [...store.po_line];
  }

  const existingHeadersMap = new Map<string, POHeader>();
  existingHeaders.forEach((h) => existingHeadersMap.set(`${h.channel_id}:${h.hub}:${h.po_number}`, h));

  const existingLinesMap = new Map<string, POLine>();
  existingLines.forEach((l) => existingLinesMap.set(`${l.channel_id}:${l.hub}:${l.po_number}:${l.item_id}`, l));

  // Group upload rows by PO
  const rowMap = new Map<string, CleanedBlinkitRow[]>();
  cleanedRows.forEach((row) => {
    const key = `${row.channel_id}:${row.hub}:${row.po_number}`;
    if (!rowMap.has(key)) rowMap.set(key, []);
    rowMap.get(key)!.push(row);
  });

  let posNew = 0;
  let posUpdated = 0;
  let posUnchanged = 0;
  let posNearExpiry = 0;
  const stateChanges: UploadPreview["state_changes"] = [];
  const fieldChanges: Record<string, string[]> = {};

  rowMap.forEach((lines, key) => {
    const first = lines[0];
    const existing = existingHeadersMap.get(key);
    const isOpen = first.po_state !== "Expired" && first.po_state !== "Fulfilled";
    const daysToExpiry = calculateDaysToExpiry(first.expiry_date);

    // Near expiry: strictly open POs expiring in 0..7 days (Item 5)
    if (isOpen && daysToExpiry <= nearExpiryDays && daysToExpiry >= 0) {
      posNearExpiry++;
    }

    if (!existing) {
      posNew++;
    } else {
      const changedFields = new Set<string>();

      // 1. Compare PO Header fields
      if (existing.po_state !== first.po_state) {
        changedFields.add("po_state");
        stateChanges.push({
          po_number: first.po_number,
          old_state: existing.po_state,
          new_state: first.po_state,
        });
      }
      if (existing.expiry_date !== first.expiry_date) changedFields.add("expiry_date");
      if (existing.appointment_date !== first.appointment_date) changedFields.add("appointment_date");
      if (first.region !== undefined && existing.region !== first.region) changedFields.add("region");
      if (existing.facility_raw !== first.facility_raw) changedFields.add("facility_raw");
      if (existing.city !== first.city) changedFields.add("city");
      if (existing.facility_code !== first.facility_code) changedFields.add("facility_code");

      // 2. Compare Line Item fields
      lines.forEach((l) => {
        const lineKey = `${l.channel_id}:${l.hub}:${l.po_number}:${l.item_id}`;
        const exLine = existingLinesMap.get(lineKey);
        if (!exLine) {
          changedFields.add(`new_item_${l.item_id}`);
        } else {
          if (exLine.units_ordered !== l.units_ordered) changedFields.add("units_ordered");
          if (exLine.total_grn_quantity !== l.total_grn_quantity) changedFields.add("total_grn_quantity");
          if (exLine.remaining_quantity !== l.remaining_quantity) changedFields.add("remaining_quantity");
          if (Number(exLine.landing_rate) !== Number(l.landing_rate)) changedFields.add("landing_rate");
          if (Number(exLine.cost_price) !== Number(l.cost_price)) changedFields.add("cost_price");
          if (Number(exLine.margin_percentage) !== Number(l.margin_percentage)) changedFields.add("margin_percentage");
          if (Number(exLine.tax_value) !== Number(l.tax_value)) changedFields.add("tax_value");
          if (Number(exLine.total_amount) !== Number(l.total_amount)) changedFields.add("line_total_amount");
        }
      });

      // Compute merged header totals
      const existingPoLines = existingLines.filter(
        (l) => l.channel_id === first.channel_id && l.hub === first.hub && l.po_number === first.po_number
      );
      let mergedTotalQty = 0;
      let mergedTotalAmount = 0;
      const incomingItemIds = new Set<string>();

      lines.forEach((l) => {
        mergedTotalQty += l.units_ordered;
        mergedTotalAmount += l.total_amount;
        incomingItemIds.add(l.item_id);
      });
      existingPoLines.forEach((l) => {
        if (!incomingItemIds.has(l.item_id)) {
          mergedTotalQty += l.units_ordered;
          mergedTotalAmount += Number(l.total_amount);
        }
      });

      if (Number(existing.total_qty) !== mergedTotalQty) changedFields.add("total_qty");
      if (Math.round(Number(existing.total_amount)) !== Math.round(mergedTotalAmount)) changedFields.add("total_amount");

      if (changedFields.size > 0) {
        posUpdated++;
        fieldChanges[first.po_number] = Array.from(changedFields);
      } else {
        posUnchanged++;
      }
    }
  });

  const totalUnits = cleanedRows.reduce((acc, cur) => acc + cur.units_ordered, 0);
  const totalAmount = cleanedRows.reduce((acc, cur) => acc + cur.total_amount, 0);
  const hub = cleanedRows[0]?.hub || "delhi";

  return {
    file_name: fileName,
    hub,
    rows_total: cleanedRows.length + rejectedRows.length,
    rows_valid: cleanedRows.length,
    rows_rejected: rejectedRows.length,
    pos_total: rowMap.size,
    pos_new: posNew,
    pos_updated: posUpdated,
    pos_unchanged: posUnchanged,
    pos_near_expiry: posNearExpiry,
    total_units: totalUnits,
    total_amount: Math.round(totalAmount),
    state_changes: stateChanges,
    rejected_rows: rejectedRows,
    field_changes: fieldChanges,
  };
}

/**
 * 6. ATOMIC COMMIT (Item 2)
 * Fully awaited transaction with rollback on failure.
 */
export async function commitUploadTransaction(
  cleanedRows: CleanedBlinkitRow[],
  fileName: string,
  uploadedBy = "demand_team",
  forceErrorAfterHeader = false,
  rejectedRows: RejectedRow[] = []
): Promise<{ uploadId: string; preview: UploadPreview }> {
  const uploadId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const preview = await generateUploadPreview(cleanedRows, fileName, rejectedRows);
  const status = await getDataAdapterStatus();

  // Group by PO
  const poMap = new Map<string, CleanedBlinkitRow[]>();
  cleanedRows.forEach((r) => {
    const key = `${r.channel_id}:${r.hub}:${r.po_number}`;
    if (!poMap.has(key)) poMap.set(key, []);
    poMap.get(key)!.push(r);
  });

  if (!status.isFallback) {
    const supabase = getSupabaseClient()!;

    // Backup current state for rollback if server-side transaction fails
    const poEntries = Array.from(poMap.keys()).map((k) => {
      const parts = k.split(":");
      return { channel_id: parts[0], hub: parts[1], po_number: parts[2] };
    });
    const poNumbers = poEntries.map((e) => e.po_number);
    const hubs = Array.from(new Set(poEntries.map((e) => e.hub)));
    const channels = Array.from(new Set(poEntries.map((e) => e.channel_id)));

    const { data: backupHeaders } = await supabase.from("po_header").select("*").in("channel_id", channels).in("po_number", poNumbers).in("hub", hubs);
    const { data: backupLines } = await supabase.from("po_line").select("*").in("channel_id", channels).in("po_number", poNumbers).in("hub", hubs);

    try {
      // 1. Insert upload_log entry
      const { error: logErr } = await supabase.from("upload_log").insert({
        id: uploadId,
        channel_id: "blinkit",
        hub: preview.hub,
        file_name: fileName,
        uploaded_by: uploadedBy,
        uploaded_at: nowIso,
        rows_total: preview.rows_total,
        pos_new: preview.pos_new,
        pos_updated: preview.pos_updated,
        pos_unchanged: preview.pos_unchanged,
        rows_rejected: preview.rows_rejected,
        total_units: preview.total_units,
        total_amount: preview.total_amount,
        status: "completed",
        error_report: preview.rejected_rows,
      });
      if (logErr) throw new Error(`upload_log insert failed: ${logErr.message}`);

      // 2. Upsert SKU Master
      const skuMap = new Map<string, SKUMaster>();
      cleanedRows.forEach((r) => {
        if (!skuMap.has(r.item_id)) {
          skuMap.set(r.item_id, {
            item_id: r.item_id,
            name: r.name,
            short_name: null,
            upc: r.upc,
            uom_text: r.uom_text,
            mrp: r.mrp,
          });
        }
      });
      await mustUpsert(supabase, "sku_master", Array.from(skuMap.values()) as unknown as Record<string, unknown>[], "item_id");

      // 3. Upsert PO Headers
      const headersToUpsert: POHeader[] = [];
      const plansToInsert: POPlan[] = [];
      const stateHistoryToInsert: POStateHistory[] = [];
      const newHeadersCreated: POHeader[] = [];

      poMap.forEach((lines, poKey) => {
        const first = lines[0];
        const ex = backupHeaders?.find((h) => h.po_number === first.po_number && h.hub === first.hub);

        // Compute merged totals (existing lines for this PO not in incoming + incoming lines)
        let totalQty = 0;
        let totalAmount = 0;
        const incomingItemIds = new Set<string>();

        lines.forEach((l) => {
          totalQty += l.units_ordered;
          totalAmount += l.total_amount;
          incomingItemIds.add(l.item_id);
        });

        if (ex) {
          const exPoLines = (backupLines || []).filter((l) => l.po_number === first.po_number && l.hub === first.hub);
          exPoLines.forEach((l) => {
            if (!incomingItemIds.has(l.item_id)) {
              totalQty += l.units_ordered;
              totalAmount += Number(l.total_amount);
            }
          });

          if (ex.po_state !== first.po_state) {
            stateHistoryToInsert.push({
              id: crypto.randomUUID(),
              channel_id: first.channel_id,
              hub: first.hub,
              po_number: first.po_number,
              old_state: ex.po_state,
              new_state: first.po_state,
              changed_at: nowIso,
              upload_id: uploadId,
            });
          }
          headersToUpsert.push({
            ...ex,
            facility_raw: first.facility_raw,
            city: first.city,
            facility_code: first.facility_code,
            region: first.region ?? ex.region ?? null,
            order_date: first.order_date,
            expiry_date: first.expiry_date,
            appointment_date: first.appointment_date,
            po_state: first.po_state,
            total_qty: totalQty,
            total_amount: Math.round(totalAmount),
            last_seen_at: nowIso,
            last_upload_id: uploadId,
          });
        } else {
          const newHeader: POHeader = {
            channel_id: first.channel_id,
            hub: first.hub,
            po_number: first.po_number,
            facility_raw: first.facility_raw,
            city: first.city,
            facility_code: first.facility_code,
            region: first.region ?? null,
            order_date: first.order_date,
            expiry_date: first.expiry_date,
            appointment_date: first.appointment_date,
            po_state: first.po_state,
            total_qty: totalQty,
            total_amount: Math.round(totalAmount),
            first_seen_at: nowIso,
            last_seen_at: nowIso,
            first_upload_id: uploadId,
            last_upload_id: uploadId,
            is_deleted: false,
          };
          headersToUpsert.push(newHeader);
          newHeadersCreated.push(newHeader);
          plansToInsert.push({
            channel_id: first.channel_id,
            hub: first.hub,
            po_number: first.po_number,
            remarks: "",
            central_appointment_date: null,
            internal_dispatch_date: null,
            actual_dispatch_date: null,
            updated_at: nowIso,
            updated_by: "system_init",
          });
        }
      });

      await mustUpsert(supabase, "po_header", headersToUpsert as unknown as Record<string, unknown>[], "channel_id,hub,po_number");

      // ATOMICITY SIMULATION TEST: Throw error if requested
      if (forceErrorAfterHeader) {
        throw new Error("Simulated mid-commit failure after po_header write");
      }

      // 4. Upsert PO Lines in batches of 500
      const linesToUpsert: POLine[] = cleanedRows.map((line) => ({
        channel_id: line.channel_id,
        hub: line.hub,
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
      }));

      await mustUpsert(supabase, "po_line", linesToUpsert as unknown as Record<string, unknown>[], "channel_id,hub,po_number,item_id");

      // 5. Insert Plans for new POs (never overwriting team data)
      if (plansToInsert.length > 0) {
        for (let i = 0; i < plansToInsert.length; i += 500) {
          const chunk = plansToInsert.slice(i, i + 500);
          const { error: planErr } = await supabase.from("po_plan").insert(chunk);
          if (planErr) throw new Error(`po_plan insert failed: ${planErr.message}`);
        }
      }

      // 6. Insert State History
      if (stateHistoryToInsert.length > 0) {
        for (let i = 0; i < stateHistoryToInsert.length; i += 500) {
          const chunk = stateHistoryToInsert.slice(i, i + 500);
          const { error: histErr } = await supabase.from("po_state_history").insert(chunk);
          if (histErr) throw new Error(`po_state_history insert failed: ${histErr.message}`);
        }
      }

      // Sync local store as mirror cache
      const store = loadStore();
      store.sku_master = Array.from(skuMap.values());
      // Merge headersToUpsert into store.po_header
      const hMap = new Map<string, POHeader>();
      store.po_header.forEach((h) => hMap.set(`${h.channel_id}:${h.hub}:${h.po_number}`, h));
      headersToUpsert.forEach((h) => hMap.set(`${h.channel_id}:${h.hub}:${h.po_number}`, h));
      store.po_header = Array.from(hMap.values());

      // Merge linesToUpsert into store.po_line
      const lMap = new Map<string, POLine>();
      store.po_line.forEach((l) => lMap.set(`${l.channel_id}:${l.hub}:${l.po_number}:${l.item_id}`, l));
      linesToUpsert.forEach((l) => lMap.set(`${l.channel_id}:${l.hub}:${l.po_number}:${l.item_id}`, l));
      store.po_line = Array.from(lMap.values());

      if (plansToInsert.length > 0) {
        store.po_plan.push(...plansToInsert);
      }
      if (stateHistoryToInsert.length > 0) {
        store.po_state_history.push(...stateHistoryToInsert);
      }
      store.upload_log.unshift({
        id: uploadId,
        channel_id: "blinkit",
        hub: preview.hub,
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
      });
      saveStore(store);

      // 7. Dispatch Notifications (Checks 30, 31, 32)
      try {
        const dispatcher = getNotificationDispatcher();
        await dispatcher.notifyUploadSuccess(preview, store, newHeadersCreated);
        if (preview.state_changes && preview.state_changes.length > 0) {
          await dispatcher.notifyStateChanges(preview.state_changes, store);
        }
      } catch (notifErr) {
        console.warn("Notification dispatch warning:", notifErr);
      }

      invalidateDataCache();

      return { uploadId, preview };
    } catch (err) {
      // ROLLBACK: Purge all newly added records for this upload
      console.error("[TRANSACTION ROLLBACK] Error occurred during commit, rolling back changes:", err);

      // Delete lines for newly added POs for this hub
      const newPoNumbers = Array.from(poMap.keys())
        .filter((k) => !backupHeaders?.some((b) => `${b.channel_id}:${b.hub}:${b.po_number}` === k))
        .map((k) => k.split(":")[2]);

      if (newPoNumbers.length > 0) {
        await supabase.from("po_line").delete().in("channel_id", channels).in("po_number", newPoNumbers).in("hub", hubs);
        await supabase.from("po_plan").delete().in("channel_id", channels).in("po_number", newPoNumbers).in("hub", hubs);
        await supabase.from("po_header").delete().in("channel_id", channels).in("po_number", newPoNumbers).in("hub", hubs);
      }

      // 2. Restore previous headers
      if (backupHeaders && backupHeaders.length > 0) {
        await supabase.from("po_header").upsert(backupHeaders, { onConflict: "channel_id,hub,po_number" });
      }

      // 3. Delete upload_log entry
      await supabase.from("upload_log").delete().eq("id", uploadId);

      throw err;
    }
  } else {
    // JSON FALLBACK TRANSACTION
    const store = loadStore();
    const backupJson = JSON.stringify(store);

    try {
      if (forceErrorAfterHeader) {
        throw new Error("Simulated mid-commit failure in fallback mode");
      }
      // Mutate and save
      const result = await commitUploadFallback(cleanedRows, fileName, uploadedBy, store, uploadId, preview, nowIso);
      saveStore(store);
      return result;
    } catch (err) {
      // Rollback memory store
      const restored = JSON.parse(backupJson);
      saveStore(restored);
      throw err;
    }
  }
}

async function commitUploadFallback(
  cleanedRows: CleanedBlinkitRow[],
  fileName: string,
  uploadedBy: string,
  store: DatabaseStore,
  uploadId: string,
  preview: UploadPreview,
  nowIso: string
) {
  // Existing maps
  const headerMap = new Map<string, POHeader>();
  store.po_header.forEach((h) => headerMap.set(`${h.channel_id}:${h.hub}:${h.po_number}`, h));

  const planMap = new Map<string, POPlan>();
  store.po_plan.forEach((p) => planMap.set(`${p.channel_id}:${p.hub}:${p.po_number}`, p));

  const lineMap = new Map<string, POLine>();
  store.po_line.forEach((l) => lineMap.set(`${l.channel_id}:${l.hub}:${l.po_number}:${l.item_id}`, l));

  const skuMap = new Map<string, SKUMaster>();
  store.sku_master.forEach((s) => skuMap.set(s.item_id, s));

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
    }
  });

  const poMap = new Map<string, CleanedBlinkitRow[]>();
  cleanedRows.forEach((r) => {
    const key = `${r.channel_id}:${r.hub}:${r.po_number}`;
    if (!poMap.has(key)) poMap.set(key, []);
    poMap.get(key)!.push(r);
  });

  poMap.forEach((lines, poKey) => {
    const first = lines[0];
    const existingHeader = headerMap.get(poKey);

    // Compute merged totals
    const existingPoLines = store.po_line.filter(
      (l) => l.channel_id === first.channel_id && l.hub === first.hub && l.po_number === first.po_number
    );
    let totalQty = 0;
    let totalAmount = 0;
    const incomingItemIds = new Set<string>();

    lines.forEach((l) => {
      totalQty += l.units_ordered;
      totalAmount += l.total_amount;
      incomingItemIds.add(l.item_id);
    });

    if (existingHeader) {
      existingPoLines.forEach((l) => {
        if (!incomingItemIds.has(l.item_id)) {
          totalQty += l.units_ordered;
          totalAmount += Number(l.total_amount);
        }
      });

      if (existingHeader.po_state !== first.po_state) {
        store.po_state_history.push({
          id: crypto.randomUUID(),
          channel_id: first.channel_id,
          hub: first.hub,
          po_number: first.po_number,
          old_state: existingHeader.po_state,
          new_state: first.po_state,
          changed_at: nowIso,
          upload_id: uploadId,
        });
      }
      headerMap.set(poKey, {
        ...existingHeader,
        facility_raw: first.facility_raw,
        city: first.city,
        facility_code: first.facility_code,
        region: first.region ?? existingHeader.region ?? null,
        order_date: first.order_date,
        expiry_date: first.expiry_date,
        appointment_date: first.appointment_date,
        po_state: first.po_state,
        total_qty: totalQty,
        total_amount: Math.round(totalAmount),
        last_seen_at: nowIso,
        last_upload_id: uploadId,
      });
    } else {
      headerMap.set(poKey, {
        channel_id: first.channel_id,
        hub: first.hub,
        po_number: first.po_number,
        facility_raw: first.facility_raw,
        city: first.city,
        facility_code: first.facility_code,
        region: first.region ?? null,
        order_date: first.order_date,
        expiry_date: first.expiry_date,
        appointment_date: first.appointment_date,
        po_state: first.po_state,
        total_qty: totalQty,
        total_amount: Math.round(totalAmount),
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        first_upload_id: uploadId,
        last_upload_id: uploadId,
        is_deleted: false,
      });
      planMap.set(poKey, {
        channel_id: first.channel_id,
        hub: first.hub,
        po_number: first.po_number,
        remarks: "",
        central_appointment_date: null,
        internal_dispatch_date: null,
        actual_dispatch_date: null,
        updated_at: nowIso,
        updated_by: "system_init",
      });
    }

    lines.forEach((line) => {
      const lineKey = `${line.channel_id}:${line.hub}:${line.po_number}:${line.item_id}`;
      lineMap.set(lineKey, {
        channel_id: line.channel_id,
        hub: line.hub,
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

  store.sku_master = Array.from(skuMap.values());
  store.po_header = Array.from(headerMap.values());
  store.po_plan = Array.from(planMap.values());
  store.po_line = Array.from(lineMap.values());
  store.upload_log.unshift({
    id: uploadId,
    channel_id: "blinkit",
    hub: preview.hub,
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
  });

  try {
    const dispatcher = getNotificationDispatcher();
    await dispatcher.notifyUploadSuccess(preview, store);
    if (preview.state_changes && preview.state_changes.length > 0) {
      await dispatcher.notifyStateChanges(preview.state_changes, store);
    }
  } catch (notifErr) {
    console.warn("Notification dispatch fallback warning:", notifErr);
  }

  return { uploadId, preview };
}

/**
 * 7. STOCK SNAPSHOT OPERATIONS
 */
export async function getStockData(hub: Hub): Promise<StockSnapshot[]> {
  const status = await getDataAdapterStatus();
  if (!status.isFallback) {
    return fetchAllRows<StockSnapshot>("stock_snapshot", "*", undefined, [{ column: "hub", value: hub }]);
  } else {
    return loadStore().stock_snapshot.filter((row) => row.hub === hub);
  }
}

export async function updateStockData(updates: Array<{ item_id: string; qty_in_hand: number }>, hub: Hub, updatedBy = "ops_team") {
  const status = await getDataAdapterStatus();
  const nowIso = new Date().toISOString();

  if (!status.isFallback) {
    const supabase = getSupabaseClient()!;
    const payload = updates.map((u) => ({
      hub,
      item_id: u.item_id,
      qty_in_hand: Number(u.qty_in_hand) || 0,
      updated_at: nowIso,
      updated_by: updatedBy,
    }));
    const { error } = await supabase.from("stock_snapshot").upsert(payload, { onConflict: "hub,item_id" });
    if (error) throw error;
    invalidateDataCache("table:stock_snapshot");
    return { success: true, count: updates.length };
  } else {
    const store = loadStore();
    updates.forEach((u) => {
      const idx = store.stock_snapshot.findIndex((s) => s.hub === hub && s.item_id === u.item_id);
      const qty = Number(u.qty_in_hand) || 0;
      if (idx >= 0) {
        store.stock_snapshot[idx].qty_in_hand = qty;
        store.stock_snapshot[idx].updated_at = nowIso;
      } else {
        store.stock_snapshot.push({
          hub,
          item_id: u.item_id,
          qty_in_hand: qty,
          updated_at: nowIso,
          updated_by: updatedBy,
        });
      }
    });
    saveStore(store);
    invalidateDataCache("table:stock_snapshot");
    return { success: true, count: updates.length };
  }
}

/**
 * 8. RECIPIENTS & NOTIFICATIONS
 */
export async function getRecipientsData(): Promise<{
  recipients: NotificationRecipient[];
  in_app_notifications: InAppNotification[];
}> {
  const status = await getDataAdapterStatus();
  if (!status.isFallback) {
    const supabase = getSupabaseClient()!;
    const [recipList, notifRes] = await Promise.all([
      fetchAllRows<NotificationRecipient>("notification_recipients"),
      supabase.from("in_app_notifications").select("*").order("created_at", { ascending: false }),
    ]);
    return {
      recipients: recipList,
      in_app_notifications: notifRes.data || [],
    };
  } else {
    const store = loadStore();
    return {
      recipients: store.notification_recipients,
      in_app_notifications: store.in_app_notifications,
    };
  }
}

export async function saveRecipientData(body: Partial<NotificationRecipient>) {
  const status = await getDataAdapterStatus();
  const nowIso = new Date().toISOString();

  if (!status.isFallback) {
    const supabase = getSupabaseClient()!;
    const id = body.id || crypto.randomUUID();
    const payload = {
      id,
      name: body.name!,
      email: body.email || "",
      phone: body.phone || "",
      role: body.role || "Ops",
      channel_prefs: body.channel_prefs || { email: true, whatsapp: false, in_app: true },
      is_active: body.is_active !== undefined ? body.is_active : true,
      updated_at: nowIso,
    };
    const { error } = await supabase.from("notification_recipients").upsert(payload, { onConflict: "id" });
    if (error) throw error;
    const { data: all } = await supabase.from("notification_recipients").select("*");
    return { success: true, recipients: all || [] };
  } else {
    const store = loadStore();
    const id = body.id;
    if (id) {
      const idx = store.notification_recipients.findIndex((r) => r.id === id);
      if (idx >= 0) {
        store.notification_recipients[idx] = {
          ...store.notification_recipients[idx],
          name: body.name!,
          email: body.email || "",
          phone: body.phone || "",
          role: body.role || "Ops",
          channel_prefs: body.channel_prefs || store.notification_recipients[idx].channel_prefs,
          is_active: body.is_active !== undefined ? body.is_active : store.notification_recipients[idx].is_active,
          updated_at: nowIso,
        };
      }
    } else {
      store.notification_recipients.push({
        id: crypto.randomUUID(),
        name: body.name!,
        email: body.email || "",
        phone: body.phone || "",
        role: body.role || "Ops",
        channel_prefs: body.channel_prefs || { email: true, whatsapp: false, in_app: true },
        is_active: body.is_active !== undefined ? body.is_active : true,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
    saveStore(store);
    return { success: true, recipients: store.notification_recipients };
  }
}

export async function markNotificationsRead() {
  const status = await getDataAdapterStatus();
  if (!status.isFallback) {
    const supabase = getSupabaseClient()!;
    await supabase.from("in_app_notifications").update({ is_read: true }).eq("is_read", false);
    return { success: true };
  } else {
    const store = loadStore();
    store.in_app_notifications.forEach((n) => (n.is_read = true));
    saveStore(store);
    return { success: true };
  }
}

/**
 * 9. UPLOAD LOGS
 */
export async function getUploadLogs(hub: Hub): Promise<UploadLog[]> {
  const status = await getDataAdapterStatus();
  if (!status.isFallback) {
    const data = await fetchAllRows<any>("upload_log", "*", { column: "uploaded_at", ascending: false }, [{ column: "hub", value: hub }]);
    const mapped: UploadLog[] = (data || []).map((d) => ({
      id: d.id,
      channel_id: d.channel_id,
      hub: d.hub || "delhi",
      file_name: d.file_name,
      uploaded_by: d.uploaded_by,
      uploaded_at: d.uploaded_at,
      rows_total: d.rows_total,
      pos_new: d.pos_new,
      pos_updated: d.pos_updated,
      pos_unchanged: d.pos_unchanged,
      rows_rejected: d.rows_rejected,
      status: d.status,
      error_report: d.error_report,
      total_units: d.total_units || d.error_report?.total_units || 0,
      total_amount: d.total_amount || d.error_report?.total_amount || 0,
    }));
    return mapped;
  } else {
    const logs = loadStore().upload_log;
    return logs.filter((l) => l.hub === hub);
  }
}

/**
 * 10. SKU SHORT NAME UPDATE
 */
export async function updateSKUShortName(itemId: string, shortName: string) {
  const status = await getDataAdapterStatus();
  if (!status.isFallback) {
    const supabase = getSupabaseClient()!;
    const { error } = await supabase.from("sku_master").update({ short_name: shortName }).eq("item_id", itemId);
    if (error) throw error;
    invalidateDataCache("table:sku_master");
    return { success: true, item_id: itemId, short_name: shortName };
  } else {
    const store = loadStore();
    const sku = store.sku_master.find((s) => s.item_id === itemId);
    if (sku) {
      sku.short_name = shortName;
      saveStore(store);
    }
    invalidateDataCache("table:sku_master");
    return { success: true, item_id: itemId, short_name: shortName };
  }
}

/**
 * 11. E2E TEST PO ISOLATION (Guarantees zero mutation to live PO rows)
 */
export async function upsertTestPO(poNumber: string, hub: Hub) {
  if (!poNumber.startsWith("TEST-E2E-")) {
    throw new Error("Invalid test PO number: must start with TEST-E2E-");
  }
  const status = await getDataAdapterStatus();
  if (!status.isFallback) {
    const supabase = getSupabaseClient()!;
    const { data: skus } = await supabase.from("sku_master").select("item_id").limit(1);
    const itemId = skus?.[0]?.item_id || "10273355";

    await supabase.from("po_header").upsert({
      channel_id: "blinkit",
      hub,
      po_number: poNumber,
      facility_raw: "TEST E2E Facility",
      city: "Bengaluru",
      facility_code: "TEST01",
      order_date: "2026-10-19",
      expiry_date: "2026-10-30",
      po_state: "Unscheduled",
      total_qty: 10,
      total_amount: 1000,
    }, { onConflict: "channel_id,hub,po_number" });

    await supabase.from("po_line").upsert({
      channel_id: "blinkit",
      hub,
      po_number: poNumber,
      item_id: itemId,
      units_ordered: 10,
      remaining_quantity: 10,
      landing_rate: 100,
      cost_price: 100,
      total_amount: 1000,
    }, { onConflict: "channel_id,hub,po_number,item_id" });

    invalidateDataCache("table:po_header");
    invalidateDataCache("table:po_line");
    return { success: true, po_number: poNumber };
  } else {
    const store = loadStore();
    const existing = store.po_header.find((p) => p.po_number === poNumber && p.hub === hub);
    if (!existing) {
      store.po_header.push({
        channel_id: "blinkit",
        hub,
        po_number: poNumber,
        facility_raw: "TEST E2E Facility",
        city: "Bengaluru",
        facility_code: "TEST01",
        order_date: "2026-10-19",
        expiry_date: "2026-10-30",
        appointment_date: null,
        po_state: "Unscheduled",
        total_qty: 10,
        total_amount: 1000,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        is_deleted: false,
      });
      const itemId = store.sku_master[0]?.item_id || "10273355";
      store.po_line.push({
        channel_id: "blinkit",
        hub,
        po_number: poNumber,
        item_id: itemId,
        units_ordered: 10,
        total_grn_quantity: 0,
        remaining_quantity: 10,
        landing_rate: 100,
        cost_price: 100,
        margin_percentage: 0,
        tax_value: 0,
        total_amount: 1000,
      });
      saveStore(store);
    }
    invalidateDataCache("table:po_header");
    invalidateDataCache("table:po_line");
    return { success: true, po_number: poNumber };
  }
}

export async function deleteTestPO(poNumber: string, hub: Hub) {
  if (!poNumber.startsWith("TEST-E2E-")) {
    throw new Error("Invalid test PO number: must start with TEST-E2E-");
  }
  const status = await getDataAdapterStatus();
  if (!status.isFallback) {
    const supabase = getSupabaseClient()!;
    const planDel = supabase.from("po_plan").delete().eq("channel_id", "blinkit").eq("po_number", poNumber).eq("hub", hub);
    const dispDel = supabase.from("po_line_dispatch").delete().eq("channel_id", "blinkit").eq("po_number", poNumber).eq("hub", hub);
    const lineDel = supabase.from("po_line").delete().eq("channel_id", "blinkit").eq("po_number", poNumber).eq("hub", hub);
    const headDel = supabase.from("po_header").delete().eq("channel_id", "blinkit").eq("po_number", poNumber).eq("hub", hub);

    await planDel;
    await dispDel;
    await lineDel;
    const { error: headDelErr } = await headDel;
    if (headDelErr) throw headDelErr;

    invalidateDataCache("table:po_header");
    invalidateDataCache("table:po_line");
    invalidateDataCache("table:po_plan");
    invalidateDataCache("table:po_line_dispatch");
    return { success: true, po_number: poNumber, deleted: true };
  } else {
    const store = loadStore();
    store.po_header = store.po_header.filter((p) => p.po_number !== poNumber || p.hub !== hub);
    store.po_line = store.po_line.filter((l) => l.po_number !== poNumber || l.hub !== hub);
    store.po_plan = store.po_plan.filter((p) => p.po_number !== poNumber || p.hub !== hub);
    store.po_line_dispatch = store.po_line_dispatch.filter((d) => d.po_number !== poNumber || d.hub !== hub);
    saveStore(store);
    invalidateDataCache("table:po_header");
    invalidateDataCache("table:po_line");
    invalidateDataCache("table:po_plan");
    invalidateDataCache("table:po_line_dispatch");
    return { success: true, po_number: poNumber, deleted: true };
  }
}

