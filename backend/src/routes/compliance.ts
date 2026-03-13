import { Router, Request, Response } from "express";
import { ComplianceService } from "../services/compliance";
import { logger } from "../services/logger";

export const complianceRouter = Router();

const complianceService = new ComplianceService();

complianceRouter.post("/screen", async (req: Request, res: Response) => {
  try {
    const { address } = req.body;
    if (!address) {
      res.status(400).json({ error: "address is required" });
      return;
    }

    const result = await complianceService.screenAddress(address);

    complianceService.recordAction({
      action: "screening",
      target: address,
      authority: "system",
      metadata: result,
    });

    res.json(result);
  } catch (err: any) {
    logger.error("Screening failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

complianceRouter.post("/record", async (req: Request, res: Response) => {
  try {
    const { action, target, reason, authority, signature, metadata } = req.body;
    if (!action || !target || !authority) {
      res.status(400).json({ error: "action, target, and authority are required" });
      return;
    }

    const record = complianceService.recordAction({
      action,
      target,
      reason,
      authority,
      signature,
      metadata,
    });

    res.status(201).json(record);
  } catch (err: any) {
    logger.error("Record action failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

complianceRouter.get("/audit-trail", async (req: Request, res: Response) => {
  const { action, target, from, to, format } = req.query;

  const filters: any = {};
  if (action) filters.action = action as string;
  if (target) filters.target = target as string;
  if (from) filters.fromDate = new Date(from as string);
  if (to) filters.toDate = new Date(to as string);

  if (format === "csv") {
    const csv = complianceService.exportAuditTrail("csv");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=audit-trail.csv");
    res.send(csv);
    return;
  }

  const records = complianceService.getAuditTrail(filters);
  res.json(records);
});

complianceRouter.get("/audit-trail/export", async (req: Request, res: Response) => {
  const format = (req.query.format as "json" | "csv") || "json";
  const data = complianceService.exportAuditTrail(format);

  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=audit-trail.csv");
  } else {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=audit-trail.json");
  }

  res.send(data);
});
