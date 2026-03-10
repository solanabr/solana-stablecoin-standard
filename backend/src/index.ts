import express from "express";
import cors from "cors";
import { config } from "./config";
import { createLogger } from "./logger";
import { getDb, closeDb } from "./services/database";
import mintRoutes from "./routes/mint";
import complianceRoutes from "./routes/compliance";
import infoRoutes from "./routes/info";
import webhookRoutes from "./routes/webhooks";

const log = createLogger("server");

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ── Request logging ─────────────────────────────────────────────────────────

app.use((req, _res, next) => {
  log.debug(`${req.method} ${req.path}`);
  next();
});

// ── Health check ────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  try {
    // Verify DB connectivity
    const db = getDb();
    db.prepare("SELECT 1").get();

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      programs: {
        sssCore: config.programs.sssCore,
        sssHook: config.programs.sssHook,
      },
    });
  } catch (err) {
    log.error("Health check failed", err);
    res.status(503).json({
      status: "unhealthy",
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

// ── Routes ──────────────────────────────────────────────────────────────────

app.use("/api", mintRoutes);
app.use("/api", complianceRoutes);
app.use("/api", infoRoutes);
app.use("/api", webhookRoutes);

// ── Error handler ───────────────────────────────────────────────────────────

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    log.error("Unhandled error", err);
    res.status(500).json({
      error: "Internal server error",
      message:
        process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
);

// ── 404 handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Start server ────────────────────────────────────────────────────────────

function start(): void {
  // Initialize database
  getDb();

  const { port, host } = config.server;

  app.listen(port, host, () => {
    log.info(`SSS API server listening on ${host}:${port}`);
    log.info(`Health check: http://${host}:${port}/health`);
    log.info(`Programs: core=${config.programs.sssCore}, hook=${config.programs.sssHook}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    log.info("Shutting down API server...");
    closeDb();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) {
  start();
}

export { app };
