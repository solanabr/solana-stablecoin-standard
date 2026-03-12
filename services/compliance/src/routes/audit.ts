import { Router } from "express";
import { logger } from "../logger";

export const auditRouter = Router();

const auditTrail: Array<{ action: string; ts: string; [key: string]: any }> = [];

export function auditLog(entry: Record<string, any>): void {
  const record: { action: string; ts: string; [key: string]: any } = {
    action: entry.action ?? "unknown",
    ts: new Date().toISOString(),
    ...entry,
  };
  auditTrail.push(record);
  logger.info("Audit", record);
}

auditRouter.get("/", (_req, res) => {
  const action = _req.query.action as string | undefined;
  const filtered = action
    ? auditTrail.filter((e) => e.action === action)
    : auditTrail;
  return res.json(filtered.slice().reverse());
});

auditRouter.get("/export", (_req, res) => {
  const csv = ["ts,action,address,operator,id"]
    .concat(
      auditTrail.map(
        (e) =>
          `${e.ts},${e.action},${e.address ?? ""},${e.operator ?? ""},${e.id ?? ""}`
      )
    )
    .join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=audit-log.csv");
  return res.send(csv);
});
