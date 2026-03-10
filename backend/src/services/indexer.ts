import { Connection, PublicKey, Logs } from "@solana/web3.js";
import { BorshCoder, EventParser, Idl } from "@coral-xyz/anchor";
import { config } from "../config";
import { createLogger } from "../logger";
import { getDb, insertEvent } from "./database";
import http from "http";
import fs from "fs";
import path from "path";

// Load IDL JSON at runtime so we don't need to include them in rootDir
function loadIdl(filename: string): Idl {
  // In dist: dist/services/indexer.js -> ../../idl/<file>
  // In src:  src/services/indexer.ts  -> ../../idl/<file>
  const idlPath = path.resolve(__dirname, "..", "..", "idl", filename);
  return JSON.parse(fs.readFileSync(idlPath, "utf-8"));
}

const sssCoreIdl = loadIdl("sss_core.json");
const sssHookIdl = loadIdl("sss_hook.json");

const log = createLogger("indexer");

// ── Known event types ───────────────────────────────────────────────────────

const CORE_EVENTS = [
  "StablecoinInitialized",
  "MinterConfigured",
  "MinterRemoved",
  "TokensMinted",
  "TokensBurned",
  "AccountFrozen",
  "AccountThawed",
  "Paused",
  "Unpaused",
  "RoleUpdated",
  "AuthorityTransferInitiated",
  "AuthorityTransferAccepted",
  "TokensSeized",
] as const;

const HOOK_EVENTS = [
  "HookInitialized",
  "AddedToBlacklist",
  "RemovedFromBlacklist",
] as const;

// ── Event parsers ───────────────────────────────────────────────────────────

function createParsers() {
  const coreCoder = new BorshCoder(sssCoreIdl as any);
  const hookCoder = new BorshCoder(sssHookIdl as any);

  return {
    core: new EventParser(
      new PublicKey(config.programs.sssCore),
      coreCoder
    ),
    hook: new EventParser(
      new PublicKey(config.programs.sssHook),
      hookCoder
    ),
  };
}

// ── Log handler ─────────────────────────────────────────────────────────────

function handleLogs(
  logs: Logs,
  parsers: ReturnType<typeof createParsers>,
  programId: string,
  programLabel: string
): void {
  if (logs.err) {
    log.debug(`Skipping failed transaction: ${logs.signature}`);
    return;
  }

  const parser = programLabel === "core" ? parsers.core : parsers.hook;
  const events = parser.parseLogs(logs.logs);

  for (const event of events) {
    const eventType = event.name;
    const data = event.data as Record<string, unknown>;

    log.info(`Parsed event: ${eventType}`, {
      signature: logs.signature,
      slot: logs.context?.slot,
    });

    // Convert PublicKey instances to strings for JSON storage
    const serializedData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value instanceof PublicKey) {
        serializedData[key] = value.toBase58();
      } else if (typeof value === "bigint") {
        serializedData[key] = value.toString();
      } else {
        serializedData[key] = value;
      }
    }

    try {
      insertEvent(
        eventType,
        programId,
        logs.signature,
        logs.context?.slot ?? 0,
        null,
        serializedData
      );
      log.debug(`Stored event ${eventType} from tx ${logs.signature}`);
    } catch (err) {
      log.error(`Failed to store event ${eventType}`, err);
    }
  }
}

// ── Subscription management ─────────────────────────────────────────────────

let coreSubscriptionId: number | null = null;
let hookSubscriptionId: number | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function subscribe(connection: Connection): void {
  const parsers = createParsers();
  const coreProgramId = new PublicKey(config.programs.sssCore);
  const hookProgramId = new PublicKey(config.programs.sssHook);

  log.info(`Subscribing to sss-core program: ${coreProgramId.toBase58()}`);
  coreSubscriptionId = connection.onLogs(
    coreProgramId,
    (logs) => handleLogs(logs, parsers, config.programs.sssCore, "core"),
    "confirmed"
  );

  log.info(`Subscribing to sss-hook program: ${hookProgramId.toBase58()}`);
  hookSubscriptionId = connection.onLogs(
    hookProgramId,
    (logs) => handleLogs(logs, parsers, config.programs.sssHook, "hook"),
    "confirmed"
  );

  log.info("WebSocket subscriptions active");
}

function unsubscribe(connection: Connection): void {
  if (coreSubscriptionId !== null) {
    connection.removeOnLogsListener(coreSubscriptionId);
    coreSubscriptionId = null;
  }
  if (hookSubscriptionId !== null) {
    connection.removeOnLogsListener(hookSubscriptionId);
    hookSubscriptionId = null;
  }
  log.info("WebSocket subscriptions removed");
}

function scheduleReconnect(connection: Connection): void {
  if (reconnectTimer) return;

  const delayMs = 5000;
  log.warn(`Scheduling reconnect in ${delayMs}ms`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    log.info("Attempting reconnect...");
    unsubscribe(connection);
    subscribe(connection);
  }, delayMs);
}

// ── Health check server ─────────────────────────────────────────────────────

function startHealthServer(): void {
  const port = 3001;
  const server = http.createServer((_req, res) => {
    const isHealthy =
      coreSubscriptionId !== null && hookSubscriptionId !== null;
    res.writeHead(isHealthy ? 200 : 503, {
      "Content-Type": "application/json",
    });
    res.end(
      JSON.stringify({
        status: isHealthy ? "ok" : "unhealthy",
        subscriptions: {
          core: coreSubscriptionId !== null,
          hook: hookSubscriptionId !== null,
        },
      })
    );
  });

  server.listen(port, () => {
    log.info(`Indexer health server listening on port ${port}`);
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

export function startIndexer(): void {
  // Ensure database is initialized
  getDb();

  const connection = new Connection(config.solana.rpcUrl, {
    wsEndpoint: config.solana.wsUrl,
    commitment: "confirmed",
  });

  // Monitor WebSocket health
  connection.onSlotChange((slotInfo) => {
    log.debug(`Slot: ${slotInfo.slot}`);
  });

  subscribe(connection);
  startHealthServer();

  // Graceful shutdown
  const shutdown = () => {
    log.info("Shutting down indexer...");
    unsubscribe(connection);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Run directly
if (require.main === module) {
  log.info("Starting SSS Event Indexer");
  startIndexer();
}
