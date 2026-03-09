/**
 * SSS Compliance / Sanctions Screening Service
 *
 * Modular compliance service with pluggable provider interface.
 * Providers: StubProvider (default), ChainalysisProvider, EllipticProvider.
 * Select via COMPLIANCE_PROVIDER env var.
 *
 * Endpoints:
 *   POST /compliance/screen    - screen an address, returns risk assessment
 *   POST /compliance/batch     - screen multiple addresses at once
 *   GET  /compliance/status    - service status and statistics
 *   GET  /compliance/export    - export screening history (CSV/JSON)
 *   GET  /health               - health check
 *
 * Usage:
 *   PORT=3002 ts-node src/services/compliance-service.ts
 */

import express, { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "3002", 10);
const COMPLIANCE_PROVIDER = process.env.COMPLIANCE_PROVIDER || "stub";
const HISTORY_LOG_PATH =
  process.env.HISTORY_LOG_PATH || path.join(__dirname, "../../data/compliance-history.jsonl");

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
// ComplianceProvider interface
// ---------------------------------------------------------------------------

interface ComplianceProvider {
  name: string;
  screen(address: string): Promise<ScreeningResult> | ScreeningResult;
}

// ---------------------------------------------------------------------------
// StubProvider (default)
// ---------------------------------------------------------------------------

const SANCTIONED_ADDRESSES = new Set([
  "SanctionedAddr111111111111111111111111111",
  "SanctionedAddr222222222222222222222222222",
  "BlockedWa11et333333333333333333333333333",
]);

const HIGH_RISK_ADDRESSES = new Set([
  "HighRiskAddr111111111111111111111111111111",
  "MixerAddr2222222222222222222222222222222222",
]);

// Weighted scoring factors
const RISK_WEIGHTS = {
  sanctionsList: 100,
  highRiskList: 60,
  addressFormat: 20,
  transactionAge: 10,
  baseline: 5,
};

class StubProvider implements ComplianceProvider {
  name = "sss-compliance-stub";

  screen(address: string): ScreeningResult {
    let riskScore = RISK_WEIGHTS.baseline;
    const reasons: string[] = [];
    let sanctioned = false;

    // Weighted risk calculation
    if (SANCTIONED_ADDRESSES.has(address)) {
      riskScore = RISK_WEIGHTS.sanctionsList;
      sanctioned = true;
      reasons.push("Address found on sanctions list");
    } else if (HIGH_RISK_ADDRESSES.has(address)) {
      riskScore = RISK_WEIGHTS.highRiskList;
      reasons.push("Address associated with high-risk activity");
    } else {
      // Heuristic: short or non-standard addresses get extra risk
      if (address.length < 32) {
        riskScore += RISK_WEIGHTS.addressFormat;
        reasons.push("Address format appears non-standard");
      }
      // Add small random variance for realism
      riskScore += Math.floor(Math.random() * 10);
      if (reasons.length === 0) {
        reasons.push("No adverse information found");
      }
    }

    riskScore = Math.min(100, Math.max(0, riskScore));

    const riskLevel: RiskLevel = sanctioned
      ? "sanctioned"
      : riskScore >= 75
        ? "critical"
        : riskScore >= 50
          ? "high"
          : riskScore >= 25
            ? "medium"
            : "low";

    return {
      address,
      riskLevel,
      riskScore,
      sanctioned,
      reasons,
      screenedAt: new Date().toISOString(),
      provider: this.name,
    };
  }
}

// ---------------------------------------------------------------------------
// ChainalysisProvider (placeholder)
// ---------------------------------------------------------------------------

class ChainalysisProvider implements ComplianceProvider {
  name = "chainalysis";
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.CHAINALYSIS_API_KEY || "";
    this.baseUrl = process.env.CHAINALYSIS_API_URL || "https://api.chainalysis.com/api/kyt/v2";
  }

  async screen(address: string): Promise<ScreeningResult> {
    // In production, this would call:
    // POST ${this.baseUrl}/users/${userId}/transfers
    // with Authorization: ${this.apiKey}
    console.log(`[chainalysis] Would screen ${address} via ${this.baseUrl}`);

    return {
      address,
      riskLevel: "low",
      riskScore: 0,
      sanctioned: false,
      reasons: ["Chainalysis provider not configured - returning default"],
      screenedAt: new Date().toISOString(),
      provider: this.name,
    };
  }
}

// ---------------------------------------------------------------------------
// EllipticProvider (placeholder)
// ---------------------------------------------------------------------------

class EllipticProvider implements ComplianceProvider {
  name = "elliptic";
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.ELLIPTIC_API_KEY || "";
    this.baseUrl = process.env.ELLIPTIC_API_URL || "https://aml-api.elliptic.co/v2";
  }

  async screen(address: string): Promise<ScreeningResult> {
    // In production, this would call:
    // POST ${this.baseUrl}/wallet/synchronous
    // with x-access-key: ${this.apiKey}
    console.log(`[elliptic] Would screen ${address} via ${this.baseUrl}`);

    return {
      address,
      riskLevel: "low",
      riskScore: 0,
      sanctioned: false,
      reasons: ["Elliptic provider not configured - returning default"],
      screenedAt: new Date().toISOString(),
      provider: this.name,
    };
  }
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

