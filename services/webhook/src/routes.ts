import { Router, Request, Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  createSubscription,
  listSubscriptions,
  getSubscription,
  updateSubscription,
  listDeliveries,
} from "./repository";

const createSubSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(16).optional(),
  eventTypes: z.array(z.string()).min(1).default(["*"]),
  mintFilter: z.string().optional(),
});

const updateSubSchema = z.object({
  url: z.string().url().optional(),
  secret: z.string().min(16).optional(),
  eventTypes: z.array(z.string()).optional(),
  mintFilter: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export function createWebhookRouter(): Router {
  const router = Router();

  router.post("/subscriptions", async (req: Request, res: Response) => {
    const parsed = createSubSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    const { url, eventTypes, mintFilter } = parsed.data;
    const secret = parsed.data.secret ?? randomUUID();

    const sub = await createSubscription({ url, secret, eventTypes, mintFilter });
    res.status(201).json(sub);
  });

  router.get("/subscriptions", async (_req: Request, res: Response) => {
    const subs = await listSubscriptions(false);
    res.json({ subscriptions: subs, count: subs.length });
  });

  router.get("/subscriptions/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const sub = await getSubscription(id);
    if (!sub) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }
    res.json(sub);
  });

  router.patch("/subscriptions/:id", async (req: Request, res: Response) => {
    const parsed = updateSubSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    const id = String(req.params.id);
    const { url, secret, eventTypes, mintFilter, active } = parsed.data;
    const updated = await updateSubscription(id, {
      url,
      secret,
      event_types: eventTypes,
      mint_filter: mintFilter ?? undefined,
      active,
    });

    if (!updated) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }
    res.json(updated);
  });

  router.delete("/subscriptions/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const updated = await updateSubscription(id, { active: false });
    if (!updated) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }
    res.json({ success: true });
  });

  router.get("/deliveries", async (req: Request, res: Response) => {
    const { subscription_id, status, limit } = req.query as Record<string, string>;
    const deliveries = await listDeliveries({
      subscriptionId: subscription_id,
      status,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    res.json({ deliveries, count: deliveries.length });
  });

  return router;
}
