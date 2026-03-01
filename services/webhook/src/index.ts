import express from "express";
import axios from "axios";
import { createLogger, format, transports } from "winston";
import dotenv from "dotenv";

dotenv.config();

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

const app = express();
app.use(express.json());
const PORT = parseInt(process.env.PORT || "3003");

// In-memory webhook registrations (use a database in production)
const webhooks: Map<string, { url: string; events: string[]; secret?: string }> = new Map();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "sss-webhook" });
});

// Register a webhook
app.post("/webhooks", (req, res) => {
  const { id, url, events, secret } = req.body;
  webhooks.set(id, { url, events, secret });
  logger.info("Webhook registered", { id, url, events });
  res.json({ status: "registered", id });
});

// Remove a webhook
app.delete("/webhooks/:id", (req, res) => {
  webhooks.delete(req.params.id);
  logger.info("Webhook removed", { id: req.params.id });
  res.json({ status: "removed" });
});

// List webhooks
app.get("/webhooks", (_req, res) => {
  const list = Array.from(webhooks.entries()).map(([id, hook]) => ({
    id,
    url: hook.url,
    events: hook.events,
  }));
  res.json(list);
});

// Receive events from the indexer and dispatch to webhooks
app.post("/events", async (req, res) => {
  const { eventType, data } = req.body;
  logger.info("Event received", { eventType });

  const promises: Promise<void>[] = [];

  for (const [id, hook] of webhooks) {
    if (hook.events.includes(eventType) || hook.events.includes("*")) {
      promises.push(
        axios
          .post(hook.url, { eventType, data, timestamp: new Date().toISOString() }, {
            headers: hook.secret ? { "X-Webhook-Secret": hook.secret } : {},
            timeout: 5000,
          })
          .then(() => logger.info("Webhook delivered", { id, eventType }))
          .catch((err) => logger.error("Webhook delivery failed", { id, error: err.message }))
      );
    }
  }

  await Promise.allSettled(promises);
  res.json({ status: "dispatched", webhooksNotified: promises.length });
});

app.listen(PORT, () => {
  logger.info(`SSS Webhook service running on port ${PORT}`);
});
