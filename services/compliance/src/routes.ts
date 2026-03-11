import { Router, Request, Response } from "express";
import { z } from "zod";
import { BlacklistService } from "./blacklist";
import { ScreeningService } from "./screening";
import { listAlerts, resolveAlert } from "./repository";
import { exportAuditTrail } from "./audit";

const addBlacklistSchema = z.object({
  wallet: z.string().min(32),
  reason: z.string().min(1).max(100),
});

const removeBlacklistSchema = z.object({
  wallet: z.string().min(32),
});

const screenSchema = z.object({
  address: z.string().min(32),
});

export function createComplianceRouter(
  blacklist: BlacklistService,
  screening: ScreeningService,
): Router {
  const router = Router();

  // ---- Blacklist ----

  router.post("/blacklist/add", async (req: Request, res: Response) => {
    const parsed = addBlacklistSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    try {
      const txSig = await blacklist.add(parsed.data.wallet, parsed.data.reason);
      res.json({ success: true, txSignature: txSig });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Blacklist add failed" });
    }
  });

  router.post("/blacklist/remove", async (req: Request, res: Response) => {
    const parsed = removeBlacklistSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    try {
      const txSig = await blacklist.remove(parsed.data.wallet);
      res.json({ success: true, txSignature: txSig });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Blacklist remove failed" });
    }
  });

  router.get("/blacklist", async (_req: Request, res: Response) => {
    try {
      const entries = await blacklist.getAll();
      res.json({ entries, count: entries.length });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch blacklist" });
    }
  });

  router.get("/blacklist/check/:wallet", async (req: Request, res: Response) => {
    const wallet = String(req.params.wallet);
    try {
      const result = await blacklist.isBlacklisted(wallet);
      res.json({ wallet, isBlacklisted: result });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Check failed" });
    }
  });

  // ---- Screening ----

  router.post("/screen", async (req: Request, res: Response) => {
    const parsed = screenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    try {
      const result = await screening.screen(parsed.data.address);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Screening failed" });
    }
  });

  // ---- Alerts ----

  router.get("/alerts", async (req: Request, res: Response) => {
    const { mint, severity, resolved, limit } = req.query as Record<string, string>;
    const alerts = await listAlerts({
      mint,
      severity,
      resolved: resolved !== undefined ? resolved === "true" : undefined,
      limit: limit ? parseInt(limit, 10) : 100,
    });
    res.json({ alerts, count: alerts.length });
  });

  router.patch("/alerts/:id/resolve", async (req: Request, res: Response) => {
    await resolveAlert(String(req.params.id));
    res.json({ success: true });
  });

  // ---- Audit ----

  router.get("/audit", async (req: Request, res: Response) => {
    const { mint, from, to, limit, format } = req.query as Record<string, string>;
    await exportAuditTrail({
      mint,
      from,
      to,
      limit: limit ? parseInt(limit, 10) : 500,
      format: format === "csv" ? "csv" : "json",
    }, res);
  });

  return router;
}
