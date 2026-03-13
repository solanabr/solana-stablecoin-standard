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
      random: () => 0,
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
    expect(service.state.retryQueue[0]?.nextRetryAt).toBe(1_700_000_001_000);

    now += 1_000;
    await service.processRetryQueue();

    expect(service.state.retryQueue).toHaveLength(0);
    expect(service.state.deadLetterQueue).toHaveLength(0);
    expect(service.state.webhooks.get(registration.body.id)?.stats.delivered).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("applies exponential backoff and moves exhausted deliveries to the dead letter queue", async () => {
    let now = 1_700_000_000_000;
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    fetchMock.mockImplementation(
      async () =>
        new Response("failure", {
          status: 500,
          statusText: "Internal Server Error",
        })
    );

    const service = createWebhookService({
      apiKey,
      fetchImpl: fetchMock,
      now: () => now,
      baseDelayMs: 1_000,
      maxRetries: 5,
      random: () => 0,
      disableRetryProcessor: true,
    });

    const registration = await request(service.app)
      .post("/webhook/register")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        url: "https://example.com/dlq",
        secret: "dlq-secret",
      });

    await request(service.app)
      .post("/webhook/dispatch")
      .set("Authorization", `Bearer ${apiKey}`)
      .send({
        eventType: "transfer.failed",
        payload: { reason: "persistent outage" },
      });

    expect(service.state.retryQueue).toHaveLength(1);
    expect(service.state.retryQueue[0]?.nextRetryAt).toBe(1_700_000_001_000);

    now = 1_700_000_001_000;
    await service.processRetryQueue();
    expect(service.state.retryQueue[0]?.attempts).toBe(2);
    expect(service.state.retryQueue[0]?.nextRetryAt).toBe(1_700_000_003_000);

    now = 1_700_000_003_000;
    await service.processRetryQueue();
    expect(service.state.retryQueue[0]?.attempts).toBe(3);
    expect(service.state.retryQueue[0]?.nextRetryAt).toBe(1_700_000_007_000);

    now = 1_700_000_007_000;
    await service.processRetryQueue();
    expect(service.state.retryQueue[0]?.attempts).toBe(4);
    expect(service.state.retryQueue[0]?.nextRetryAt).toBe(1_700_000_015_000);

    now = 1_700_000_015_000;
    await service.processRetryQueue();
    expect(service.state.retryQueue[0]?.attempts).toBe(5);
    expect(service.state.retryQueue[0]?.nextRetryAt).toBe(1_700_000_031_000);

    now = 1_700_000_031_000;
    await service.processRetryQueue();

    expect(service.state.retryQueue).toHaveLength(0);
    expect(service.state.deadLetterQueue).toHaveLength(1);
    expect(service.state.deadLetterQueue[0]).toMatchObject({
      webhookId: registration.body.id,
      webhookUrl: "https://example.com/dlq",
      eventType: "transfer.failed",
      attempts: 6,
      lastError: "HTTP 500: Internal Server Error",
      failedAt: "2023-11-14T22:13:51.000Z",
    });
    expect(service.state.webhooks.get(registration.body.id)?.stats.failed).toBe(6);
    expect(fetchMock).toHaveBeenCalledTimes(6);

    const status = await request(service.app).get("/webhook/status");
    expect(status.status).toBe(200);
    expect(status.body.retryQueueSize).toBe(0);
    expect(status.body.deadLetterQueueSize).toBe(1);
    expect(status.body.deadLetterQueue[0]).toMatchObject({
      webhookId: registration.body.id,
      webhookUrl: "https://example.com/dlq",
      attempts: 6,
      failedAt: "2023-11-14T22:13:51.000Z",
    });
  });

  it("reads retry settings from WEBHOOK_* env vars", async () => {
    const previousMaxRetries = process.env.WEBHOOK_MAX_RETRIES;
    const previousBaseDelayMs = process.env.WEBHOOK_BASE_DELAY_MS;
    process.env.WEBHOOK_MAX_RETRIES = "1";
    process.env.WEBHOOK_BASE_DELAY_MS = "750";

    try {
      let now = 1_700_000_000_000;
      const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
      fetchMock.mockImplementation(
        async () =>
          new Response("failure", {
            status: 503,
            statusText: "Service Unavailable",
          })
      );

      const service = createWebhookService({
        apiKey,
        fetchImpl: fetchMock,
        now: () => now,
        random: () => 0,
        disableRetryProcessor: true,
      });

      await request(service.app)
        .post("/webhook/register")
        .set("Authorization", `Bearer ${apiKey}`)
        .send({
          url: "https://example.com/env-config",
          secret: "env-secret",
        });

      const dispatchResponse = await request(service.app)
        .post("/webhook/dispatch")
        .set("Authorization", `Bearer ${apiKey}`)
        .send({
          eventType: "transfer.failed",
          payload: { reason: "env config" },
        });

      expect(dispatchResponse.status).toBe(200);
      expect(service.state.retryQueue[0]?.nextRetryAt).toBe(1_700_000_000_750);

      now = 1_700_000_000_750;
      await service.processRetryQueue();

      expect(service.state.retryQueue).toHaveLength(0);
      expect(service.state.deadLetterQueue).toHaveLength(1);
      expect(service.state.deadLetterQueue[0]?.attempts).toBe(2);
      expect(service.state.deadLetterQueue[0]?.lastError).toBe(
        "HTTP 503: Service Unavailable"
      );
    } finally {
      if (previousMaxRetries === undefined) {
        delete process.env.WEBHOOK_MAX_RETRIES;
      } else {
        process.env.WEBHOOK_MAX_RETRIES = previousMaxRetries;
      }

      if (previousBaseDelayMs === undefined) {
        delete process.env.WEBHOOK_BASE_DELAY_MS;
      } else {
        process.env.WEBHOOK_BASE_DELAY_MS = previousBaseDelayMs;
      }
    }
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
