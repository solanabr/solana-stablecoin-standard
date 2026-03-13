import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";

import {
  StubProvider,
  createComplianceService,
  createProvider,
  validateApiKeys,
} from "../services/compliance-service";

describe("compliance service", () => {
  const apiKey = "test-api-key";
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    jest.restoreAllMocks();
  });

  function createTestService() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sss-compliance-"));
    tempDirs.push(tempDir);

    return createComplianceService({
      apiKey,
      historyLogPath: path.join(tempDir, "history.jsonl"),
      provider: new StubProvider(),
    });
  }

  it("screens a single address", async () => {
    const service = createTestService();

    const response = await request(service.app)
      .post("/compliance/screen")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        address: "SanctionedAddr111111111111111111111111111",
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      address: "SanctionedAddr111111111111111111111111111",
      riskLevel: "sanctioned",
      riskScore: 100,
      sanctioned: true,
    });
  });

  it("screens a batch of addresses and reports invalid entries", async () => {
    const service = createTestService();

    const response = await request(service.app)
      .post("/compliance/batch")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        addresses: [
          "SanctionedAddr111111111111111111111111111",
          "HighRiskAddr111111111111111111111111111111",
          "bad-address",
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.summary.total).toBe(3);
    expect(response.body.summary.sanctioned).toBe(1);
    expect(response.body.results[0]).toMatchObject({
      address: "SanctionedAddr111111111111111111111111111",
      riskLevel: "sanctioned",
      sanctioned: true,
    });
    expect(response.body.results[1]).toMatchObject({
      address: "HighRiskAddr111111111111111111111111111111",
      riskLevel: "high",
      riskScore: 60,
    });
    expect(response.body.results[2]).toEqual({
      address: "bad-address",
      error: "Invalid address format",
    });
  });

  it("exports screening history", async () => {
    const service = createTestService();

    await request(service.app)
      .post("/compliance/screen")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        address: "SanctionedAddr111111111111111111111111111",
      });

    const response = await request(service.app)
      .get("/compliance/export?format=csv")
      .set("Authorization", `Bearer ${apiKey}`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.text).toContain("address,riskLevel,riskScore,sanctioned");
    expect(response.text).toContain("SanctionedAddr111111111111111111111111111");
  });

  it("applies the expected risk scoring logic", () => {
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0);
    const provider = new StubProvider();

    expect(provider.screen("SanctionedAddr111111111111111111111111111")).toMatchObject({
      riskLevel: "sanctioned",
      riskScore: 100,
      sanctioned: true,
    });
    expect(provider.screen("HighRiskAddr111111111111111111111111111111")).toMatchObject({
      riskLevel: "high",
      riskScore: 60,
      sanctioned: false,
    });
    expect(provider.screen("short-address")).toMatchObject({
      riskLevel: "medium",
      riskScore: 25,
      sanctioned: false,
      reasons: ["Address format appears non-standard"],
    });

    randomSpy.mockRestore();
  });
});

describe("validateApiKeys", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws in production when stub provider is used", () => {
    process.env.NODE_ENV = "production";
    expect(() => validateApiKeys("stub")).toThrow(
      "Stub compliance provider cannot be used in production"
    );
  });

  it("throws in production for unknown provider (defaults to stub)", () => {
    process.env.NODE_ENV = "production";
    expect(() => validateApiKeys("unknown")).toThrow(
      "Stub compliance provider cannot be used in production"
    );
  });

  it("logs warning when stub is used in non-production", () => {
    process.env.NODE_ENV = "development";
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();
    validateApiKeys("stub");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("WARNING: Using stub compliance provider")
    );
    warnSpy.mockRestore();
  });

  it("throws when chainalysis provider is used without API key", () => {
    delete process.env.CHAINALYSIS_API_KEY;
    expect(() => validateApiKeys("chainalysis")).toThrow(
      "CHAINALYSIS_API_KEY environment variable is required"
    );
  });

  it("throws when elliptic provider is used without API key", () => {
    delete process.env.ELLIPTIC_API_KEY;
    expect(() => validateApiKeys("elliptic")).toThrow(
      "ELLIPTIC_API_KEY environment variable is required"
    );
  });

  it("passes when chainalysis provider has API key set", () => {
    process.env.CHAINALYSIS_API_KEY = "test-key";
    expect(() => validateApiKeys("chainalysis")).not.toThrow();
  });

  it("passes when elliptic provider has API key set", () => {
    process.env.ELLIPTIC_API_KEY = "test-key";
    expect(() => validateApiKeys("elliptic")).not.toThrow();
  });

  it("createProvider calls validateApiKeys and creates stub with warning in dev", () => {
    process.env.NODE_ENV = "development";
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();
    const provider = createProvider("stub");
    expect(provider.name).toBe("sss-compliance-stub");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("NOT suitable for production")
    );
    warnSpy.mockRestore();
  });
});
