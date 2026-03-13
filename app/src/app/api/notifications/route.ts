import { NextRequest, NextResponse } from "next/server";
import {
  getStoredNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/webhook-store";

/**
 * GET /api/notifications?mint=...
 * Returns notifications received at POST /api/webhook (parsed from webhook service payloads).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get("mint") ?? null;
  const list = getStoredNotifications(mint);
  return NextResponse.json({ notifications: list, count: list.length });
}

/**
 * PATCH /api/notifications - mark read
 * Body: { id?: string, markAll?: boolean, mint?: string }
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      id?: string;
      markAll?: boolean;
      mint?: string | null;
    };
    if (body.markAll) {
      markAllNotificationsRead(body.mint ?? null);
      return NextResponse.json({ ok: true });
    }
    if (body.id) {
      markNotificationRead(body.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { error: "Provide id or markAll: true" },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}
