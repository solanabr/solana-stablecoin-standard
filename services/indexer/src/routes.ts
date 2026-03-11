import { Router, Request, Response } from "express";
import { query } from "@sss/shared";

export function createIndexerRouter(): Router {
  const router = Router();

  router.get("/events", async (req: Request, res: Response) => {
    const { mint, type, after, limit = "50" } = req.query as Record<string, string>;
    const params: unknown[] = [];
    const conditions: string[] = [];
    let idx = 1;

    if (mint) {
      conditions.push(`mint = $${idx++}`);
      params.push(mint);
    }
    if (type) {
      conditions.push(`event_type = $${idx++}`);
      params.push(type);
    }
    if (after) {
      conditions.push(`id > $${idx++}`);
      params.push(parseInt(after, 10));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const parsedLimit = Math.min(parseInt(limit, 10) || 50, 500);
    params.push(parsedLimit);

    const result = await query<{
      id: string;
      signature: string;
      slot: string;
      block_time: string | null;
      event_type: string;
      mint: string;
      payload: unknown;
      created_at: string;
    }>(
      `SELECT id, signature, slot, block_time, event_type, mint, payload, created_at
       FROM sss_events
       ${where}
       ORDER BY slot DESC, id DESC
       LIMIT $${idx}`,
      params,
    );

    res.json({ events: result.rows, count: result.rowCount });
  });

  router.get("/state/:mint", async (req: Request, res: Response) => {
    const { mint } = req.params;
    const result = await query<{
      mint: string;
      total_supply: string;
      is_paused: boolean;
      last_slot: string;
      updated_at: string;
    }>(
      `SELECT mint, total_supply, is_paused, last_slot, updated_at FROM mint_state WHERE mint = $1`,
      [mint],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Mint state not found" });
      return;
    }

    res.json(result.rows[0]);
  });

  return router;
}
