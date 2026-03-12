import express from "express";
import { logger } from "./logger";
import { blacklistRouter } from "./routes/blacklist";
import { auditRouter } from "./routes/audit";
import { screeningRouter } from "./routes/screening";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "sss-compliance", ts: new Date().toISOString() });
});

app.use("/api/blacklist", blacklistRouter);
app.use("/api/audit", auditRouter);
app.use("/api/screening", screeningRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Unhandled error", { error: err.message });
  res.status(500).json({ error: "Internal server error" });
});

const PORT = parseInt(process.env.PORT ?? "3003", 10);
app.listen(PORT, () => {
  logger.info("Compliance service started", { port: PORT });
});

export default app;
