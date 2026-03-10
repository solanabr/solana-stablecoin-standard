import { Router, Request, Response } from "express";
import { createLogger } from "../logger";
import { getDb, WebhookRow } from "../services/database";

const log = createLogger("routes:webhooks");
const router = Router();

// ── POST /api/webhooks ──────────────────────────────────────────────────────

router.post("/webhooks", (req: Request, res: Response) => {
  try {
    const { url, eventTypes, secret } = req.body;

    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Missing or invalid url" });
      return;
    }

    try {
      new URL(url);
    } catch {
      res.status(400).json({ error: "url must be a valid URL" });
      return;
    }

    const types = eventTypes
      ? Array.isArray(eventTypes)
        ? eventTypes.join(",")
        : String(eventTypes)
      : "*";

    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO webhooks (url, event_types, secret) VALUES (?, ?, ?)`
      )
      .run(url, types, secret || null);

    const webhook = db
      .prepare("SELECT * FROM webhooks WHERE id = ?")
      .get(result.lastInsertRowid) as WebhookRow;

    log.info(`Webhook registered: id=${webhook.id}, url=${url}`);

    res.status(201).json({
      id: webhook.id,
      url: webhook.url,
      eventTypes: webhook.event_types,
      active: Boolean(webhook.active),
      createdAt: webhook.created_at,
    });
  } catch (err) {
    log.error("Webhook registration error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

// ── GET /api/webhooks ───────────────────────────────────────────────────────

router.get("/webhooks", (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const webhooks = db
      .prepare("SELECT * FROM webhooks ORDER BY id DESC")
      .all() as WebhookRow[];

    res.json({
      count: webhooks.length,
      webhooks: webhooks.map((w) => ({
        id: w.id,
        url: w.url,
        eventTypes: w.event_types,
        active: Boolean(w.active),
        createdAt: w.created_at,
      })),
    });
  } catch (err) {
    log.error("Webhook list error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

// ── DELETE /api/webhooks/:id ────────────────────────────────────────────────

router.delete("/webhooks/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid webhook id" });
      return;
    }

    const db = getDb();
    const result = db
      .prepare("UPDATE webhooks SET active = 0 WHERE id = ?")
      .run(id);

    if (result.changes === 0) {
      res.status(404).json({ error: "Webhook not found" });
      return;
    }

    log.info(`Webhook deactivated: id=${id}`);
    res.json({ status: "deactivated", id });
  } catch (err) {
    log.error("Webhook deletion error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

// ── GET /api/webhooks/:id/deliveries ────────────────────────────────────────

router.get("/webhooks/:id/deliveries", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid webhook id" });
      return;
    }

    const limit = Math.min(
      Math.max(parseInt(req.query.limit as string, 10) || 50, 1),
      200
    );
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

    const db = getDb();
    const deliveries = db
      .prepare(
        `SELECT * FROM webhook_deliveries
         WHERE webhook_id = ?
         ORDER BY id DESC
         LIMIT ? OFFSET ?`
      )
      .all(id, limit, offset);

    const countRow = db
      .prepare(
        "SELECT COUNT(*) as total FROM webhook_deliveries WHERE webhook_id = ?"
      )
      .get(id) as { total: number };

    res.json({
      webhookId: id,
      deliveries,
      pagination: {
        limit,
        offset,
        total: countRow.total,
        hasMore: offset + limit < countRow.total,
      },
    });
  } catch (err) {
    log.error("Webhook deliveries error", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

export default router;
