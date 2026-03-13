/**
 * SSS Backend Services
 *
 * Fastify-based REST API providing:
 * - Token status and supply queries
 * - Minter and holder listings
 * - Compliance services (blacklist check, audit log)
 * - Supply history tracking
 * - WebSocket real-time events
 * - Event listener with webhook notifications
 * - Health check endpoint
 *
 * @module backend
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import dotenv from "dotenv";
import { PublicKey } from "@solana/web3.js";
import { deriveConfigPda } from "@stbr/sss-token";
import { loadConfig } from "./config";
import { StablecoinService } from "./services/stablecoin";
import { WebhookService } from "./services/webhook";
import { EventListener } from "./services/listener";
import { HistoryService } from "./services/history";


dotenv.config();

async function main() {
  const config = loadConfig();

  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv === "development"
          ? { target: "pino-pretty" }
          : undefined,
    },
  });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  // ── Initialize Services ─────────────────────────────────────────────

  let stablecoin: StablecoinService | null = null;
  let webhook: WebhookService;
  let listener: EventListener | null = null;
  const history = new HistoryService(200);
  const wsClients = new Set<any>();

  webhook = new WebhookService(config.webhookUrl, config.webhookSecret, app.log);

  if (config.mintAddress) {
    stablecoin = new StablecoinService(config.rpcUrl, config.mintAddress);

    // Start event listener
    const [configPda] = deriveConfigPda(new PublicKey(config.mintAddress));
    listener = new EventListener(config.rpcUrl, configPda, app.log, webhook);
    listener.start(10000).catch((err) => {
      app.log.error({ err: (err as Error).message }, "Event listener failed to start");
    });

    // Supply history sampling (every 30 seconds)
    const sampleSupply = async () => {
      try {
        const supply = await stablecoin!.getSupply();
        history.record(
          Number(supply.netSupply),
          Number(supply.totalMinted),
          Number(supply.totalBurned)
        );
      } catch {
        /* ignore sample errors */
      }
    };
    await sampleSupply();
    setInterval(sampleSupply, 30000);

    app.log.info({ mint: config.mintAddress }, "Stablecoin service initialized");
  } else {
    app.log.warn("No MINT_ADDRESS configured — read-only endpoints disabled");
  }

  // ── Middleware: require stablecoin service ───────────────────────────

  function requireMint() {
    if (!stablecoin) {
      throw { statusCode: 503, message: "MINT_ADDRESS not configured" };
    }
    return stablecoin;
  }

  // ── Health Check ────────────────────────────────────────────────────

  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    mint: config.mintAddress || null,
    webhooksEnabled: webhook.isEnabled,
  }));

  // ── Status ──────────────────────────────────────────────────────────

  app.get("/api/v1/status", async () => {
    const svc = requireMint();
    return svc.getStatus();
  });

  // ── Supply ──────────────────────────────────────────────────────────

  app.get("/api/v1/supply", async () => {
    const svc = requireMint();
    return svc.getSupply();
  });

  // ── Supply History ──────────────────────────────────────────────────

  app.get("/api/v1/supply/history", async () => {
    return { snapshots: history.getHistory() };
  });

  // ── Minters ─────────────────────────────────────────────────────────

  app.get("/api/v1/minters", async () => {
    const svc = requireMint();
    return { minters: await svc.getMinters() };
  });

  // ── Holders ─────────────────────────────────────────────────────────

  app.get("/api/v1/holders", async () => {
    const svc = requireMint();
    return { holders: await svc.getHolders() };
  });

  // ── Blacklist (all entries) ─────────────────────────────────────────

  app.get("/api/v1/blacklist", async () => {
    const svc = requireMint();
    return { entries: await svc.getBlacklist() };
  });

  // ── Blacklist Check (single address) ────────────────────────────────

  app.get<{ Params: { address: string } }>(
    "/api/v1/blacklist/:address",
    async (request) => {
      const svc = requireMint();
      const { address } = request.params;

      const isBlacklisted = await svc.isBlacklisted(address);
      const entry = isBlacklisted ? await svc.getBlacklistEntry(address) : null;

      return {
        address,
        isBlacklisted,
        entry: entry
          ? {
            reason: entry.reason,
            blacklistedAt: entry.blacklistedAt.toString(),
            blacklistedBy: entry.blacklistedBy.toBase58(),
          }
          : null,
      };
    }
  );

  // ── Audit Log ───────────────────────────────────────────────────────

  app.get<{ Querystring: { limit?: string } }>(
    "/api/v1/audit-log",
    async (request) => {
      const svc = requireMint();
      const limit = parseInt(request.query.limit || "20", 10);
      return { events: await svc.getAuditLog(limit) };
    }
  );

  // ── WebSocket ───────────────────────────────────────────────────────

  app.get("/ws", { websocket: true }, (socket: any) => {
    wsClients.add(socket);
    app.log.info(`WebSocket client connected (${wsClients.size} total)`);

    socket.on("close", () => {
      wsClients.delete(socket);
      app.log.info(`WebSocket client disconnected (${wsClients.size} total)`);
    });

    // Send initial status
    if (stablecoin) {
      stablecoin.getStatus().then((status: any) => {
        socket.send(JSON.stringify({ type: "status", data: status }));
      }).catch(() => { /* ignore */ });
    }
  });

  // Broadcast events to all WebSocket clients
  const broadcast = (event: { type: string; data: unknown }) => {
    const msg = JSON.stringify(event);
    for (const client of wsClients) {
      try { client.send(msg); } catch { /* ignore dead sockets */ }
    }
  };

  // Hook into event listener to broadcast transactions
  if (listener) {
    // Override: also broadcast events to websocket clients
    const oldWebhookNotify = webhook.notify.bind(webhook);
    (webhook as any).notify = (type: string, data: Record<string, unknown>) => {
      oldWebhookNotify(type, data);
      broadcast({ type, data });
    };
  }

  // ── Webhook Test ────────────────────────────────────────────────────

  app.post("/api/v1/webhook/test", async () => {
    if (!webhook.isEnabled) {
      return { success: false, message: "Webhooks not configured" };
    }

    const delivered = await webhook.send({
      type: "test",
      timestamp: new Date().toISOString(),
      data: { message: "Test webhook from SSS backend" },
    });

    return { success: delivered };
  });

  // ── Start Server ────────────────────────────────────────────────────

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info("Shutting down...");
    if (listener) await listener.stop();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Server running on ${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
