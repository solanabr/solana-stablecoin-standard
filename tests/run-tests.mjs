import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Connection, Keypair } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const scope = process.argv[2] ?? "all";
const shouldRun = (name) => scope === "all" || scope === name;

async function runSdkTests() {
  const sdk = await import("../sdk/dist/index.js");
  const authority = Keypair.generate();
  const stable = await sdk.SolanaStablecoin.create({
    connection: new Connection("http://localhost:8899", "confirmed"),
    authority,
    preset: sdk.Presets.SSS_2,
    name: "Regulated USD",
    symbol: "rUSD",
    decimals: 6,
    transferHookProgramId: Keypair.generate().publicKey
  });

  const seizeTx = await stable.buildSeizeTransaction({
    fromAccount: Keypair.generate().publicKey,
    toAccount: Keypair.generate().publicKey,
    seizer: authority
  });
  assert.equal(seizeTx.instructions.length, 1);
  assert.equal(seizeTx.instructions[0].keys.length, 7);
  assert.equal(seizeTx.instructions[0].keys[2].pubkey.toBase58(), stable.getMintAddress().toBase58());
  assert.equal(seizeTx.instructions[0].keys[5].pubkey.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58());

  const config = await stable.getConfig();
  assert.equal(config.authority, authority.publicKey.toBase58());
  const browserStyleStable = await sdk.SolanaStablecoin.create({
    connection: new Connection("http://localhost:8899", "confirmed"),
    authority: authority.publicKey,
    preset: sdk.Presets.SSS_1,
    name: "Browser USD",
    symbol: "bUSD",
    decimals: 6
  });
  assert.equal(browserStyleStable.getAuthorityPublicKey().toBase58(), authority.publicKey.toBase58());
  const browserMintTx = await browserStyleStable.buildMintTransaction({
    destination: Keypair.generate().publicKey,
    amount: 2n,
    minter: authority.publicKey
  });
  assert.equal(browserMintTx.instructions[0].keys[3].pubkey.toBase58(), authority.publicKey.toBase58());
  const directMintTx = await stable.buildMintTransaction({
    destination: Keypair.generate().publicKey,
    amount: 1n,
    minter: authority
  });
  assert.equal(directMintTx.instructions[0].keys.length, 6);
  assert.equal(directMintTx.instructions[0].keys[4].pubkey.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58());

  const hookExecuteIx = sdk.buildExecuteTransferHookInstruction({
    transferHookProgramId: Keypair.generate().publicKey,
    stablecoinProgramId: Keypair.generate().publicKey,
    mint: Keypair.generate().publicKey,
    source: Keypair.generate().publicKey,
    destination: Keypair.generate().publicKey,
    authority: Keypair.generate().publicKey,
    destinationOwner: Keypair.generate().publicKey,
    amount: 1n
  });
  assert.equal(hookExecuteIx.keys.length, 11);

  const initHookTx = await stable.buildInitializeTransferHookMetaListTransaction();
  assert.equal(initHookTx.instructions.length, 1);

  stable.config.authority = Keypair.generate().publicKey.toBase58();
  const delegatedPauseTx = await stable.buildPauseTransaction(true);
  assert.equal(delegatedPauseTx.instructions[0].keys.length, 3);
  const delegatedMintTx = await stable.buildMintTransaction({
    destination: Keypair.generate().publicKey,
    amount: 1n,
    minter: authority
  });
  assert.equal(delegatedMintTx.instructions[0].keys.length, 6);
  assert.notEqual(delegatedMintTx.instructions[0].keys[4].pubkey.toBase58(), stable.getProgramId().toBase58());
  const registryEntry = await stable.getRegistryEntry();
  assert.equal(registryEntry.authority, stable.config.authority);
}

