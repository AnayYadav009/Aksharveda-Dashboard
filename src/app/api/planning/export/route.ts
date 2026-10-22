import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getPlanningGrid } from "@/lib/data-layer";
import { HubSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const hubParam = searchParams.get("hub");
    const hubResult = HubSchema.safeParse(hubParam);
    if (!hubResult.success) {
      return NextResponse.json(
        { error: "Invalid or missing hub parameter: must be 'delhi' or 'kolkata'" },
        { status: 400 }
      );
    }
    const hub = hubResult.data;

    const hideExpiredAndFulfilled = searchParams.get("hideClosed") !== "false";
    const city = searchParams.get("city") || "";
    const state = searchParams.get("state") || "";

    const { skus, rows } = await getPlanningGrid({
      hub,
      hideClosed: hideExpiredAndFulfilled,
      city,
      state,
    });

    const fixedCols = [
      "Channel",
      "PO Number",
      "Store / Facility",
      "City",
      "State",
      "PO Date",
      "PO Expiry",
      "Days Left",
      "PO Value (INR)",
      "Remarks",
      "Central Appt Date",
      "Internal Planned Dispatch",
      "Actual Dispatch Date",
      "Total Qty",
      "Qty Dispatched",
    ];

    const aoaData: (string | number)[][] = [];

    // Header 1: Metadata & SKU names
    const row1 = [...fixedCols.map(() => ""), ...skus.map((s) => s.short_name || s.name)];
    row1[0] = "METRIC / SKU";
    aoaData.push(row1);

    // Header 2: Stock in hand
    const row2 = [...fixedCols.map(() => ""), ...skus.map((s) => s.stock_in_hand !== null ? s.stock_in_hand : "–")];
    row2[0] = "Stock In Hand";
    aoaData.push(row2);

    // Header 3: Total Open Order Qty
    const row3 = [...fixedCols.map(() => ""), ...skus.map((s) => s.total_open_order)];
    row3[0] = "Total Open Order Qty";
    aoaData.push(row3);

    // Header 4: Balance
    const row4 = [...fixedCols.map(() => ""), ...skus.map((s) => s.balance !== null ? s.balance : "–")];
    row4[0] = "Net Balance (Deficit if < 0)";
    aoaData.push(row4);

    // Empty separator row
    aoaData.push([]);

    // Table Header Row
    const tableHeader = [...fixedCols, ...skus.map((s) => s.short_name || s.name)];
    aoaData.push(tableHeader);

    // Table Data Rows
    rows.forEach((r) => {
      const dataRow: (string | number)[] = [
        "Blinkit",
        r.po_number,
        r.facility_raw,
        r.city || "",
        r.po_state,
        r.order_date,
        r.expiry_date,
        r.days_to_expiry,
        r.total_amount,
        r.remarks || "",
        r.central_appointment_date || "",
        r.internal_dispatch_date || "",
        r.actual_dispatch_date || "",
        r.total_qty,
        r.qty_dispatched || 0,
      ];

      skus.forEach((s) => {
        dataRow.push(r.sku_quantities?.[s.item_id] || 0);
      });

      aoaData.push(dataRow);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(aoaData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dispatch Plan");

    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(excelBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="aksharveda_dispatch_plan_${Date.now()}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error exporting excel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
