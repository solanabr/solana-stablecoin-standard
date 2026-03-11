import express from "express";
import pino from "pino";
import * as anchor from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";
import { enqueueEvent } from "./queue";
import { getEvents } from "./db";

const logger = pino({ name: "indexer" });
const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = parseInt(process.env.PORT || "3000");
const PROGRAM_ID = process.env.PROGRAM_ID || "SSSW3EixhrbB6yYpTdKmH2nCReqsA1VJqJkhwvcdzLA";

// Load IDL for event parsing
let eventParser: anchor.EventParser | null = null;

function loadIDL(): void {
  const idlPath = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "target",
    "idl",
    "stablecoin.json"
  );

  if (fs.existsSync(idlPath)) {
    const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
    const coder = new anchor.BorshCoder(idl);
    eventParser = new anchor.EventParser(
      new anchor.web3.PublicKey(PROGRAM_ID),
      coder
    );
    logger.info("IDL loaded, event parser ready");
  } else {
    logger.warn("IDL not found, event parsing disabled");
  }
}

loadIDL();

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Helius webhook endpoint
app.post("/webhook", async (req, res) => {
  try {
    const transactions = Array.isArray(req.body) ? req.body : [req.body];

    for (const tx of transactions) {
      if (!tx.transaction?.signatures?.[0]) continue;

      const txSignature = tx.transaction.signatures[0];
      const slot = tx.slot || 0;

      // Parse Anchor events from transaction logs
      if (eventParser && tx.transaction?.message?.instructions) {
        const logs: string[] = tx.meta?.logMessages || [];

        for (const event of eventParser.parseLogs(logs)) {
          const eventType = event.name;
          const eventData = event.data as Record<string, unknown>;
          const mint = (eventData.mint as any)?.toString?.() || PROGRAM_ID;

          await enqueueEvent({
            mint,
            eventType,
            txSignature,
            slot,
            data: JSON.parse(JSON.stringify(eventData, (_key, value) =>
              typeof value === "bigint" ? value.toString() : value
            )),
          });
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    logger.error({ err: err.message }, "Webhook processing error");
    res.status(500).json({ error: "Processing failed" });
  }
});

// Query events
app.get("/events/:mint", async (req, res) => {
  try {
    const events = await getEvents(
      req.params.mint,
      req.query.type as string | undefined,
      parseInt(req.query.limit as string) || 50
    );
    res.json(events);
  } catch (err: any) {
    logger.error({ err: err.message }, "Query error");
    res.status(500).json({ error: "Query failed" });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info({ port: PORT }, "Indexer started");
});
