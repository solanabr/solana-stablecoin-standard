import { Router, Request, Response } from "express";
import { z } from "zod";
import { findMintRequestById, findBurnRequestById } from "./repository";
import { MintBurnService } from "./service";

const mintBodySchema = z.object({
  recipient: z.string().min(32),
  amount: z.string().regex(/^\d+$/, "amount must be a numeric string"),
  idempotencyKey: z.string().optional(),
});

const burnBodySchema = z.object({
  from: z.string().min(32),
  amount: z.string().regex(/^\d+$/, "amount must be a numeric string"),
  idempotencyKey: z.string().optional(),
});

export function createMintBurnRouter(service: MintBurnService): Router {
  const router = Router();

  router.post("/mint", async (req: Request, res: Response) => {
    const parsed = mintBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    try {
      const request = await service.mint({
        recipient: parsed.data.recipient,
        amount: parsed.data.amount,
        idempotencyKey: parsed.data.idempotencyKey,
      });
      res.json(request);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mint failed";
      res.status(500).json({ error: message });
    }
  });

  router.post("/burn", async (req: Request, res: Response) => {
    const parsed = burnBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
      return;
    }

    try {
      const request = await service.burn({
        from: parsed.data.from,
        amount: parsed.data.amount,
        idempotencyKey: parsed.data.idempotencyKey,
      });
      res.json(request);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Burn failed";
      res.status(500).json({ error: message });
    }
  });

  router.get("/mint/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const request = await findMintRequestById(id);
    if (!request) {
      res.status(404).json({ error: "Mint request not found" });
      return;
    }
    res.json(request);
  });

  router.get("/burn/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const request = await findBurnRequestById(id);
    if (!request) {
      res.status(404).json({ error: "Burn request not found" });
      return;
    }
    res.json(request);
  });

  return router;
}
