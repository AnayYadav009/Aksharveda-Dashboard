import { NextRequest, NextResponse } from "next/server";
import { getPlanningGrid, updatePlanningRow } from "../../../lib/data-layer";
import { HubSchema } from "../../../lib/types";
import { authenticateApiRequest } from "../../../lib/server-auth";
import { isActionAuthorized } from "../../../lib/auth";
import { getAdminSupabaseClient } from "../../../lib/admin-auth";
import { isDispatchDateLocked, normalizeDispatchState, validatePlannedDate, validateTransition, type DispatchState } from "../../../lib/dispatch-state";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const historyPo = searchParams.get("history");
    const hubParam = searchParams.get("hub");
    const hubResult = HubSchema.safeParse(hubParam);
    if (!hubResult.success) {
      return NextResponse.json(
        { error: "Invalid or missing hub parameter: must be 'delhi' or 'kolkata'" },
        { status: 400 }
      );
    }

    if (historyPo) {
      const caller = await authenticateApiRequest(req);
      if (caller instanceof NextResponse) return caller;
      if (!isActionAuthorized(caller.role, "read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const admin = getAdminSupabaseClient();
      if (!admin) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
      const { data, error } = await admin.from("po_state_history").select("old_state,new_state,planned_dispatch_date,changed_by,changed_at,note").eq("channel_id", "blinkit").eq("hub", hubResult.data).eq("po_number", historyPo).order("changed_at", { ascending: false }).limit(30);
      if (error) return NextResponse.json({ error: "Unable to load state history" }, { status: 500 });
      return NextResponse.json({ history: data || [] });
    }

    const hideClosed = searchParams.get("hideClosed") !== "false";
    const city = searchParams.get("city") || "";
    const state = searchParams.get("state") || "";

    const data = await getPlanningGrid({
      hub: hubResult.data,
      hideClosed,
      city,
      state,
    });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error fetching planning sheet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "dispatch_state") {
      const caller = await authenticateApiRequest(req);
      if (caller instanceof NextResponse) return caller;
      if (!isActionAuthorized(caller.role, "planning_edit")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const hubResult = HubSchema.safeParse(body.hub);
      if (!hubResult.success) return NextResponse.json({ error: "Invalid hub" }, { status: 400 });
      const entries = Array.isArray(body.rows)
        ? body.rows.map((row: string | Record<string, unknown>) => typeof row === "string" ? { po_number: row, date: body.date, state: body.state, action: body.operation ?? "date", note: body.note } : { ...row, action: (row as Record<string, unknown>).operation ?? body.operation ?? "date" })
        : [{ po_number: body.po_number, date: body.date, state: body.state, action: body.operation ?? "date", note: body.note }];
      const admin = getAdminSupabaseClient();
      if (!admin) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
      // Preflight the entire batch before writing anything so bulk scheduling is all-or-nothing for validation failures.
      for (const entry of entries) {
        if (typeof entry.po_number !== "string" || !entry.po_number || !["date", "state"].includes(entry.action)) return NextResponse.json({ error: "Invalid dispatch operation" }, { status: 400 });
        const { data: header } = await admin.from("po_header").select("po_state,expiry_date").eq("channel_id", "blinkit").eq("hub", hubResult.data).eq("po_number", entry.po_number).maybeSingle();
        if (!header) return NextResponse.json({ error: `PO ${entry.po_number} not found` }, { status: 404 });
        const { data: plan } = await admin.from("po_plan").select("internal_dispatch_date").eq("channel_id", "blinkit").eq("hub", hubResult.data).eq("po_number", entry.po_number).maybeSingle();
        const from = normalizeDispatchState(header.po_state);
        const targetDate = entry.action === "state" ? plan?.internal_dispatch_date ?? null : entry.date ?? null;
        const dateCheck = entry.action === "state" && ["CANCELLED", "DELIVERED", "DISPATCHED"].includes(entry.state)
          ? { valid: true as const, warning: null as string | null }
          : validatePlannedDate(targetDate, header.expiry_date, today);
        if (!dateCheck.valid) return NextResponse.json({ error: dateCheck.error, po_number: entry.po_number }, { status: 400 });
        const to: DispatchState = entry.action === "state" ? entry.state : targetDate ? "SCHEDULED" : "UNSCHEDULED";
        const transition = validateTransition(from, to, targetDate);
        if (!transition.valid) return NextResponse.json({ error: transition.error, po_number: entry.po_number }, { status: 409 });
        if (isDispatchDateLocked(from) && entry.action !== "state") return NextResponse.json({ error: "Dispatch date is locked for this state" }, { status: 409 });
      }
      const results = [];
      for (const entry of entries) {
        const { data: header, error: headerError } = await admin.from("po_header").select("po_state,expiry_date").eq("channel_id", "blinkit").eq("hub", hubResult.data).eq("po_number", entry.po_number).single();
        if (headerError || !header) return NextResponse.json({ error: `PO ${entry.po_number} not found` }, { status: 404 });
        const { data: plan } = await admin.from("po_plan").select("internal_dispatch_date,dispatched_at").eq("channel_id", "blinkit").eq("hub", hubResult.data).eq("po_number", entry.po_number).maybeSingle();
        const from = normalizeDispatchState(header.po_state);

        const targetDate = entry.action === "state" ? plan?.internal_dispatch_date ?? null : entry.date ?? null;
        const dateCheck = entry.action === "state" && (entry.state === "CANCELLED" || entry.state === "DELIVERED" || entry.state === "DISPATCHED")
          ? { valid: true as const, warning: null as string | null }
          : validatePlannedDate(targetDate, header.expiry_date, today);
        if (!dateCheck.valid) return NextResponse.json({ error: dateCheck.error, po_number: entry.po_number }, { status: 400 });
        const to: DispatchState = entry.action === "state" ? entry.state : targetDate ? "SCHEDULED" : "UNSCHEDULED";
        const transition = validateTransition(from, to, targetDate);
        if (!transition.valid) return NextResponse.json({ error: transition.error, po_number: entry.po_number }, { status: 409 });
        if ((from === "DISPATCHED" || from === "DELIVERED" || from === "CANCELLED" || from === "EXPIRED") && entry.action !== "state") return NextResponse.json({ error: "Dispatch date is locked for this state" }, { status: 409 });
        const { error: applyError } = await admin.rpc("apply_dispatch_update", {
          p_hub: hubResult.data,
          p_po_number: entry.po_number,
          p_operation: entry.action,
          p_dispatch_date: entry.action === "date" ? targetDate : null,
          p_state: entry.action === "state" ? to : null,
          p_actor: caller.userId,
          p_note: entry.note || null,
        });
        if (applyError) return NextResponse.json({ error: applyError.message }, { status: 409 });
        results.push({ po_number: entry.po_number, state: to, warning: dateCheck.warning });
      }
      return NextResponse.json({ success: true, results });
    }

    if (body.action === "upsert_test_po" || body.action === "delete_test_po") {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const testHubResult = HubSchema.safeParse(body.hub);
      if (!testHubResult.success) {
        return NextResponse.json({ error: "Invalid or missing hub parameter: must be 'delhi' or 'kolkata'" }, { status: 400 });
      }
      const testHub = testHubResult.data;
      if (body.action === "upsert_test_po" && body.po_number?.startsWith("TEST-E2E-")) {
        const { upsertTestPO } = await import("../../../lib/data-layer");
        const result = await upsertTestPO(body.po_number, testHub);
        return NextResponse.json(result);
      }
      if (body.action === "delete_test_po" && body.po_number?.startsWith("TEST-E2E-")) {
        const { deleteTestPO } = await import("../../../lib/data-layer");
        const result = await deleteTestPO(body.po_number, testHub);
        return NextResponse.json(result);
      }
    }

    const hubResult = HubSchema.safeParse(body.hub);
    if (!hubResult.success) {
      return NextResponse.json(
        { error: "Invalid or missing hub parameter: must be 'delhi' or 'kolkata'" },
        { status: 400 }
      );
    }

    if (body.internal_dispatch_date !== undefined || body.actual_dispatch_date !== undefined) {
      return NextResponse.json({ error: "Dispatch dates must be changed through the audited dispatch workflow." }, { status: 400 });
    }

    const result = await updatePlanningRow(body);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error saving planning update";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
