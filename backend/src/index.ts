/**
 * SSS Backend Services
 *
 * Fastify-based REST API providing:
 * - Mint/burn lifecycle management
 * - Event listener and indexing
 * - Compliance services (SSS-2)
 * - Webhook notifications
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";

dotenv.config();

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

async function main() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      transport:
        process.env.NODE_ENV === "development"
          ? { target: "pino-pretty" }
          : undefined,
    },
  });

  await app.register(cors, { origin: true });

  // ── Health Check ───────────────────────────────────────────────────

  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  }));

  // ── Mint/Burn Routes ───────────────────────────────────────────────

  app.post("/api/v1/mint", async (request, reply) => {
    // TODO: Phase 6 — Implementation
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.post("/api/v1/burn", async (request, reply) => {
    // TODO: Phase 6
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.get("/api/v1/supply", async () => {
    // TODO: Phase 6
    return { totalSupply: "0", circulatingSupply: "0" };
  });

  // ── Compliance Routes (SSS-2) ──────────────────────────────────────

  app.post("/api/v1/blacklist", async (request, reply) => {
    // TODO: Phase 6
    return reply.status(501).send({ error: "Not implemented" });
  });

  app.delete("/api/v1/blacklist/:address", async (request, reply) => {
    // TODO: Phase 6
    return reply.status(501).send({ error: "Not implemented" });
  });

  // ── Audit Log ──────────────────────────────────────────────────────

  app.get("/api/v1/audit-log", async () => {
    // TODO: Phase 6
    return { events: [] };
  });

  // ── Start Server ───────────────────────────────────────────────────

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server running on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
