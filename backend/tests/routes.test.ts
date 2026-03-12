/**
 * Route validation tests.
 *
 * Verifies that API routes exist and that input validation works correctly,
 * returning proper error codes for missing or invalid parameters. These tests
 * run against the Express app directly (via supertest) and do not require a
 * Solana validator.
 */

import "./setup"; // must be first

import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/index";
import { closeDb } from "../src/services/database";

afterAll(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------

describe("404 handler", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/nonexistent");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });
});

// ---------------------------------------------------------------------------
// Compliance routes — /api/blacklist/*
// ---------------------------------------------------------------------------

describe("POST /api/blacklist/add", () => {
  it("returns 400 when mint is missing", async () => {
    const res = await request(app)
      .post("/api/blacklist/add")
      .send({ wallet: "11111111111111111111111111111111", reason: "test" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mint/i);
  });

  it("returns 400 when wallet is missing", async () => {
    const res = await request(app)
      .post("/api/blacklist/add")
      .send({ mint: "11111111111111111111111111111111", reason: "test" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/wallet/i);
  });

  it("returns 400 when reason is missing", async () => {
    const res = await request(app)
      .post("/api/blacklist/add")
      .send({
        mint: "11111111111111111111111111111111",
        wallet: "11111111111111111111111111111111",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/i);
  });

  it("returns 400 when reason exceeds 64 characters", async () => {
    const res = await request(app)
      .post("/api/blacklist/add")
      .send({
        mint: "11111111111111111111111111111111",
        wallet: "11111111111111111111111111111111",
        reason: "a".repeat(65),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/64/);
  });

  it("returns 400 for an invalid public key format", async () => {
    const res = await request(app)
      .post("/api/blacklist/add")
      .send({
        mint: "not-a-pubkey",
        wallet: "11111111111111111111111111111111",
        reason: "test",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mint/i);
  });

  it("succeeds with valid parameters", async () => {
    const res = await request(app)
      .post("/api/blacklist/add")
      .send({
        mint: "11111111111111111111111111111111",
        wallet: "11111111111111111111111111111112",
        reason: "sanction",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("accepted");
    expect(res.body.accounts).toBeDefined();
    expect(res.body.accounts.blacklistEntry).toBeDefined();
  });
});

describe("POST /api/blacklist/remove", () => {
  it("returns 400 when mint is missing", async () => {
    const res = await request(app)
      .post("/api/blacklist/remove")
      .send({ wallet: "11111111111111111111111111111111" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mint/i);
  });

  it("returns 400 when wallet is missing", async () => {
    const res = await request(app)
      .post("/api/blacklist/remove")
      .send({ mint: "11111111111111111111111111111111" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/wallet/i);
  });

  it("succeeds with valid parameters", async () => {
    const res = await request(app)
      .post("/api/blacklist/remove")
      .send({
        mint: "11111111111111111111111111111111",
        wallet: "11111111111111111111111111111112",
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("accepted");
  });
});

describe("GET /api/blacklist/check/:wallet", () => {
  it("returns 400 for invalid wallet address", async () => {
    const res = await request(app).get("/api/blacklist/check/bad-key");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/wallet/i);
  });

  it("returns 400 when mint query param is missing", async () => {
    const res = await request(app).get(
      "/api/blacklist/check/11111111111111111111111111111111"
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mint/i);
  });
});

// ---------------------------------------------------------------------------
// Mint routes — /api/mint, /api/burn, /api/supply
// ---------------------------------------------------------------------------

describe("POST /api/mint", () => {
  it("returns 400 when mintAddress is missing", async () => {
    const res = await request(app)
      .post("/api/mint")
      .send({
        destination: "11111111111111111111111111111111",
        amount: "1000",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mintAddress/i);
  });

  it("returns 400 when destination is missing", async () => {
    const res = await request(app)
      .post("/api/mint")
      .send({
        mintAddress: "11111111111111111111111111111111",
        amount: "1000",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/destination/i);
  });

  it("returns 400 when amount is zero or negative", async () => {
    const res = await request(app)
      .post("/api/mint")
      .send({
        mintAddress: "11111111111111111111111111111111",
        destination: "11111111111111111111111111111111",
        amount: "0",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/amount/i);
  });

  it("returns 400 when amount is missing", async () => {
    const res = await request(app)
      .post("/api/mint")
      .send({
        mintAddress: "11111111111111111111111111111111",
        destination: "11111111111111111111111111111111",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/amount/i);
  });
});

describe("POST /api/burn", () => {
  it("returns 400 when mintAddress is missing", async () => {
    const res = await request(app)
      .post("/api/burn")
      .send({
        tokenAccount: "11111111111111111111111111111111",
        amount: "1000",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mintAddress/i);
  });

  it("returns 400 when tokenAccount is missing", async () => {
    const res = await request(app)
      .post("/api/burn")
      .send({
        mintAddress: "11111111111111111111111111111111",
        amount: "1000",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tokenAccount/i);
  });

  it("returns 400 when amount is invalid", async () => {
    const res = await request(app)
      .post("/api/burn")
      .send({
        mintAddress: "11111111111111111111111111111111",
        tokenAccount: "11111111111111111111111111111111",
        amount: "-5",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/amount/i);
  });
});

describe("GET /api/supply", () => {
  it("returns 400 when mint query param is missing", async () => {
    const res = await request(app).get("/api/supply");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mint/i);
  });

  it("returns 400 for invalid mint address", async () => {
    const res = await request(app).get("/api/supply?mint=not-valid");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mint/i);
  });
});

// ---------------------------------------------------------------------------
// Info routes — /api/config/:mint, /api/minters/:mint, /api/minter/:mint/:wallet
// ---------------------------------------------------------------------------

describe("GET /api/config/:mint", () => {
  it("returns 400 for invalid mint address", async () => {
    const res = await request(app).get("/api/config/not-valid");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mint/i);
  });
});

describe("GET /api/minters/:mint", () => {
  it("returns 400 for invalid mint address", async () => {
    const res = await request(app).get("/api/minters/not-valid");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mint/i);
  });
});

describe("GET /api/minter/:mint/:wallet", () => {
  it("returns 400 for invalid mint", async () => {
    const res = await request(app).get(
      "/api/minter/not-valid/11111111111111111111111111111111"
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mint/i);
  });

  it("returns 400 for invalid wallet", async () => {
    const res = await request(app).get(
      "/api/minter/11111111111111111111111111111111/not-valid"
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/wallet/i);
  });
});

// ---------------------------------------------------------------------------
// Webhook routes — /api/webhooks
// ---------------------------------------------------------------------------

describe("POST /api/webhooks", () => {
  it("returns 400 when url is missing", async () => {
    const res = await request(app)
      .post("/api/webhooks")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/url/i);
  });

  it("returns 400 for an invalid URL", async () => {
    const res = await request(app)
      .post("/api/webhooks")
      .send({ url: "not-a-url" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/url/i);
  });

  it("returns 201 when registering a valid webhook", async () => {
    const res = await request(app)
      .post("/api/webhooks")
      .send({ url: "https://example.com/hook", eventTypes: ["mint", "burn"] });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.url).toBe("https://example.com/hook");
    expect(res.body.active).toBe(true);
  });
});

describe("GET /api/webhooks", () => {
  it("returns a list of webhooks", async () => {
    const res = await request(app).get("/api/webhooks");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.webhooks)).toBe(true);
    expect(typeof res.body.count).toBe("number");
  });
});

describe("DELETE /api/webhooks/:id", () => {
  it("returns 400 for non-numeric id", async () => {
    const res = await request(app).delete("/api/webhooks/abc");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/id/i);
  });

  it("returns 404 for non-existent webhook", async () => {
    const res = await request(app).delete("/api/webhooks/99999");

    expect(res.status).toBe(404);
  });
});

describe("GET /api/webhooks/:id/deliveries", () => {
  it("returns 400 for non-numeric id", async () => {
    const res = await request(app).get("/api/webhooks/abc/deliveries");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/id/i);
  });
});

// ---------------------------------------------------------------------------
// Audit trail — /api/audit
// ---------------------------------------------------------------------------

describe("GET /api/audit", () => {
  it("returns paginated audit entries", async () => {
    const res = await request(app).get("/api/audit");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(typeof res.body.pagination.total).toBe("number");
    expect(typeof res.body.pagination.limit).toBe("number");
    expect(typeof res.body.pagination.offset).toBe("number");
    expect(typeof res.body.pagination.hasMore).toBe("boolean");
  });

  it("respects limit and offset query params", async () => {
    const res = await request(app).get("/api/audit?limit=5&offset=0");

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(5);
    expect(res.body.pagination.offset).toBe(0);
  });

  it("clamps limit to maximum of 200", async () => {
    const res = await request(app).get("/api/audit?limit=999");

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(200);
  });
});
