/**
 * SSS Backend Services
 *
 * Fastify-based REST API providing:
 * - Token status and supply queries
 * - Minter and holder listings
 * - Compliance services (blacklist check, audit log)
 * - Event listener with webhook notifications
 * - Health check endpoint
 *
 * @module backend
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { PublicKey } from "@solana/web3.js";
import { deriveConfigPda } from "@stbr/sss-token";
import { loadConfig } from "./config";
import { StablecoinService } from "./services/stablecoin";
import { WebhookService } from "./services/webhook";
import { EventListener } from "./services/listener";

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

  // ── Initialize Services ─────────────────────────────────────────────

  let stablecoin: StablecoinService | null = null;
  let webhook: WebhookService;
  let listener: EventListener | null = null;

  webhook = new WebhookService(config.webhookUrl, config.webhookSecret, app.log);

  if (config.mintAddress) {
    stablecoin = new StablecoinService(config.rpcUrl, config.mintAddress);

    // Start event listener
    const [configPda] = deriveConfigPda(new PublicKey(config.mintAddress));
    listener = new EventListener(config.rpcUrl, configPda, app.log, webhook);
    listener.start(10000).catch((err) => {
      app.log.error({ err: (err as Error).message }, "Event listener failed to start");
    });

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

  // ── Blacklist Check ─────────────────────────────────────────────────

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
