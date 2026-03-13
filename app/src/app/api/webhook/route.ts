import { NextRequest, NextResponse } from "next/server";
import { getStoredNotifications, appendNotification } from "@/lib/webhook-store";

/**
 * Webhook payload sent by the webhook service (POST from http://localhost:3003).
 * Same shape as documented in the webhook service.
 */
export type WebhookPayload = {
  deliveryId: string;
  subscriptionId: string;
  event: {
    eventId: string;
    eventType: string;
    mint: string;
    slot?: number;
    signature?: string;
    data?: Record<string, unknown>;
  };
  timestamp: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as unknown;
    const payload = body as WebhookPayload;

    if (
      !payload ||
      typeof payload.deliveryId === "undefined" ||
      !payload.event ||
      typeof payload.event.eventType !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid webhook payload: expected deliveryId, event.eventType" },
        { status: 400 },
      );
    }

    const notification = {
      id: String(payload.deliveryId),
      eventType: payload.event.eventType,
      createdAt: payload.timestamp ?? new Date().toISOString(),
      mint: payload.event.mint ?? "",
      signature: payload.event.signature,
      unread: true,
      payload: payload.event.data ?? {},
    };

    appendNotification(notification);

    return NextResponse.json({ received: true, deliveryId: payload.deliveryId }, { status: 200 });
  } catch (e) {
    console.error("Webhook POST error:", e);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 },
    );
  }
}