async function runCliTests() {
  const cliArgs = await import("../cli/dist/args.js");
  const cliConfig = await import("../cli/dist/config.js");

  const parsed = cliArgs.parseArgs([
    "mint",
    "RecipientPubkey",
    "100",
    "--dry-run",
    "--rpc",
    "http://localhost:8899"
  ]);
  assert.equal(parsed.command, "mint");
  assert.equal(cliArgs.hasFlag(parsed, "--dry-run"), true);
  assert.equal(cliArgs.flagValue(parsed, "--rpc"), "http://localhost:8899");

  const normalized = cliConfig.normalizeCliConfig({ preset: "sss-2", name: "Issuer USD" });
  assert.equal(normalized.preset, "sss-2");
  assert.equal(normalized.enableTransferHook, true);
  assert.deepEqual(normalized.registryMetadata, {
    homepage: "",
    jurisdiction: ""
  });
}

async function runBackendTests() {
  const tempDir = await mkdtemp(join(tmpdir(), "sss-backend-test-"));
  process.env.STORE_PATH = join(tempDir, "store.json");

  try {
    const backendStore = await import(`../backend/dist/store.js?ts=${Date.now()}`);
    const backendShared = await import(`../backend/dist/shared.js?ts=${Date.now()}`);
    await backendStore.store.sync((state) => {
      state.recordAudit("backend-test", { ok: true });
      state.registry.set("mint-1", {
        mint: "mint-1",
        config: "config-1",
        authority: "authority-1",
        preset: "sss-3",
        standardVersion: "sss/1.1.0",
        configHash: "b".repeat(64),
        name: "Backend USD",
        symbol: "BUSD",
        uri: "",
        decimals: 6,
        enablePermanentDelegate: true,
        enableTransferHook: true,
        defaultAccountFrozen: true,
        enableConfidentialTransfers: true,
        enableZkComplianceProofs: true,
        enableCompressedComplianceState: true,
        transferHookProgramId: null,
        proofVerifierProgramId: null,
        compressedComplianceRoot: null,
        complianceCircuit: null,
        metadata: {},
        createdAt: new Date().toISOString()
      });
    });

    await backendStore.store.reload();
    const audit = await backendStore.store.read((state) => state.audit);
    const registryRows = await backendStore.store.read((state) => Array.from(state.registry.values()));
    assert.equal(audit[0]?.action, "backend-test");
    assert.equal(registryRows[0]?.preset, "sss-3");
    assert.equal(backendStore.nextWebhookBackoffMs(1), 30000);

    assert.throws(
      () => backendShared.buildService({
        rpcUrl: "http://localhost:8899",
        port: 3001,
        host: "127.0.0.1",
        service: "test-service",
        apiKey: "",
        bodyLimitBytes: 65_536,
        rateLimitWindowMs: 60_000,
        rateLimitMaxRequests: 120,
        storePath: process.env.STORE_PATH
      }),
      /MissingServiceApiKey/
    );

    const app = backendShared.buildService({
      rpcUrl: "http://localhost:8899",
      port: 3001,
      host: "127.0.0.1",
      service: "test-service",
      apiKey: "test-secret",
      bodyLimitBytes: 65_536,
      rateLimitWindowMs: 60_000,
      rateLimitMaxRequests: 2,
      storePath: process.env.STORE_PATH
    });
    app.get("/secured", async () => ({ ok: true }));

    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);

    const unauthorized = await app.inject({ method: "GET", url: "/secured" });
    assert.equal(unauthorized.statusCode, 401);

    const authorized = await app.inject({
      method: "GET",
      url: "/secured",
      headers: { "x-api-key": "test-secret" }
    });
    assert.equal(authorized.statusCode, 200);

    const authorizedAgain = await app.inject({
      method: "GET",
      url: "/secured",
      headers: { "x-api-key": "test-secret" }
    });
    assert.equal(authorizedAgain.statusCode, 200);

    const rateLimited = await app.inject({
      method: "GET",
      url: "/secured",
      headers: { "x-api-key": "test-secret" }
    });
    assert.equal(rateLimited.statusCode, 429);
    await app.close();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

if (shouldRun("sdk")) {
  await runSdkTests();
}
if (shouldRun("cli")) {
  await runCliTests();
}
if (shouldRun("backend")) {
  await runBackendTests();
}

process.stdout.write(`tests:${scope}:ok\n`);
