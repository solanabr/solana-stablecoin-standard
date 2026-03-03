import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { mintBurnRouter } from "./services/mint-burn";
import { complianceRouter } from "./services/compliance";
import { indexerRouter } from "./services/indexer";
import { webhookRouter } from "./services/webhook";
import { adminRouter } from "./services/admin";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
}));
app.use(express.json());

// API key authentication middleware (skipped when API_KEY env is not set)
function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedKey = process.env.API_KEY;
  if (!expectedKey) {
    // Dev mode: no API_KEY configured, allow all requests
    return next();
  }
  const provided = req.headers["x-api-key"];
  if (!provided || provided !== expectedKey) {
    res.status(401).json({ error: "Unauthorized: invalid or missing API key" });
    return;
  }
  next();
}

// Health check (unauthenticated)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes – all protected by API key auth
app.use("/api/v1/mint-burn", apiKeyAuth, mintBurnRouter);
app.use("/api/v1/compliance", apiKeyAuth, complianceRouter);
app.use("/api/v1/indexer", apiKeyAuth, indexerRouter);
app.use("/api/v1/webhooks", apiKeyAuth, webhookRouter);
app.use("/api/v1/admin", apiKeyAuth, adminRouter);

app.listen(PORT, () => {
  console.log(`SSS Backend running on port ${PORT}`);
});

export default app;
