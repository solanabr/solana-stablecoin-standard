import "reflect-metadata";
import express from "express";
import { body, validationResult } from "express-validator";
import { PublicKey, Connection } from "@solana/web3.js";
import dotenv from "dotenv";
import { logger } from "../shared/logger";
import { db } from "./database";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

const PROGRAM_ID = new PublicKey(
  process.env.SSS2_PROGRAM_ID || "97WYcUSr6Y9YaDTM55PJYuAXpLL552HS6WXxVBmxAGmx"
);

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

// ==================== COMPLIANCE CHECKS ====================

/**
 * Check if an address is blacklisted
 */
app.post(
  "/check/blacklist",
  [
    body("address")
      .isString()
      .matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: "Invalid address" });
    }

    const { address } = req.body;

    try {
      // Check database
      const result = await db.query(
        "SELECT * FROM blacklist_events WHERE address = $1 AND action = 'add' ORDER BY slot DESC LIMIT 1",
        [address]
      );

      const isBlacklisted = result.rows.length > 0;

      logger.info(`Blacklist check: ${address} = ${isBlacklisted}`);

      res.json({
        success: true,
        data: {
          address,
          isBlacklisted,
          details: isBlacklisted ? result.rows[0] : null,
        },
      });
    } catch (error: any) {
      logger.error("Blacklist check error:", error);
      res.status(500).json({ error: "Check failed" });
    }
  }
);

/**
 * Check if an address is whitelisted
 */
app.post(
  "/check/whitelist",
  [
    body("address")
      .isString()
      .matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: "Invalid address" });
    }

    const { address } = req.body;

    try {
      const result = await db.query(
        "SELECT * FROM whitelist_events WHERE address = $1 AND action = 'add' ORDER BY slot DESC LIMIT 1",
        [address]
      );

      const isWhitelisted = result.rows.length > 0;

      res.json({
        success: true,
        data: {
          address,
          isWhitelisted,
          details: isWhitelisted ? result.rows[0] : null,
        },
      });
    } catch (error: any) {
      logger.error("Whitelist check error:", error);
      res.status(500).json({ error: "Check failed" });
    }
  }
);

/**
 * Full compliance check for a transfer
 */
app.post(
  "/check/transfer",
  [
    body("source")
      .isString()
      .matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
    body("destination")
      .isString()
      .matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
    body("amount").optional().isString(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const { source, destination, amount } = req.body;

    try {
      const startTime = Date.now();

      // Check both source and destination
      const [sourceBlacklist, destBlacklist] = await Promise.all([
        checkBlacklist(source),
        checkBlacklist(destination),
      ]);

      // Check whitelist status
      const [sourceWhitelist, destWhitelist] = await Promise.all([
        checkWhitelist(source),
        checkWhitelist(destination),
      ]);

      const isCompliant = !sourceBlacklist && !destBlacklist;

      const responseTime = Date.now() - startTime;

      logger.info(
        `Transfer check: ${source.slice(0, 8)}... -> ${destination.slice(
          0,
          8
        )}... = ${isCompliant ? "COMPLIANT" : "REJECTED"}`
      );

      res.json({
        success: true,
        data: {
          source: {
            address: source,
            isBlacklisted: sourceBlacklist,
            isWhitelisted: sourceWhitelist,
          },
          destination: {
            address: destination,
            isBlacklisted: destBlacklist,
            isWhitelisted: destWhitelist,
          },
          amount,
          isCompliant,
          shouldProceed: isCompliant,
          responseTimeMs: responseTime,
        },
      });
    } catch (error: any) {
      logger.error("Transfer check error:", error);
      res.status(500).json({ error: "Check failed" });
    }
  }
);

/**
 * Batch compliance check
 */
app.post(
  "/check/batch",
  [body("addresses").isArray({ min: 1, max: 100 })],
  async (req: any, res: any) => {
    const { addresses } = req.body;

    try {
      const results = await Promise.all(
        addresses.map(async (address: string) => {
          const [isBlacklisted, isWhitelisted] = await Promise.all([
            checkBlacklist(address),
            checkWhitelist(address),
          ]);

          return {
            address,
            isBlacklisted,
            isWhitelisted,
            status: isBlacklisted
              ? "blocked"
              : isWhitelisted
              ? "whitelisted"
              : "standard",
          };
        })
      );

      res.json({
        success: true,
        data: {
          total: results.length,
          blocked: results.filter((r: any) => r.isBlacklisted).length,
          whitelisted: results.filter((r: any) => r.isWhitelisted).length,
          results,
        },
      });
    } catch (error: any) {
      logger.error("Batch check error:", error);
      res.status(500).json({ error: "Batch check failed" });
    }
  }
);

/**
 * Get compliance stats
 */
app.get("/stats", async (req: any, res: any) => {
  try {
    const [blacklistCount, whitelistCount] = await Promise.all([
      db.query(
        "SELECT COUNT(DISTINCT address) as count FROM blacklist_events WHERE action = 'add'"
      ),
      db.query(
        "SELECT COUNT(DISTINCT address) as count FROM whitelist_events WHERE action = 'add'"
      ),
    ]);

    res.json({
      success: true,
      data: {
        blacklist: {
          totalAddresses: parseInt(blacklistCount.rows[0].count),
        },
        whitelist: {
          totalAddresses: parseInt(whitelistCount.rows[0].count),
        },
        program: PROGRAM_ID.toString(),
        network: process.env.SOLANA_NETWORK || "devnet",
      },
    });
  } catch (error: any) {
    logger.error("Stats error:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// Health check
app.get("/health", (req: any, res: any) => {
  res.json({ status: "healthy", service: "compliance" });
});

// Helper functions
async function checkBlacklist(address: string): Promise<boolean> {
  const result = await db.query(
    "SELECT 1 FROM blacklist_events WHERE address = $1 AND action = 'add' LIMIT 1",
    [address]
  );
  return result.rows.length > 0;
}

async function checkWhitelist(address: string): Promise<boolean> {
  const result = await db.query(
    "SELECT 1 FROM whitelist_events WHERE address = $1 AND action = 'add' LIMIT 1",
    [address]
  );
  return result.rows.length > 0;
}

// Initialize database
import("./database").then(async ({ initializeDatabase }) => {
  await initializeDatabase();

  app.listen(PORT, () => {
    logger.info(`Compliance Service running on port ${PORT}`);
  });
});

export default app;
