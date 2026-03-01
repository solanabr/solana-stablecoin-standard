import express from "express";
import { createLogger, format, transports } from "winston";
import dotenv from "dotenv";

dotenv.config();

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

const app = express();
app.use(express.json());
const PORT = parseInt(process.env.PORT || "3002");

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "sss-compliance" });
});

// Check if an address is blacklisted
app.get("/blacklist/check/:mint/:address", async (req, res) => {
  const { mint, address } = req.params;
  logger.info("Blacklist check", { mint, address });
  // In production: query on-chain blacklist PDA
  res.json({ mint, address, blacklisted: false, message: "Connect to RPC for live data" });
});

// Add to blacklist
app.post("/blacklist/add", async (req, res) => {
  const { mint, address, reason } = req.body;
  logger.info("Blacklist add request", { mint, address, reason });
  res.json({ status: "pending", message: "Blacklist request queued" });
});

// Remove from blacklist
app.post("/blacklist/remove", async (req, res) => {
  const { mint, address } = req.body;
  logger.info("Blacklist remove request", { mint, address });
  res.json({ status: "pending", message: "Removal request queued" });
});

// Seize tokens
app.post("/seize", async (req, res) => {
  const { mint, address, treasury } = req.body;
  logger.info("Seize request", { mint, address, treasury });
  res.json({ status: "pending", message: "Seize request queued" });
});

app.listen(PORT, () => {
  logger.info(`SSS Compliance service running on port ${PORT}`);
});
