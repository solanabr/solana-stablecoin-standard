import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";

/**
 * Webhook registry for on-chain event notifications.
 *
 * Production implementation notes:
 * - A background listener (e.g. `Connection.onLogs`) watches program logs and
 *   parses mint/burn/compliance events.
 * - When a matching event fires, every registered subscription whose `events`
 *   array includes that event type receives an HTTP POST to its `url`.
 * - This in-memory registry is suitable for demo and local development only.
 *   Use a durable store (Redis, Postgres) in production.
 *
 * Supported event types (wire these from the listener when implemented):
 *   "mint" | "burn" | "freeze" | "unfreeze" | "allowlist" | "blocklist"
 */

interface WebhookSubscription {
  id: string;
  url: string;
  mint: string;
  events: string[];
  createdAt: string;
}

// In-memory registry – lost on process restart (demo only).
const subscriptions: Map<string, WebhookSubscription> = new Map();

/**
 * SSRF prevention: webhook URLs must be HTTPS and must not target
 * private/loopback/link-local address spaces.
 */
function isAllowedWebhookUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;

  const host = parsed.hostname;

  // Reject loopback and common private ranges
  const blocked = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,   // link-local
    /^::1$/,         // IPv6 loopback
    /^fc00:/i,       // IPv6 unique local
    /^fe80:/i,       // IPv6 link-local
  ];

  return !blocked.some((re) => re.test(host));
}

export const webhookRouter = Router();

/**
 * POST /webhook/subscribe
 * Register a URL to receive event notifications for a given mint.
 *
 * Body: { url: string, mint: string, events: string[] }
 */
webhookRouter.post("/subscribe", async (req: Request, res: Response) => {
  try {
    const { url, mint, events } = req.body;
    if (!url || !mint || !events || !Array.isArray(events)) {
      return res.status(400).json({
        error: "Missing required fields: url, mint, events (array)",
      });
    }

    if (!isAllowedWebhookUrl(url)) {
      return res.status(400).json({
        error: "Invalid webhook URL: must be HTTPS and not target private/loopback addresses",
      });
    }

    const id = randomUUID();
    const subscription: WebhookSubscription = {
      id,
      url,
      mint,
      events,
      createdAt: new Date().toISOString(),
    };

    subscriptions.set(id, subscription);

    res.json({ success: true, subscription });
  } catch (error: any) {
    console.error("webhook subscribe error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /webhook/unsubscribe/:id
 * Remove a previously registered webhook subscription.
 */
webhookRouter.delete(
  "/unsubscribe/:id",
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!subscriptions.has(id)) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      subscriptions.delete(id);
      res.json({ success: true, message: "Unsubscribed" });
    } catch (error: any) {
      console.error("webhook unsubscribe error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * GET /webhook/subscriptions
 * List all active webhook subscriptions (demo: in-memory only).
 */
webhookRouter.get("/subscriptions", async (_req: Request, res: Response) => {
  try {
    res.json({
      subscriptions: Array.from(subscriptions.values()),
    });
  } catch (error: any) {
    console.error("webhook list error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
