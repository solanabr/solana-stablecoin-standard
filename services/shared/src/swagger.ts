import { Router } from "express";
import swaggerUi from "swagger-ui-express";

export interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, unknown>;
  components?: { schemas?: Record<string, unknown> };
  servers?: Array<{ url: string; description?: string }>;
}

/**
 * Returns an Express router that serves Swagger UI at /api-docs and the raw spec at /api-docs.json.
 */
export function createSwaggerRouter(spec: OpenApiSpec, basePath = ""): Router {
  const router = Router();
  const resolvedSpec = {
    ...spec,
    servers: spec.servers ?? (basePath ? [{ url: basePath, description: "This service" }] : []),
  };
  router.use("/api-docs", swaggerUi.serve, swaggerUi.setup(resolvedSpec, { explorer: true }));
  router.get("/api-docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.json(resolvedSpec);
  });
  return router;
}
