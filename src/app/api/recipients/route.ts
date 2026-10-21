import { NextRequest, NextResponse } from "next/server";
import { getRecipientsData, saveRecipientData, markNotificationsRead } from "@/lib/data-layer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getRecipientsData();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error fetching recipients";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "mark_notifications_read") {
      const res = await markNotificationsRead();
      return NextResponse.json(res);
    }

    if (!body.name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const res = await saveRecipientData(body);
    return NextResponse.json(res);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error updating recipient";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
