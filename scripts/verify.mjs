import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = await mkdtemp(join(tmpdir(), "sss-verify-"));
process.env.STORE_PATH = join(tempDir, "store.json");

const sdk = await import("../sdk/dist/index.js");
const cliArgs = await import("../cli/dist/args.js");
const cliConfig = await import("../cli/dist/config.js");
const backendStore = await import("../backend/dist/store.js");

const { Connection, Keypair, PublicKey } = await import("@solana/web3.js");

const connection = new Connection("http://localhost:8899", "confirmed");
const authority = Keypair.generate();
const recipient = Keypair.generate();

try {
  const stable = await sdk.SolanaStablecoin.create({
    connection,
    authority,
    preset: sdk.Presets.SSS_2,
    name: "Verify USD",
    symbol: "vUSD",
    decimals: 6,
    transferHookProgramId: Keypair.generate().publicKey
  });

  const initializeTx = await stable.buildInitializeTransaction();
  assert.equal(initializeTx.instructions.length, 1);

  const mintTx = await stable.buildMintTransaction({
    destination: recipient.publicKey,
    amount: 10n,
    minter: authority
  });
  assert.equal(mintTx.instructions.length, 1);
  await assert.rejects(
    async () => stable.buildMintTransaction({
      destination: recipient.publicKey,
      amount: 0n,
      minter: authority
    }),
    /InvalidAmount/
  );

  const seizeTx = await stable.buildSeizeTransaction({
    fromAccount: recipient.publicKey,
    toAccount: authority.publicKey,
    seizer: authority
  });
  assert.equal(seizeTx.instructions[0].keys.length, 7);

  const initHookTx = await stable.buildInitializeTransferHookMetaListTransaction();
  assert.equal(initHookTx.instructions.length, 1);

  const hookExecuteIx = sdk.buildExecuteTransferHookInstruction({
    transferHookProgramId: Keypair.generate().publicKey,
    stablecoinProgramId: stable.getProgramId(),
    mint: stable.getMintAddress(),
    source: Keypair.generate().publicKey,
    destination: Keypair.generate().publicKey,
    authority: authority.publicKey,
    destinationOwner: recipient.publicKey,
    amount: 1n
  });
  assert.equal(hookExecuteIx.keys.length, 11);

  const parsed = cliArgs.parseArgs(["mint", "RecipientPubkey", "100", "--dry-run", "--rpc", "http://localhost:8899"]);
  assert.equal(parsed.command, "mint");
  assert.equal(cliArgs.hasFlag(parsed, "--dry-run"), true);
  assert.equal(cliArgs.flagValue(parsed, "--rpc"), "http://localhost:8899");

  const normalized = cliConfig.normalizeCliConfig({ preset: "sss-2", name: "Custom" });
  assert.equal(normalized.preset, "sss-2");
  assert.equal(normalized.name, "Custom");
  assert.equal(normalized.symbol, "STBL");
  assert.equal(normalized.enableTransferHook, true);
  assert.deepEqual(normalized.registryMetadata, {
    homepage: "",
    jurisdiction: ""
  });

  const baseTomlPath = join(tempDir, "issuer-base.toml");
  const childJsonPath = join(tempDir, "issuer-prod.json");
  await writeFile(baseTomlPath, [
    "[preset]",
    "extends = \"sss-2\"",
    "",
    "[registry]",
    "homepage = \"https://issuer.example.com\"",
    "jurisdiction = \"US\"",
    "",
    "[overrides]",
    "standard_version = \"sss/1.0.1\""
  ].join("\n"));
  await writeFile(childJsonPath, JSON.stringify({
    extends: ["./issuer-base.toml"],
    name: "Issuer USD",
    symbol: "IUSD"
  }, null, 2));

  const loaded = await cliConfig.loadCliConfig(childJsonPath);
  assert.equal(loaded.preset, "sss-2");
  assert.equal(loaded.standardVersion, "sss/1.0.1");

  await backendStore.store.sync((state) => {
    state.recordAudit("verify", { ok: true });
    state.registry.set("mint-1", {
      mint: "mint-1",
      config: "config-1",
      authority: "authority-1",
      preset: "sss-3",
      standardVersion: "sss/1.1.0",
      configHash: "a".repeat(64),
      name: "Verify USD",
      symbol: "VUSD",
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
  const auditRows = await backendStore.store.read((state) => state.audit);
  assert.equal(auditRows[0]?.action, "verify");
  const registryRows = await backendStore.store.read((state) => Array.from(state.registry.values()));
  assert.equal(registryRows[0]?.preset, "sss-3");
  assert.equal(backendStore.nextWebhookBackoffMs(0), 5000);
  assert.equal(backendStore.nextWebhookBackoffMs(2), 300000);

  process.stdout.write("verify:ok\n");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
