import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "../../../lib/data-layer";
import { authenticateApiRequest } from "../../../lib/server-auth";
import { HubSchema } from "../../../lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateApiRequest(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

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

    const view = searchParams.get("view") || "month";
    const month = searchParams.get("month");
    const days = parseInt(searchParams.get("days") || "30", 10);
    const search = searchParams.get("search")?.toLowerCase() || "";
    const city = searchParams.get("city") || "";
    const state = searchParams.get("state") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const sortKey = searchParams.get("sortKey") || "order_date";
    const sortDir = (searchParams.get("sortDir") as "asc" | "desc") || "desc";
    const paginate = searchParams.get("paginate") !== "false";

    const data = await getDashboardData({
      hub,
      view,
      month,
      days,
      search,
      city,
      state,
      page,
      pageSize,
      sortKey,
      sortDir,
      paginate,
    });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error loading POs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
