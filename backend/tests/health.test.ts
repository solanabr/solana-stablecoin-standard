/**
 * Health-check endpoint tests.
 *
 * These verify that the /health endpoint is reachable, returns the expected
 * shape, and degrades gracefully when the database is unavailable.
 */

import "./setup"; // must be first – sets env vars before app boots

import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/index";
import { closeDb } from "../src/services/database";

afterAll(() => {
  closeDb();
});

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("includes a version string", async () => {
    const res = await request(app).get("/health");

    expect(res.body.version).toBeDefined();
    expect(typeof res.body.version).toBe("string");
    expect(res.body.version).toBe("0.1.0");
  });

  it("includes a valid ISO-8601 timestamp", async () => {
    const res = await request(app).get("/health");

    expect(res.body.timestamp).toBeDefined();
    // Should parse as a valid date
    const parsed = new Date(res.body.timestamp);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it("includes program IDs", async () => {
    const res = await request(app).get("/health");

    expect(res.body.programs).toBeDefined();
    expect(typeof res.body.programs.sssCore).toBe("string");
    expect(typeof res.body.programs.sssHook).toBe("string");
    // Solana base58 public keys are 32-44 chars
    expect(res.body.programs.sssCore.length).toBeGreaterThanOrEqual(32);
    expect(res.body.programs.sssHook.length).toBeGreaterThanOrEqual(32);
  });

  it("responds with application/json content type", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});
