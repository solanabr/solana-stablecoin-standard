import { getServiceConfig } from "../config.js";
import { buildService } from "../shared.js";
import { nextWebhookBackoffMs, store } from "../store.js";

export async function startWebhookService(port = 3004): Promise<void> {
  const config = getServiceConfig("webhook-service", port);
  const app = buildService(config);
  await store.ensureLoaded();

  app.post("/webhooks/subscribe", async (request) => {
    return store.sync((state) => {
      const body = (request.body as Record<string, unknown>) ?? {};
      const row = {
        id: `wh-${Date.now()}`,
        url: typeof body.url === "string" ? body.url : undefined,
        secret: typeof body.secret === "string" ? body.secret : undefined,
        events: Array.isArray(body.events) ? (body.events as string[]) : [],
        retryCount: 0,
        nextAttemptAt: null
      };
      state.webhooks.push(row);
      state.recordAudit("webhook_registered", { id: row.id, url: row.url });
      return row;
    });
  });

  app.get("/webhooks", async () => store.read((state) => state.webhooks));

  app.post<{ Params: { id: string } }>("/webhooks/:id/fail", async (request) => {
    return store.sync((state) => {
      const webhook = state.webhooks.find((candidate) => candidate.id === request.params.id);
      if (!webhook) {
        return { status: "missing" };
      }

      webhook.retryCount += 1;
      webhook.nextAttemptAt = new Date(
        Date.now() + nextWebhookBackoffMs(webhook.retryCount - 1)
      ).toISOString();
      state.recordAudit("webhook_retry_scheduled", {
        id: webhook.id,
        retryCount: webhook.retryCount,
        nextAttemptAt: webhook.nextAttemptAt
      });

      return webhook;
    });
  });

  app.delete<{ Params: { id: string } }>("/webhooks/:id", async (request) => {
    return store.sync((state) => {
      const index = state.webhooks.findIndex((candidate) => candidate.id === request.params.id);
      if (index === -1) {
        return { status: "missing" };
      }
      const [removed] = state.webhooks.splice(index, 1);
      state.recordAudit("webhook_removed", { id: removed.id });
      return { removed: removed.id };
    });
  });

  await app.listen({ port: config.port, host: config.host });
}
