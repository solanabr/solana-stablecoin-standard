import { Connection, PublicKey, LogsFilter, Context, Logs } from "@solana/web3.js";
import { Pool } from "pg";
import express from "express";
import * as https from "https";

const PORT = parseInt(process.env.PORT || "3002");
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const WS_URL = process.env.WS_URL || "wss://api.devnet.solana.com";
const SSS_MINT = process.env.SSS_MINT!;
const SSS_PROGRAM_ID = new PublicKey(
  process.env.SSS_TOKEN_PROGRAM_ID || "SSSTokenxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
);
const WEBHOOK_SERVICE_URL = process.env.WEBHOOK_SERVICE_URL || "http://webhook:3004";

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const connection = new Connection(RPC_URL, {
  wsEndpoint: WS_URL,
  commitment: "confirmed",
});

// ─── Health check server ──────────────────────────────────────────────────────

const app = express();
app.get("/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    const slot = await connection.getSlot();
    res.json({ status: "ok", slot, indexing: SSS_MINT });
  } catch (e: any) {
    res.status(503).json({ status: "error", error: e.message });
  }
});
app.listen(PORT, () => log("info", `Event listener started on port ${PORT}`));

// ─── Known event types (from Anchor IDL discriminators) ───────────────────────

const EVENT_DISCRIMINATORS: Record<string, string> = {
  "StablecoinInitialized": "stablecoin_initialized",
  "TokensMinted": "tokens_minted",
  "TokensBurned": "tokens_burned",
  "AccountFrozen": "account_frozen",
  "AccountThawed": "account_thawed",
  "ProtocolPaused": "protocol_paused",
  "ProtocolUnpaused": "protocol_unpaused",
  "AddressBlacklisted": "address_blacklisted",
  "AddressUnblacklisted": "address_unblacklisted",
  "TokensSeized": "tokens_seized",
  "MinterUpdated": "minter_updated",
  "AuthorityTransferred": "authority_transferred",
};

// ─── Main indexer loop ────────────────────────────────────────────────────────

async function runIndexer(): Promise<void> {
  // Get last processed state
  const stateResult = await db.query(
    "SELECT last_slot, last_signature FROM indexer_state WHERE mint=$1",
    [SSS_MINT]
  );

  let lastSlot = stateResult.rows[0]?.last_slot ?? 0;
  let lastSig = stateResult.rows[0]?.last_signature ?? undefined;

  log("info", "Starting indexer", { mint: SSS_MINT, lastSlot });

  // Subscribe to real-time logs
  const subscriptionId = connection.onLogs(
    SSS_PROGRAM_ID,
    async (logs: Logs, ctx: Context) => {
      await processLogs(logs, ctx.slot);
    },
    "confirmed"
  );

  log("info", "Subscribed to on-chain logs", { subscriptionId });

  // Also catch up on missed events (poll recent signatures)
  await catchUpMissedEvents(lastSig);

  // Periodic catch-up every 60 seconds
  setInterval(() => catchUpMissedEvents().catch(console.error), 60_000);
}

async function catchUpMissedEvents(beforeSig?: string): Promise<void> {
  try {
    const signatures = await connection.getSignaturesForAddress(
      SSS_PROGRAM_ID,
      {
        limit: 100,
        before: beforeSig,
      },
      "confirmed"
    );

    if (!signatures.length) return;

    for (const sigInfo of signatures.reverse()) {
      if (sigInfo.err) continue;

      const existing = await db.query(
        "SELECT id FROM onchain_events WHERE tx_sig=$1",
        [sigInfo.signature]
      );
      if (existing.rows.length) continue;

      const tx = await connection.getParsedTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) continue;

      // Parse log messages for Anchor events
      const logs = tx.meta?.logMessages ?? [];
      await parseAndStoreEvents(sigInfo.signature, sigInfo.slot, sigInfo.blockTime, logs);
    }

    // Update indexer state
    if (signatures.length > 0) {
      const latestSig = signatures[signatures.length - 1].signature;
      const latestSlot = signatures[signatures.length - 1].slot;
      await db.query(
        `INSERT INTO indexer_state (mint, last_slot, last_signature, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (mint) DO UPDATE
           SET last_slot=$2, last_signature=$3, updated_at=NOW()`,
        [SSS_MINT, latestSlot, latestSig]
      );
    }
  } catch (e: any) {
    log("error", "Catch-up failed", { error: e.message });
  }
}

async function processLogs(logs: Logs, slot: number): Promise<void> {
  if (logs.err) return;
  await parseAndStoreEvents(logs.signature, slot, null, logs.logs);
}

async function parseAndStoreEvents(
  txSig: string,
  slot: number,
  blockTime: number | null | undefined,
  logMessages: string[]
): Promise<void> {
  for (const log of logMessages) {
    // Anchor emits events as "Program data: <base64>"
    if (!log.startsWith("Program data:")) continue;

    const b64 = log.replace("Program data: ", "").trim();
    const decoded = Buffer.from(b64, "base64");

    // First 8 bytes are the Anchor event discriminator
    // Remaining bytes are the borsh-serialized event data
    // For now we store raw and emit to webhook — full deserialization
    // requires the IDL which is available post-build

    const eventType = guessEventType(logMessages);
    if (!eventType) continue;

    try {
      await db.query(
        `INSERT INTO onchain_events (mint, event_type, tx_sig, slot, block_time, data)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tx_sig) DO NOTHING`,
        [
          SSS_MINT,
          eventType,
          txSig,
          slot,
          blockTime ? new Date(blockTime * 1000).toISOString() : null,
          JSON.stringify({ raw: b64, logMessages }),
        ]
      );

      // Notify webhook service
      notifyWebhook(eventType, {
        mint: SSS_MINT,
        txSig,
        slot,
        blockTime,
        eventType,
      });

      log("info", "Event indexed", { eventType, txSig, slot });
    } catch (e: any) {
      if (!e.message.includes("unique")) {
        log("error", "Failed to index event", { error: e.message, txSig });
      }
    }
  }
}

function guessEventType(logs: string[]): string | null {
  for (const log of logs) {
    for (const [name, slug] of Object.entries(EVENT_DISCRIMINATORS)) {
      if (log.includes(name)) return slug;
    }
  }
  return "unknown_event";
}

function notifyWebhook(eventType: string, payload: Record<string, any>): void {
  const body = JSON.stringify({ eventType, payload });
  const url = new URL(`${WEBHOOK_SERVICE_URL}/dispatch`);

  const req = https.request(
    {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    (res) => {
      if (res.statusCode !== 200) {
        log("warn", "Webhook dispatch failed", { statusCode: res.statusCode });
      }
    }
  );

  req.on("error", (e) => log("warn", "Webhook error", { error: e.message }));
  req.write(body);
  req.end();
}

function log(level: string, msg: string, data: Record<string, any> = {}): void {
  console.log(JSON.stringify({
    level,
    msg,
    service: "event-listener",
    timestamp: new Date().toISOString(),
    ...data,
  }));
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

runIndexer().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});