import request from "supertest";

import { createApp } from "../server";

describe("backend API server", () => {
  const originalApiKey = process.env.API_KEY;
  const originalRateLimitMax = process.env.RATE_LIMIT_MAX;
  const originalRateLimitWindowMs = process.env.RATE_LIMIT_WINDOW_MS;

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.API_KEY;
    } else {
      process.env.API_KEY = originalApiKey;
    }

    if (originalRateLimitMax === undefined) {
      delete process.env.RATE_LIMIT_MAX;
    } else {
      process.env.RATE_LIMIT_MAX = originalRateLimitMax;
    }

    if (originalRateLimitWindowMs === undefined) {
      delete process.env.RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.RATE_LIMIT_WINDOW_MS = originalRateLimitWindowMs;
    }
  });

  function createTestApp() {
    return createApp({} as any, {
      authority: "TestAuthority11111111111111111111111111111111",
      rpcUrl: "http://127.0.0.1:8899",
    });
  }

  it("returns 200 for the health endpoint", async () => {
    const response = await request(createTestApp()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      authority: "TestAuthority11111111111111111111111111111111",
      rpcUrl: "http://127.0.0.1:8899",
    });
  });

  it("rejects POST requests without an API key", async () => {
    process.env.API_KEY = "test-api-key";

    const response = await request(createTestApp())
      .post("/api/stablecoin/initialize")
      .send({ preset: "invalid" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Unauthorized: invalid or missing API key",
    });
  });

  it("accepts POST requests with a valid API key", async () => {
    process.env.API_KEY = "test-api-key";

    const response = await request(createTestApp())
      .post("/api/stablecoin/initialize")
      .set("Authorization", "Bearer test-api-key")
      .send({ preset: "invalid" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      name: "InvalidPreset",
    });
  });

  it("rate limits POST requests before auth middleware", async () => {
    process.env.API_KEY = "test-api-key";
    process.env.RATE_LIMIT_MAX = "1";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";

    const app = createTestApp();
    const firstResponse = await request(app)
      .post("/api/stablecoin/initialize")
      .send({ preset: "invalid" });
    const secondResponse = await request(app)
      .post("/api/stablecoin/initialize")
      .send({ preset: "invalid" });

    expect(firstResponse.status).toBe(401);
    expect(secondResponse.status).toBe(429);
    expect(secondResponse.body.error.code).toBe("RATE_LIMITED");
    expect(secondResponse.body.error.message).toBe("Too many requests");
    expect(secondResponse.body.error.retryAfter).toBeGreaterThan(0);
    expect(secondResponse.body.error.retryAfter).toBeLessThanOrEqual(60);
  });
});
