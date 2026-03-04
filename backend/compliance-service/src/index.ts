import express from "express";
import { json } from "express";
import pino from "pino";
import { config } from "dotenv";
import { complianceRoutes } from "./routes/compliance";
import { healthRoutes } from "./routes/health";

config();

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty" }
      : undefined,
});

const app = express();
app.use(json());

app.use((req, _res, next) => {
  logger.info({ method: req.method, path: req.path }, "incoming request");
  next();
});

app.use("/health", healthRoutes(logger));
app.use("/v1/compliance", complianceRoutes(logger));

const PORT = parseInt(process.env.PORT ?? "3003");
app.listen(PORT, () => {
  logger.info({ port: PORT }, "compliance-service started");
});

export { app };
