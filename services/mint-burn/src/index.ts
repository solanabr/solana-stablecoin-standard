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

const PORT = parseInt(process.env.PORT || "3001");

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "sss-mint-burn", timestamp: new Date().toISOString() });
});

// Mint endpoint
app.post("/mint", async (req, res) => {
  const { recipient, amount, mint } = req.body;
  logger.info("Mint request", { recipient, amount, mint });

  try {
    // In production, this would use the SDK to execute the mint
    // const stable = await SolanaStablecoin.load(connection, wallet, new PublicKey(mint));
    // const sig = await stable.mint(new PublicKey(recipient), amount);
    res.json({ status: "pending", message: "Mint request queued" });
  } catch (err: any) {
    logger.error("Mint failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Burn endpoint
app.post("/burn", async (req, res) => {
  const { tokenAccount, amount, mint } = req.body;
  logger.info("Burn request", { tokenAccount, amount, mint });

  try {
    res.json({ status: "pending", message: "Burn request queued" });
  } catch (err: any) {
    logger.error("Burn failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Supply info
app.get("/supply/:mint", async (req, res) => {
  logger.info("Supply query", { mint: req.params.mint });
  res.json({ mint: req.params.mint, supply: "0", message: "Connect to RPC for live data" });
});

app.listen(PORT, () => {
  logger.info(`SSS Mint/Burn service running on port ${PORT}`);
});
