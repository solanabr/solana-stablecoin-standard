import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pino from "pino";
import { PublicKey } from "@solana/web3.js";

import { EventIndexer } from "./indexer";
import { WebhookService } from "./webhook";
import { ComplianceService } from "./compliance";
import { MintBurnLifecycle } from "./mint-burn-lifecycle";

const log = pino({ name: "sss-api" });

interface ApiDependencies {
  indexer: EventIndexer;
  webhooks: WebhookService;
  compliance: ComplianceService;
  lifecycle: MintBurnLifecycle;
}

/**
 * REST API for the SSS backend services. Exposes endpoints for:
 *   - Token lifecycle operations (request mint/burn, approve, reject)
 *   - Webhook management (subscribe, unsubscribe)
 *   - Compliance alerts (list, acknowledge)
 *   - Health check
 */
export function createApiServer(deps: ApiDependencies): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    log.debug({ method: req.method, path: req.path }, "Request");
    next();
  });

  // --- Health ---
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: Date.now(),
      webhookQueueSize: deps.webhooks.getQueueSize(),
      pendingAlerts: deps.compliance.getSummary(),
    });
  });

  // --- Lifecycle: Mint ---
  app.post("/api/v1/mint/request", async (req: Request, res: Response) => {
    try {
      const { mint, destination, amount, requestedBy } = req.body;
      const result = await deps.lifecycle.requestMint(
        new PublicKey(mint),
        new PublicKey(destination),
        BigInt(amount),
        requestedBy
      );
      res.json(serializeRequest(result));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/v1/mint/approve/:id", async (req: Request, res: Response) => {
    try {
      const { approvedBy } = req.body;
      const result = await deps.lifecycle.approveMint(req.params.id, approvedBy);
      res.json(serializeRequest(result));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/v1/mint/reject/:id", (req: Request, res: Response) => {
    try {
      const { rejectedBy } = req.body;
      const result = deps.lifecycle.rejectMint(req.params.id, rejectedBy);
      res.json(serializeRequest(result));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Lifecycle: Burn ---
  app.post("/api/v1/burn/request", async (req: Request, res: Response) => {
    try {
      const { mint, amount, requestedBy } = req.body;
      const result = await deps.lifecycle.requestBurn(
        new PublicKey(mint),
        BigInt(amount),
        requestedBy
      );
      res.json(serializeRequest(result));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post("/api/v1/burn/approve/:id", async (req: Request, res: Response) => {
    try {
      const { approvedBy } = req.body;
      const result = await deps.lifecycle.approveBurn(req.params.id, approvedBy);
      res.json(serializeRequest(result));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Lifecycle: Pending requests ---
  app.get("/api/v1/requests/pending", (_req: Request, res: Response) => {
    const pending = deps.lifecycle.getPendingRequests();
    res.json({
      mints: pending.mints.map(serializeRequest),
      burns: pending.burns.map(serializeRequest),
    });
  });

  app.get("/api/v1/requests/:id", (req: Request, res: Response) => {
    const request = deps.lifecycle.getRequest(req.params.id);
    if (!request) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    res.json(serializeRequest(request));
  });

  // --- Webhooks ---
  app.post("/api/v1/webhooks", (req: Request, res: Response) => {
    try {
      const { id, url, events, secret } = req.body;
      deps.webhooks.subscribe({
        id: id ?? `wh-${Date.now()}`,
        url,
        events: events ?? ["*"],
        secret: secret ?? "",
        active: true,
        createdAt: Date.now(),
      });
      res.json({ status: "subscribed", id });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/v1/webhooks/:id", (req: Request, res: Response) => {
    const removed = deps.webhooks.unsubscribe(req.params.id);
    res.json({ removed });
  });

  // --- Compliance ---
  app.get("/api/v1/compliance/alerts", (req: Request, res: Response) => {
    const type = req.query.type as string | undefined;
    const alerts = type
      ? deps.compliance.getAlertsByType(type)
      : deps.compliance.getPendingAlerts();
    res.json({ alerts, summary: deps.compliance.getSummary() });
  });

  app.post("/api/v1/compliance/alerts/:id/acknowledge", (req: Request, res: Response) => {
    const acked = deps.compliance.acknowledgeAlert(req.params.id);
    res.json({ acknowledged: acked });
  });

  // --- Error handling ---
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error({ err }, "Unhandled API error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

// Serialize BigInt fields to strings for JSON
function serializeRequest(req: any): any {
  return JSON.parse(
    JSON.stringify(req, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}
