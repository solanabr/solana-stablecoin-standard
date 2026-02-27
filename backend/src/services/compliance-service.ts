/**
 * SSS Compliance / Sanctions Screening Service
 *
 * Stub service that checks Solana addresses against a hardcoded sanctions
 * list and returns a risk score. In production this would integrate with
 * providers like Chainalysis, Elliptic, or TRM Labs.
 *
 * Endpoints:
 *   POST /compliance/screen    - screen an address, returns risk assessment
 *   POST /compliance/batch     - screen multiple addresses at once
 *   GET  /compliance/status    - service status and statistics
 *   GET  /health               - health check
 *
 * Usage:
 *   PORT=3002 ts-node src/services/compliance-service.ts
 */

import express, { Request, Response } from "express";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "3002", 10);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RiskLevel = "low" | "medium" | "high" | "critical" | "sanctioned";

interface ScreeningResult {
  address: string;
  riskLevel: RiskLevel;
  riskScore: number; // 0-100
  sanctioned: boolean;
  reasons: string[];
  screenedAt: string;
  provider: string;
}

interface ServiceStats {
  totalScreenings: number;
  sanctionedHits: number;
  highRiskHits: number;
  averageResponseMs: number;
  lastScreening: string | null;
}

// ---------------------------------------------------------------------------
// Stub sanctions list (hardcoded for demo purposes)
// ---------------------------------------------------------------------------

/**
 * These are NOT real sanctioned addresses. They are fabricated base58
 * strings used solely for demonstrating the screening flow.
 */
const SANCTIONED_ADDRESSES = new Set([
  "SanctionedAddr111111111111111111111111111",
  "SanctionedAddr222222222222222222222222222",
  "BlockedWa11et333333333333333333333333333",
]);

/**
 * Addresses flagged as high-risk (e.g. associated with mixing services).
 */
const HIGH_RISK_ADDRESSES = new Set([
  "HighRiskAddr111111111111111111111111111111",
  "MixerAddr2222222222222222222222222222222222",
]);

// ---------------------------------------------------------------------------
// In-memory statistics
// ---------------------------------------------------------------------------

const stats: ServiceStats = {
  totalScreenings: 0,
  sanctionedHits: 0,
  highRiskHits: 0,
  averageResponseMs: 0,
  lastScreening: null,
};

const screeningHistory: ScreeningResult[] = [];
const MAX_HISTORY = 1000;

// ---------------------------------------------------------------------------
// Screening logic
// ---------------------------------------------------------------------------

function screenAddress(address: string): ScreeningResult {
  const start = performance.now();

  let riskLevel: RiskLevel = "low";
  let riskScore = 5;
  const reasons: string[] = [];
  let sanctioned = false;

  // Check sanctions list
  if (SANCTIONED_ADDRESSES.has(address)) {
    riskLevel = "sanctioned";
    riskScore = 100;
    sanctioned = true;
    reasons.push("Address found on sanctions list");
    stats.sanctionedHits++;
  }
  // Check high-risk list
  else if (HIGH_RISK_ADDRESSES.has(address)) {
    riskLevel = "high";
    riskScore = 75;
    reasons.push("Address associated with high-risk activity");
    stats.highRiskHits++;
  }
  // Heuristic: short or non-standard addresses get medium risk
  else if (address.length < 32) {
    riskLevel = "medium";
    riskScore = 40;
    reasons.push("Address format appears non-standard");
  }
  // Default: low risk
  else {
    riskLevel = "low";
    riskScore = Math.floor(Math.random() * 15); // 0-14
    reasons.push("No adverse information found");
  }

  const elapsed = performance.now() - start;

  // Update stats
  stats.totalScreenings++;
  stats.lastScreening = new Date().toISOString();
  stats.averageResponseMs =
    (stats.averageResponseMs * (stats.totalScreenings - 1) + elapsed) /
    stats.totalScreenings;

  const result: ScreeningResult = {
    address,
    riskLevel,
    riskScore,
    sanctioned,
    reasons,
    screenedAt: new Date().toISOString(),
    provider: "sss-compliance-stub",
  };

  // Keep history (bounded)
  screeningHistory.push(result);
  if (screeningHistory.length > MAX_HISTORY) {
    screeningHistory.shift();
  }

  return result;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidSolanaAddress(address: string): boolean {
  return BASE58_RE.test(address);
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "compliance-service",
    totalScreenings: stats.totalScreenings,
    uptime: process.uptime(),
  });
});

// Screen a single address
app.post("/compliance/screen", (req: Request, res: Response) => {
  const { address } = req.body as { address?: string };

  if (!address) {
    res.status(400).json({ error: "address is required" });
    return;
  }

  if (!isValidSolanaAddress(address) && !SANCTIONED_ADDRESSES.has(address) && !HIGH_RISK_ADDRESSES.has(address)) {
    res.status(400).json({ error: "Invalid Solana address format" });
    return;
  }

  const result = screenAddress(address);

  console.log(
    `[screen] ${address} -> ${result.riskLevel} (score=${result.riskScore})`
  );

  res.json(result);
});

// Batch screening
app.post("/compliance/batch", (req: Request, res: Response) => {
  const { addresses } = req.body as { addresses?: string[] };

  if (!addresses || !Array.isArray(addresses)) {
    res.status(400).json({ error: "addresses must be an array" });
    return;
  }

  if (addresses.length > 100) {
    res.status(400).json({ error: "Maximum 100 addresses per batch" });
    return;
  }

  const results = addresses.map((addr) => {
    if (!isValidSolanaAddress(addr) && !SANCTIONED_ADDRESSES.has(addr) && !HIGH_RISK_ADDRESSES.has(addr)) {
      return {
        address: addr,
        error: "Invalid address format",
      };
    }
    return screenAddress(addr);
  });

  const sanctionedCount = results.filter(
    (r) => "sanctioned" in r && (r as ScreeningResult).sanctioned
  ).length;

  console.log(
    `[batch] Screened ${addresses.length} addresses, ${sanctionedCount} sanctioned`
  );

  res.json({
    results,
    summary: {
      total: addresses.length,
      sanctioned: sanctionedCount,
      timestamp: new Date().toISOString(),
    },
  });
});

// Service status and statistics
app.get("/compliance/status", (_req: Request, res: Response) => {
  res.json({
    stats,
    sanctionsListSize: SANCTIONED_ADDRESSES.size,
    highRiskListSize: HIGH_RISK_ADDRESSES.size,
    recentScreenings: screeningHistory.slice(-20),
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log("=== SSS Compliance Service ===");
  console.log(`Listening on http://0.0.0.0:${PORT}`);
  console.log(`Sanctions list: ${SANCTIONED_ADDRESSES.size} addresses`);
  console.log(`High-risk list: ${HIGH_RISK_ADDRESSES.size} addresses`);
  console.log("");
});
