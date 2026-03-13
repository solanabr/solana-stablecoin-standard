import express, { Express, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";

const DEFAULT_PORT = parseInt(process.env.PORT || "3002", 10);
const DEFAULT_PROVIDER_NAME = process.env.COMPLIANCE_PROVIDER || "stub";
const DEFAULT_HISTORY_LOG_PATH =
  process.env.HISTORY_LOG_PATH ||
  path.join(__dirname, "../../data/compliance-history.jsonl");
const MAX_HISTORY = 1000;

export type RiskLevel = "low" | "medium" | "high" | "critical" | "sanctioned";

export interface ScreeningResult {
  address: string;
  riskLevel: RiskLevel;
  riskScore: number;
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

export interface ComplianceProvider {
  name: string;
  screen(address: string): Promise<ScreeningResult> | ScreeningResult;
}

export const SANCTIONED_ADDRESSES = new Set([
  "SanctionedAddr111111111111111111111111111",
  "SanctionedAddr222222222222222222222222222",
  "BlockedWa11et333333333333333333333333333",
]);

export const HIGH_RISK_ADDRESSES = new Set([
  "HighRiskAddr111111111111111111111111111111",
  "MixerAddr2222222222222222222222222222222222",
]);

export const RISK_WEIGHTS = {
  sanctionsList: 100,
  highRiskList: 60,
  addressFormat: 20,
  transactionAge: 10,
  baseline: 5,
};

export class StubProvider implements ComplianceProvider {
  name = "sss-compliance-stub";

  screen(address: string): ScreeningResult {
    let riskScore = RISK_WEIGHTS.baseline;
    const reasons: string[] = [];
    let sanctioned = false;

    if (SANCTIONED_ADDRESSES.has(address)) {
      riskScore = RISK_WEIGHTS.sanctionsList;
      sanctioned = true;
      reasons.push("Address found on sanctions list");
    } else if (HIGH_RISK_ADDRESSES.has(address)) {
      riskScore = RISK_WEIGHTS.highRiskList;
      reasons.push("Address associated with high-risk activity");
    } else {
      if (address.length < 32) {
        riskScore += RISK_WEIGHTS.addressFormat;
        reasons.push("Address format appears non-standard");
      }

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

class ChainalysisProvider implements ComplianceProvider {
  name = "chainalysis";
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.CHAINALYSIS_API_KEY || "";
    this.baseUrl =
      process.env.CHAINALYSIS_API_URL || "https://api.chainalysis.com/api/kyt/v2";
  }

  async screen(address: string): Promise<ScreeningResult> {
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

class EllipticProvider implements ComplianceProvider {
  name = "elliptic";
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.ELLIPTIC_API_KEY || "";
    this.baseUrl = process.env.ELLIPTIC_API_URL || "https://aml-api.elliptic.co/v2";
  }

  async screen(address: string): Promise<ScreeningResult> {
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

export function validateApiKeys(providerName: string): void {
  const isProduction = process.env.NODE_ENV === "production";
  const name = providerName.trim().toLowerCase();
  const isStubProvider = name === "stub" || name === "sss-compliance-stub";

  if (isStubProvider || (name !== "chainalysis" && name !== "elliptic")) {
    if (isProduction) {
      throw new Error(
        "FATAL: Stub compliance provider cannot be used in production. " +
          "Set COMPLIANCE_PROVIDER to 'chainalysis' or 'elliptic' and provide the corresponding API key."
      );
    }
    console.warn(
      "⚠ WARNING: Using stub compliance provider. NOT suitable for production."
    );
    return;
  }

  if (name === "chainalysis" && !process.env.CHAINALYSIS_API_KEY?.trim()) {
    throw new Error(
      "FATAL: CHAINALYSIS_API_KEY environment variable is required for the Chainalysis provider."
    );
  }

  if (name === "elliptic" && !process.env.ELLIPTIC_API_KEY?.trim()) {
    throw new Error(
      "FATAL: ELLIPTIC_API_KEY environment variable is required for the Elliptic provider."
    );
  }
}

export function createProvider(name: string): ComplianceProvider {
  validateApiKeys(name);

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

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidSolanaAddress(address: string): boolean {
  return BASE58_RE.test(address);
}

function ensureLogDir(logPath: string): void {
  const directory = path.dirname(logPath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function persistScreening(logPath: string, result: ScreeningResult): void {
  try {
    fs.appendFileSync(logPath, `${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(`[persist] Failed to write screening: ${(error as Error).message}`);
  }
}

function isAuthorized(req: Request, res: Response, apiKey?: string): boolean {
  if (!apiKey) {
    return true;
  }

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${apiKey}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

interface ComplianceServiceOptions {
  apiKey?: string;
  port?: number;
  provider?: ComplianceProvider;
  providerName?: string;
  historyLogPath?: string;
}

export function createComplianceService(options: ComplianceServiceOptions = {}): {
  app: Express;
  state: {
    stats: ServiceStats;
    screeningHistory: ScreeningResult[];
  };
  provider: ComplianceProvider;
  screenAddress: (address: string) => Promise<ScreeningResult>;
  start: () => void;
} {
  const apiKey = options.apiKey?.trim() || process.env.API_KEY?.trim();
  const providerName = options.providerName ?? options.provider?.name ?? DEFAULT_PROVIDER_NAME;
  const port = options.port ?? DEFAULT_PORT;
  if (options.provider) {
    validateApiKeys(providerName);
  }
  const provider = options.provider ?? createProvider(providerName);
  const historyLogPath = options.historyLogPath ?? DEFAULT_HISTORY_LOG_PATH;

  ensureLogDir(historyLogPath);

  const stats: ServiceStats = {
    totalScreenings: 0,
    sanctionedHits: 0,
    highRiskHits: 0,
    averageResponseMs: 0,
    lastScreening: null,
  };
  const screeningHistory: ScreeningResult[] = [];

  async function screenAddress(address: string): Promise<ScreeningResult> {
    const startTime = performance.now();
    const result = await provider.screen(address);
    const elapsedMs = performance.now() - startTime;

    stats.totalScreenings++;
    stats.lastScreening = new Date().toISOString();
    stats.averageResponseMs =
      (stats.averageResponseMs * (stats.totalScreenings - 1) + elapsedMs) /
      stats.totalScreenings;

    if (result.sanctioned) {
      stats.sanctionedHits++;
    }
    if (result.riskScore >= 50) {
      stats.highRiskHits++;
    }

    screeningHistory.push(result);
    if (screeningHistory.length > MAX_HISTORY) {
      screeningHistory.shift();
    }

    persistScreening(historyLogPath, result);
    return result;
  }

  const app = express();
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "compliance-service",
      provider: provider.name,
      totalScreenings: stats.totalScreenings,
      uptime: process.uptime(),
    });
  });

  app.post("/compliance/screen", async (req: Request, res: Response) => {
    if (!isAuthorized(req, res, apiKey)) {
      return;
    }

    const { address } = req.body as { address?: string };
    if (!address) {
      res.status(400).json({ error: "address is required" });
      return;
    }

    if (
      !isValidSolanaAddress(address) &&
      !SANCTIONED_ADDRESSES.has(address) &&
      !HIGH_RISK_ADDRESSES.has(address)
    ) {
      res.status(400).json({ error: "Invalid Solana address format" });
      return;
    }

    const result = await screenAddress(address);

    console.log(`[screen] ${address} -> ${result.riskLevel} (score=${result.riskScore})`);
    res.json(result);
  });

  app.post("/compliance/batch", async (req: Request, res: Response) => {
    if (!isAuthorized(req, res, apiKey)) {
      return;
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

    const results: Array<ScreeningResult | { address: string; error: string }> = [];
    for (const address of addresses) {
      if (
        !isValidSolanaAddress(address) &&
        !SANCTIONED_ADDRESSES.has(address) &&
        !HIGH_RISK_ADDRESSES.has(address)
      ) {
        results.push({ address, error: "Invalid address format" });
        continue;
      }

      results.push(await screenAddress(address));
    }

    const sanctionedCount = results.filter(
      (result): result is ScreeningResult => "sanctioned" in result && result.sanctioned
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

  app.get("/compliance/status", (req: Request, res: Response) => {
    if (!isAuthorized(req, res, apiKey)) {
      return;
    }

    res.json({
      stats,
      provider: provider.name,
      sanctionsListSize: SANCTIONED_ADDRESSES.size,
      highRiskListSize: HIGH_RISK_ADDRESSES.size,
      recentScreenings: screeningHistory.slice(-20),
    });
  });

  app.get("/compliance/export", (req: Request, res: Response) => {
    if (!isAuthorized(req, res, apiKey)) {
      return;
    }

    const format = (req.query.format as string) || "json";

    if (format === "csv") {
      const header =
        "address,riskLevel,riskScore,sanctioned,reasons,screenedAt,provider";
      const rows = screeningHistory.map(
        (result) =>
          `${result.address},${result.riskLevel},${result.riskScore},${result.sanctioned},"${result.reasons.join(
            "; "
          )}",${result.screenedAt},${result.provider}`
      );

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="compliance-history.csv"'
      );
      res.send([header, ...rows].join("\n"));
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="compliance-history.json"'
    );
    res.json({ screenings: screeningHistory, total: screeningHistory.length });
  });

  function start(): void {
    app.listen(port, () => {
      console.log("=== SSS Compliance Service ===");
      console.log(`Provider:  ${provider.name}`);
      console.log(`Listening: http://0.0.0.0:${port}`);
      console.log(`History:   ${historyLogPath}`);
      console.log(`Sanctions: ${SANCTIONED_ADDRESSES.size} addresses`);
      console.log(`High-risk: ${HIGH_RISK_ADDRESSES.size} addresses`);
      console.log("");
    });
  }

  return {
    app,
    state: {
      stats,
      screeningHistory,
    },
    provider,
    screenAddress,
    start,
  };
}

if (require.main === module) {
  createComplianceService().start();
}
