import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import pino from "pino";

import { SssClient } from "@solana-stablecoin-standard/sdk";
import { defaultConfig } from "../config/default";
import { EventIndexer } from "../services/indexer";
import { WebhookService } from "../services/webhook";
import { ComplianceService } from "../services/compliance";
import { MintBurnLifecycle } from "../services/mint-burn-lifecycle";
import { createApiServer } from "../services/api";

const log = pino({ name: "sss-backend" });

async function main(): Promise<void> {
  const config = defaultConfig;

  log.info({ port: config.port, rpc: config.solana.rpcUrl }, "Starting SSS backend");

  // Set up Solana connection
  const connection = new Connection(config.solana.rpcUrl, {
    commitment: config.solana.commitment,
    wsEndpoint: config.solana.wsUrl,
  });

  // Load the operator keypair
  const keypairPath = process.env.OPERATOR_KEYPAIR ?? `${process.env.HOME}/.config/solana/id.json`;
  const fs = await import("fs");
  if (!fs.existsSync(keypairPath)) {
    log.error({ keypairPath }, "Operator keypair not found");
    process.exit(1);
  }
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  const wallet = new anchor.Wallet(keypair);

  log.info({ operator: keypair.publicKey.toBase58() }, "Loaded operator wallet");

  // Initialize SDK client
  const client = new SssClient({ connection, wallet });

  // Load IDL if available
  const idlPath = process.env.IDL_PATH ?? "./target/idl/sss_token.json";
  if (fs.existsSync(idlPath)) {
    const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
    await client.loadProgram(idl);
    log.info("Loaded SSS program IDL");
  } else {
    log.warn({ idlPath }, "IDL not found — lifecycle operations unavailable until loaded");
  }

  // Initialize services
  const programId = new PublicKey(
    process.env.SSS_PROGRAM_ID ?? "SSSTokenXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  );

  const indexer = new EventIndexer(connection, programId);
  const webhooks = new WebhookService({
    maxRetries: config.webhooks.maxRetries,
    retryDelayMs: config.webhooks.retryDelayMs,
    timeoutMs: config.webhooks.timeoutMs,
  });
  const compliance = new ComplianceService();
  const lifecycle = new MintBurnLifecycle(client, {
    requireApproval: process.env.REQUIRE_APPROVAL !== "false",
  });

  // Wire up: indexer -> compliance check -> webhook dispatch
  indexer.onEvent(async (event) => {
    // Check compliance rules
    compliance.processEvent({
      type: event.type,
      signature: event.signature,
      data: event.data,
    });

    // Dispatch to webhook subscribers
    await webhooks.dispatch(event);
  });

  // Start the indexer
  await indexer.start();

  // Start the API server
  const app = createApiServer({ indexer, webhooks, compliance, lifecycle });
  const server = app.listen(config.port, () => {
    log.info({ port: config.port }, "API server running");
  });

  // Graceful shutdown
  const shutdown = async () => {
    log.info("Shutting down...");
    await indexer.stop();
    server.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
