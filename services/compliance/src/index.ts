import express from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import pino from "pino";
import dotenv from "dotenv";

dotenv.config({ path: "../config/.env" });

const log = pino({ level: process.env.LOG_LEVEL || "info", name: "sss-compliance" });
const PORT = parseInt(process.env.PORT || "3003");
const app = express();
app.use(express.json());

// ─── Audit Trail ─────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  action: "blacklist_add" | "blacklist_remove" | "seize" | "screen";
  address: string;
  reason: string;
  operator: string;
  signature?: string;
  timestamp: string;
  result: "success" | "failed" | "pending";
}

const auditLog: AuditEntry[] = [];
const blacklistCache = new Map<string, { reason: string; addedAt: string }>();

// ─── Routes ──────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "compliance",
    uptime: process.uptime(),
    blacklistedAddresses: blacklistCache.size,
    auditEntries: auditLog.length,
  });
});

/** Screen an address against the blacklist. */
app.get("/api/screen/:address", (req, res) => {
  const { address } = req.params;
  const entry = blacklistCache.get(address);

  const audit: AuditEntry = {
    id: `screen-${Date.now()}`,
    action: "screen",
    address,
    reason: entry ? "blacklisted" : "clean",
    operator: "api",
    timestamp: new Date().toISOString(),
    result: "success",
  };
  auditLog.push(audit);

  res.json({
    address,
    blacklisted: !!entry,
    details: entry || null,
  });
});

/** Request to blacklist an address (queues for on-chain execution). */
app.post("/api/blacklist", (req, res) => {
  const { address, reason, operator } = req.body;

  if (!address || !reason || !operator) {
    return res.status(400).json({
      error: "Missing required fields: address, reason, operator",
    });
  }

  const audit: AuditEntry = {
    id: `bl-add-${Date.now()}`,
    action: "blacklist_add",
    address,
    reason,
    operator,
    timestamp: new Date().toISOString(),
    result: "pending",
  };
  auditLog.push(audit);

  // Cache locally (in production, this triggers SDK call)
  blacklistCache.set(address, { reason, addedAt: audit.timestamp });
  audit.result = "success";

  log.info({ address, reason, operator }, "Address blacklisted");
  res.status(201).json({ auditId: audit.id, status: "success" });
});

/** Remove an address from the blacklist. */
app.delete("/api/blacklist/:address", (req, res) => {
  const { address } = req.params;
  const { operator, reason } = req.body || {};

  const audit: AuditEntry = {
    id: `bl-rm-${Date.now()}`,
    action: "blacklist_remove",
    address,
    reason: reason || "manual removal",
    operator: operator || "api",
    timestamp: new Date().toISOString(),
    result: "pending",
  };
  auditLog.push(audit);

  if (blacklistCache.has(address)) {
    blacklistCache.delete(address);
    audit.result = "success";
    log.info({ address }, "Address removed from blacklist");
    res.json({ auditId: audit.id, status: "success" });
  } else {
    audit.result = "failed";
    res.status(404).json({ error: "Address not blacklisted" });
  }
});

/** Request to seize tokens from a blacklisted account. */
app.post("/api/seize", (req, res) => {
  const { address, amount, destination, operator } = req.body;

  if (!address || !amount || !destination || !operator) {
    return res.status(400).json({
      error: "Missing required fields: address, amount, destination, operator",
    });
  }

  if (!blacklistCache.has(address)) {
    return res.status(400).json({ error: "Address is not blacklisted" });
  }

  const audit: AuditEntry = {
    id: `seize-${Date.now()}`,
    action: "seize",
    address,
    reason: `Seize ${amount} tokens to ${destination}`,
    operator,
    timestamp: new Date().toISOString(),
    result: "pending",
  };
  auditLog.push(audit);

  // In production, this triggers SDK seize call
  audit.result = "success";
  log.info({ address, amount, destination, operator }, "Seizure executed");
  res.status(202).json({ auditId: audit.id, status: "success" });
});

/** Get the full audit log. */
app.get("/api/audit", (req, res) => {
  const { action, limit = "100" } = req.query;
  let filtered = auditLog;
  if (action) filtered = filtered.filter((a) => a.action === (action as string));
  res.json(filtered.slice(-parseInt(limit as string)));
});

/** Get all blacklisted addresses. */
app.get("/api/blacklist", (_req, res) => {
  const entries = Array.from(blacklistCache.entries()).map(([address, data]) => ({
    address,
    ...data,
  }));
  res.json({ count: entries.length, entries });
});

// ─── Start ───────────────────────────────────────────────────────

app.listen(PORT, () => {
  log.info({ port: PORT }, "Compliance service started");
});

export default app;