function createProvider(name: string): ComplianceProvider {
  switch (name.toLowerCase()) {
    case "chainalysis":
      return new ChainalysisProvider();
    case "elliptic":
      return new EllipticProvider();
    case "stub":
    default:
      return new StubProvider();
  }
}

const provider = createProvider(COMPLIANCE_PROVIDER);

// ---------------------------------------------------------------------------
// In-memory statistics & history
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
// Persistence
// ---------------------------------------------------------------------------

function ensureLogDir(): void {
  const dir = path.dirname(HISTORY_LOG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function persistScreening(result: ScreeningResult): void {
  try {
    fs.appendFileSync(HISTORY_LOG_PATH, JSON.stringify(result) + "\n");
  } catch (err) {
    console.error(`[persist] Failed to write screening: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Screening logic
// ---------------------------------------------------------------------------

async function screenAddress(address: string): Promise<ScreeningResult> {
  const start = performance.now();

  const result = await provider.screen(address);

  const elapsed = performance.now() - start;

  // Update stats
  stats.totalScreenings++;
  stats.lastScreening = new Date().toISOString();
  stats.averageResponseMs =
    (stats.averageResponseMs * (stats.totalScreenings - 1) + elapsed) /
    stats.totalScreenings;
  if (result.sanctioned) stats.sanctionedHits++;
  if (result.riskScore >= 50) stats.highRiskHits++;

  // Keep history (bounded)
  screeningHistory.push(result);
  if (screeningHistory.length > MAX_HISTORY) {
    screeningHistory.shift();
  }

  // Persist to JSONL
  persistScreening(result);

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
    provider: provider.name,
    totalScreenings: stats.totalScreenings,
    uptime: process.uptime(),
  });
});

// Screen a single address
app.post("/compliance/screen", async (req: Request, res: Response) => {
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${apiKey}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const { address } = req.body as { address?: string };

  if (!address) {
    res.status(400).json({ error: "address is required" });
    return;
  }

  if (!isValidSolanaAddress(address) && !SANCTIONED_ADDRESSES.has(address) && !HIGH_RISK_ADDRESSES.has(address)) {
    res.status(400).json({ error: "Invalid Solana address format" });
    return;
  }

  const result = await screenAddress(address);

  console.log(
    `[screen] ${address} -> ${result.riskLevel} (score=${result.riskScore})`
  );

  res.json(result);
});

// Batch screening
app.post("/compliance/batch", async (req: Request, res: Response) => {
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${apiKey}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const { addresses } = req.body as { addresses?: string[] };

  if (!addresses || !Array.isArray(addresses)) {
    res.status(400).json({ error: "addresses must be an array" });
    return;
  }

  if (addresses.length > 100) {
    res.status(400).json({ error: "Maximum 100 addresses per batch" });
    return;
  }

  const results: (ScreeningResult | { address: string; error: string })[] = [];
  for (const addr of addresses) {
    if (!isValidSolanaAddress(addr) && !SANCTIONED_ADDRESSES.has(addr) && !HIGH_RISK_ADDRESSES.has(addr)) {
      results.push({ address: addr, error: "Invalid address format" });
    } else {
      results.push(await screenAddress(addr));
    }
  }

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
    provider: provider.name,
    sanctionsListSize: SANCTIONED_ADDRESSES.size,
    highRiskListSize: HIGH_RISK_ADDRESSES.size,
    recentScreenings: screeningHistory.slice(-20),
  });
});

// Export screening history
app.get("/compliance/export", (_req: Request, res: Response) => {
  const format = (_req.query.format as string) || "json";

  if (format === "csv") {
    const header = "address,riskLevel,riskScore,sanctioned,reasons,screenedAt,provider";
    const rows = screeningHistory.map((r) =>
      `${r.address},${r.riskLevel},${r.riskScore},${r.sanctioned},"${r.reasons.join("; ")}",${r.screenedAt},${r.provider}`
    );
    const csv = [header, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="compliance-history.csv"');
    res.send(csv);
  } else {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="compliance-history.json"');
    res.json({ screenings: screeningHistory, total: screeningHistory.length });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

ensureLogDir();

app.listen(PORT, () => {
  console.log("=== SSS Compliance Service ===");
  console.log(`Provider:  ${provider.name}`);
  console.log(`Listening: http://0.0.0.0:${PORT}`);
  console.log(`History:   ${HISTORY_LOG_PATH}`);
  console.log(`Sanctions: ${SANCTIONED_ADDRESSES.size} addresses`);
  console.log(`High-risk: ${HIGH_RISK_ADDRESSES.size} addresses`);
  console.log("");
});
