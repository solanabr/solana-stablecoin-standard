import Fastify, { type FastifyInstance } from "fastify";

import type { ServiceConfig } from "./config.js";

export function buildService(config: ServiceConfig): FastifyInstance {
  if (!config.apiKey) {
    throw new Error(`MissingServiceApiKey:${config.service}`);
  }

  const app = Fastify({
    logger: true,
    bodyLimit: config.bodyLimitBytes
  });
  const requestCounts = new Map<string, { count: number; windowStart: number }>();

  app.addHook("onRequest", async (request, reply) => {
    if (request.raw.url === "/health") {
      return;
    }

    const headerValue = request.headers["x-api-key"];
    const bearerValue = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice("Bearer ".length)
      : undefined;
    const provided = typeof headerValue === "string" ? headerValue : bearerValue;
    if (provided === config.apiKey) {
      const key = `${request.ip}:${provided}`;
      const now = Date.now();
      const current = requestCounts.get(key);
      if (!current || now - current.windowStart >= config.rateLimitWindowMs) {
        requestCounts.set(key, { count: 1, windowStart: now });
        return;
      }
      if (current.count >= config.rateLimitMaxRequests) {
        reply.code(429);
        reply.header(
          "retry-after",
          Math.ceil((config.rateLimitWindowMs - (now - current.windowStart)) / 1000)
        );
        throw new Error("RateLimitExceeded");
      }
      current.count += 1;
      return;
    }

    reply.code(401);
    throw new Error("Unauthorized");
  });

  app.get("/health", async () => ({
    status: "ok",
    service: config.service,
    uptime: process.uptime(),
    rpcUrl: config.rpcUrl,
    port: config.port,
    host: config.host
  }));

  return app;
}
