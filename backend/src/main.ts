import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { logger } from "./services/logger";
import { operationsRouter } from "./routes/operations";
import { complianceRouter } from "./routes/compliance";
import { healthRouter } from "./routes/health";
import { authMiddleware } from "./middleware/auth";
import { createRateLimiter } from "./middleware/rate-limit";
import { EventListener } from "./services/event-listener";
import { getSolanaService } from "./services/solana";

dotenv.config();

const app = express();
const port = parseInt(process.env.PORT || "3000", 10);

// Security & parsing middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : false,
}));
app.use(express.json());

// Public routes
app.use("/health", healthRouter);

// Protected routes
app.use("/operations", authMiddleware, createRateLimiter(), operationsRouter);
app.use("/compliance", authMiddleware, createRateLimiter(), complianceRouter);

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error("Unhandled error", {
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: "Internal server error" });
  },
);

let eventListenerRef: EventListener | null = null;

const server = app.listen(port, () => {
  logger.info(`SSS Backend listening on port ${port}`);

  // Start event listener if WebSocket URL is configured
  const wsUrl = process.env.SOLANA_WS_URL;
  if (wsUrl) {
    try {
      const solanaService = getSolanaService();
      const eventListener = new EventListener(
        solanaService.connection,
        solanaService.coreProgramId,
        solanaService.hookProgramId,
      );
      eventListener.start();
      eventListenerRef = eventListener;
      logger.info("Event listener started");
    } catch (err) {
      logger.warn("Event listener not started — Solana connection unavailable", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
});

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  if (eventListenerRef) {
    await eventListenerRef.stop();
    logger.info("Event listener stopped");
  }
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
