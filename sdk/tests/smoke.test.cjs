const test = require("node:test");
const assert = require("node:assert/strict");
const { Keypair } = require("@solana/web3.js");
const {
  Presets,
  Preset,
  BackingType,
  BankingRail,
  deriveConfigPda,
  deriveRolesPda,
  SSS_TOKEN_PROGRAM_ID,
} = require("../dist/index.js");

test("Presets.SSS_1 sets expected defaults", () => {
  const config = Presets.SSS_1({});
  assert.equal(config.preset, Preset.SSS1);
  assert.equal(config.decimals, 6);
  assert.equal(config.backingType, BackingType.Fiat);
  assert.equal(config.bankingRail, BankingRail.None);
});

test("Presets.SSS_2 enables hook-backed defaults", () => {
  const config = Presets.SSS_2({ name: "Issuer USD", symbol: "IUSD" });
  assert.equal(config.preset, Preset.SSS2);
  assert.equal(config.name, "Issuer USD");
  assert.equal(config.symbol, "IUSD");
  assert.ok(config.hookProgramId);
  assert.equal(config.bankingRail, BankingRail.Swift);
});

test("PDA derivation is deterministic", () => {
  const mint = Keypair.generate().publicKey;
  const [configA] = deriveConfigPda(mint);
  const [configB] = deriveConfigPda(mint);
  assert.equal(configA.toBase58(), configB.toBase58());
});

test("Role PDA changes per target wallet", () => {
  const mint = Keypair.generate().publicKey;
  const [config] = deriveConfigPda(mint);
  const walletA = Keypair.generate().publicKey;
  const walletB = Keypair.generate().publicKey;

  const [rolesA] = deriveRolesPda(config, walletA);
  const [rolesB] = deriveRolesPda(config, walletB);

  assert.notEqual(rolesA.toBase58(), rolesB.toBase58());
});

test("Program ID exists and is parseable", () => {
  assert.equal(typeof SSS_TOKEN_PROGRAM_ID.toBase58(), "string");
  assert.ok(SSS_TOKEN_PROGRAM_ID.toBase58().length > 0);
});
