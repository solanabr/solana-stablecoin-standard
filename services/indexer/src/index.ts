import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import express, { Request, Response } from "express";

const app = express();
const PORT = process.env.PORT || 3002;
const SSS1_PROGRAM_ID = new PublicKey("J4Z8HDQs2VbmSxs1VURkGY5M51SDmiY8K5a1RVuTN6np");

interface IndexedEvent {
  signature: string;
  type: string;
  data: any;
  slot: number;
  timestamp: number;
}

const events: IndexedEvent[] = [];

async function startIndexer() {
  const connection = new Connection(process.env.RPC_URL || clusterApiUrl("devnet"), "confirmed");
  console.log("Indexer started, watching for SSS program events...");

  connection.onLogs(SSS1_PROGRAM_ID, (logs) => {
    const event: IndexedEvent = {
      signature: logs.signature,
      type: "program_log",
      data: logs.logs,
      slot: 0,
      timestamp: Date.now(),
    };
    events.push(event);
    if (events.length > 10000) events.shift();
    console.log(`Indexed event: ${logs.signature}`);
  });
}

app.get("/events", (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(events.slice(-limit));
});

app.get("/events/:signature", (req: Request, res: Response) => {
  const event = events.find((e) => e.signature === req.params.signature);
  event ? res.json(event) : res.status(404).json({ error: "Not found" });
});

app.get("/health", (_req: Request, res: Response) => res.json({ status: "ok", eventsIndexed: events.length }));

app.listen(PORT, () => {
  console.log(`Indexer API on port ${PORT}`);
  startIndexer().catch(console.error);
});
