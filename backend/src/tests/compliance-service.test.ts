import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";

import {
  StubProvider,
  createComplianceService,
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

    const response = await request(service.app).get("/compliance/export?format=csv");

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
