import { Router } from "express";
import { SSSClient } from "../../../sdk/src";
import { createStablecoinRouter } from "./stablecoin";

/**
 * Aggregates all route modules under the /api prefix.
 */
export function createRoutes(client: SSSClient): Router {
  const router = Router();

  router.use("/api/stablecoin", createStablecoinRouter(client));

  return router;
}
