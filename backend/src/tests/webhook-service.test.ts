import { createHmac } from "crypto";
import request from "supertest";

import { createWebhookService } from "../services/webhook-service";

describe("webhook service", () => {
  const apiKey = "test-api-key";

  it("registers a webhook and generates a secret when missing", async () => {
    const service = createWebhookService({
      apiKey,
      fetchImpl: jest.fn() as jest.MockedFunction<typeof fetch>,
      disableRetryProcessor: true,
    });

    const response = await request(service.app)
      .post("/webhook/register")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        url: "https://example.com/webhook",
        eventTypes: ["transfer.created"],
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      url: "https://example.com/webhook",
      eventTypes: ["transfer.created"],
    });
    expect(response.body.secret).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("computes and sends an HMAC signature when dispatching", async () => {
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const service = createWebhookService({
      apiKey,
      fetchImpl: fetchMock,
      disableRetryProcessor: true,
    });

    const registration = await request(service.app)
      .post("/webhook/register")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        url: "https://example.com/webhook",
        secret: "shared-secret",
      });

    const payload = { amount: 42, mint: "USDC" };
    const response = await request(service.app)
      .post("/webhook/dispatch")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        eventType: "transfer.created",
        payload,
      });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] || [];
    const headers = (init?.headers || {}) as Record<string, string>;
    const expectedSignature = createHmac("sha256", "shared-secret")
      .update(JSON.stringify(payload))
      .digest("hex");

    expect(headers["X-Webhook-Id"]).toBe(registration.body.id);
    expect(headers["X-Webhook-Signature"]).toBe(`sha256=${expectedSignature}`);
  });

  it("dispatches only to webhooks matching the event type filter", async () => {
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const service = createWebhookService({
      apiKey,
      fetchImpl: fetchMock,
      disableRetryProcessor: true,
    });

    await request(service.app)
      .post("/webhook/register")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        url: "https://example.com/transfer",
        eventTypes: ["transfer.created"],
      });

    await request(service.app)
      .post("/webhook/register")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        url: "https://example.com/mint",
        eventTypes: ["mint.completed"],
      });

    const response = await request(service.app)
      .post("/webhook/dispatch")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        eventType: "transfer.created",
        payload: { amount: 10 },
      });

    expect(response.status).toBe(200);
    expect(response.body.dispatched).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("queues failed deliveries and retries them successfully", async () => {
    let now = 1_700_000_000_000;
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    fetchMock
      .mockResolvedValueOnce(
        new Response("failure", {
          status: 500,
          statusText: "Internal Server Error",
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const service = createWebhookService({
      apiKey,
      fetchImpl: fetchMock,
      now: () => now,
      baseDelayMs: 1_000,
      disableRetryProcessor: true,
    });

    const registration = await request(service.app)
      .post("/webhook/register")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        url: "https://example.com/retry",
        secret: "retry-secret",
      });

    const response = await request(service.app)
      .post("/webhook/dispatch")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        eventType: "transfer.failed",
        payload: { reason: "temporary outage" },
      });

    expect(response.status).toBe(200);
    expect(response.body.retryQueueSize).toBe(1);
    expect(service.state.retryQueue).toHaveLength(1);

    now += 1_000;
    await service.processRetryQueue();

    expect(service.state.retryQueue).toHaveLength(0);
    expect(service.state.webhooks.get(registration.body.id)?.stats.delivered).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deletes a webhook registration", async () => {
    const service = createWebhookService({
      apiKey,
      fetchImpl: jest.fn() as jest.MockedFunction<typeof fetch>,
      disableRetryProcessor: true,
    });

    const registration = await request(service.app)
      .post("/webhook/register")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        url: "https://example.com/delete-me",
      });

    const response = await request(service.app)
      .delete(`/webhook/${registration.body.id}`)
      .set("Authorization", `Bearer ${apiKey}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ deleted: registration.body.id });
    expect(service.state.webhooks.has(registration.body.id)).toBe(false);
  });
});
