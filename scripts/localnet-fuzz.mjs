import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction
} = await import("@solana/web3.js");
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAccount,
  getAccount,
  getMint,
  getOrCreateAssociatedTokenAccount,
  transferCheckedWithTransferHook
} = await import("@solana/spl-token");
const sdk = await import("../sdk/dist/index.js");

const ARTIFACT_PATH = "artifacts/localnet-fuzz-results.json";
const TOKEN_DECIMALS = 6;
const DEFAULT_STEPS = Number(process.env.SSS_FUZZ_STEPS ?? 80);
const DEFAULT_SEED = Number(process.env.SSS_FUZZ_SEED ?? 1337);

const STABLECOIN_PROGRAM_ID = new PublicKey("Gm2SdmH1ydLKmPtjNE4W2ZLjW5kMvPrx784L7oUcw4w");
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey("E24UT9RMiw9zBh51ZMzXRdmoiLQ2PkVZ1sYhBKqazYy8");
const REGISTRY_PROGRAM_ID = new PublicKey("5vedffCtRhecm5sSXJCbgrwe7GYnGC9XK5vWLiMHLVXB");

const REQUIRED_COVERAGE = [
  "initialize",
  "mint",
  "burn",
  "pause",
  "unpause",
  "freeze_account",
  "thaw_account",
  "update_roles",
  "propose_authority",
  "accept_authority",
  "add_to_blacklist",
  "remove_from_blacklist",
  "seize",
  "update_compliance_root",
  "submit_proof_receipt",
  "revoke_proof_receipt",
  "register_release",
  "deprecate_release",
  "register_stablecoin"
];

const connection = new Connection("http://127.0.0.1:8899", "confirmed");

function createRng(seed) {
  let state = BigInt(seed >>> 0);
  return () => {
    state = (state * 1664525n + 1013904223n) & 0xffffffffn;
    return Number(state) / 0x100000000;
  };
}

async function loadKeypair(path) {
  const raw = await readFile(path, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function sendBuiltTransaction(transaction, payer, signers) {
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = payer.publicKey;
  transaction.recentBlockhash = latestBlockhash.blockhash;
  return sendAndConfirmTransaction(connection, transaction, [payer, ...signers], {
    commitment: "confirmed"
  });
}

async function sendSingleInstruction(instruction, payer, signers = []) {
  return sendBuiltTransaction(sdk.buildRegistryTransaction(instruction), payer, signers);
}

function randomAmount(rand, min = 1n, max = 100_000n) {
  const span = Number(max - min + 1n);
  return min + BigInt(Math.floor(rand() * span));
}

function randomReason(rand) {
  return `fuzz-${Math.floor(rand() * 1_000_000)}`;
}

function hexToBytes(hex) {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function generateZkProof(subject, expiresAtSlot) {
  const raw = execFileSync(
    "cargo",
    ["run", "-q", "-p", "sss-zk-compliance", "--bin", "sss-zk-prove"],
    {
      cwd: process.cwd(),
      input: JSON.stringify({
        subject: subject.toBase58(),
        expires_at_slot: expiresAtSlot,
        circuit: "sss3-merkle-schnorr-v1"
      }),
      encoding: "utf8"
    }
  );
  return JSON.parse(raw);
}

async function expectFailure(label, fn, pattern) {
  await assert.rejects(fn, pattern, label);
}

async function main() {
  const rand = createRng(DEFAULT_SEED);
  const authority = await loadKeypair(".local-validator-authority.json");
  const operator = Keypair.generate();
  const nextAuthority = Keypair.generate();
  const releaseSuffix = Date.now().toString(36).slice(-6);
  const releaseVersion = `sss/fz-${DEFAULT_SEED}-${releaseSuffix}`;

  const results = {
    checkedAt: new Date().toISOString(),
    seed: DEFAULT_SEED,
    steps: DEFAULT_STEPS,
    authority: authority.publicKey.toBase58(),
    operator: operator.publicKey.toBase58(),
    nextAuthority: nextAuthority.publicKey.toBase58(),
    coverage: {},
    randomActions: [],
    counts: {
      positive: 0,
      negative: 0
    }
  };

  const cover = (name) => {
    results.coverage[name] = (results.coverage[name] ?? 0) + 1;
  };

  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  for (const recipient of [operator.publicKey, nextAuthority.publicKey]) {
    const transaction = new Transaction({
      feePayer: authority.publicKey,
      recentBlockhash: latestBlockhash.blockhash
    }).add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: recipient,
        lamports: 2_000_000_000
      })
    );
    await sendAndConfirmTransaction(connection, transaction, [authority], { commitment: "confirmed" });
  }

  const registryConfig = await connection.getAccountInfo(sdk.findRegistryConfigPda(REGISTRY_PROGRAM_ID), "confirmed");
  if (!registryConfig) {
    await sendSingleInstruction(
      sdk.buildInitializeRegistryInstruction(authority.publicKey, REGISTRY_PROGRAM_ID),
      authority
    );
  }

  const sss1 = await sdk.SolanaStablecoin.createOnChain({
    connection,
    authority,
    programId: STABLECOIN_PROGRAM_ID,
    preset: sdk.Presets.SSS_1,
    name: "Fuzz Minimal USD",
    symbol: "f1USD",
    decimals: TOKEN_DECIMALS,
    standardVersion: "sss/1.0.0",
    registryMetadata: { homepage: "https://local/fuzz", jurisdiction: "US" }
  });
  const sss2 = await sdk.SolanaStablecoin.createOnChain({
    connection,
    authority,
    programId: STABLECOIN_PROGRAM_ID,
    preset: sdk.Presets.SSS_2,
    name: "Fuzz Regulated USD",
    symbol: "f2USD",
    decimals: TOKEN_DECIMALS,
    standardVersion: "sss/1.0.0",
    transferHookProgramId: TRANSFER_HOOK_PROGRAM_ID,
    registryMetadata: { homepage: "https://local/fuzz", jurisdiction: "US" }
  });
  const sss3 = await sdk.SolanaStablecoin.createOnChain({
    connection,
    authority,
    programId: STABLECOIN_PROGRAM_ID,
    preset: sdk.Presets.SSS_3,
    name: "Fuzz Private USD",
    symbol: "f3USD",
    decimals: TOKEN_DECIMALS,
    standardVersion: "sss/1.1.0",
    transferHookProgramId: TRANSFER_HOOK_PROGRAM_ID,
    registryMetadata: { homepage: "https://local/fuzz", jurisdiction: "US" },
    compliance: {
      proofVerifierProgramId: STABLECOIN_PROGRAM_ID,
      compressedComplianceRoot: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      complianceCircuit: "sss3-merkle-schnorr-v1"
    }
  });
  const transferStable = await sdk.SolanaStablecoin.createOnChain({
    connection,
    authority,
    programId: STABLECOIN_PROGRAM_ID,
    preset: sdk.Presets.SSS_1,
    name: "Authority Transfer USD",
    symbol: "atUSD",
    decimals: TOKEN_DECIMALS,
    standardVersion: "sss/1.0.0"
  });
  cover("initialize");
  cover("initialize");
  cover("initialize");
  cover("initialize");

  await sss2.stablecoin.initializeTransferHookMetaListOnChain(TRANSFER_HOOK_PROGRAM_ID);
  await sss3.stablecoin.initializeTransferHookMetaListOnChain(TRANSFER_HOOK_PROGRAM_ID);

  const connectedSss1 = await sdk.SolanaStablecoin.connect({
    connection,
    authority: operator,
    programId: STABLECOIN_PROGRAM_ID,
    mint: sss1.stablecoin.getMintAddress()
  });
  const connectedSss2 = await sdk.SolanaStablecoin.connect({
    connection,
    authority: operator,
    programId: STABLECOIN_PROGRAM_ID,
    mint: sss2.stablecoin.getMintAddress()
  });

  await sss1.stablecoin.updateRoleOnChain({ holder: operator.publicKey, role: "minter", isActive: true, mintQuota: 10_000_000n });
  await sss1.stablecoin.updateRoleOnChain({ holder: operator.publicKey, role: "burner", isActive: true, mintQuota: null });
  for (const role of ["pauser", "blacklister", "seizer"]) {
    await sss2.stablecoin.updateRoleOnChain({ holder: operator.publicKey, role, isActive: true, mintQuota: null });
  }
  cover("update_roles");
  cover("update_roles");
  cover("update_roles");
  cover("update_roles");
  cover("update_roles");

  const sss1AuthorityAta = await getOrCreateAssociatedTokenAccount(connection, authority, sss1.stablecoin.getMintAddress(), authority.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const sss1OperatorAta = await getOrCreateAssociatedTokenAccount(connection, authority, sss1.stablecoin.getMintAddress(), operator.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  const sss2SourceOwner = Keypair.generate();
  const sss2DestinationOwner = Keypair.generate();
  const sss2SourceAta = await getOrCreateAssociatedTokenAccount(connection, authority, sss2.stablecoin.getMintAddress(), sss2SourceOwner.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const sss2DestinationAta = await getOrCreateAssociatedTokenAccount(connection, authority, sss2.stablecoin.getMintAddress(), sss2DestinationOwner.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const sss2TreasuryAta = await getOrCreateAssociatedTokenAccount(connection, authority, sss2.stablecoin.getMintAddress(), authority.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  for (const address of [sss2SourceAta.address, sss2DestinationAta.address, sss2TreasuryAta.address]) {
    await sss2.stablecoin.freezeOnChain(address, true);
    cover("thaw_account");
  }

  const sss3Owner = Keypair.generate();
  const sss3Source = await createAccount(connection, authority, sss3.stablecoin.getMintAddress(), sss3Owner.publicKey, Keypair.generate(), { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);
  const sss3Destination = await createAccount(connection, authority, sss3.stablecoin.getMintAddress(), sss3Owner.publicKey, Keypair.generate(), { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);
  await sss3.stablecoin.freezeOnChain(sss3Source, true);
  await sss3.stablecoin.freezeOnChain(sss3Destination, true);
  cover("thaw_account");
  cover("thaw_account");

  const releaseIx = sdk.buildRegisterReleaseInstruction({
    authority: authority.publicKey,
    standardVersion: releaseVersion,
    preset: "sss-3",
    schemaHash: (await sss3.stablecoin.getRegistryEntry()).configHash,
    notesUri: "https://local/fuzz/release"
  }, REGISTRY_PROGRAM_ID);
  await sendSingleInstruction(releaseIx, authority);
  cover("register_release");

  const deprecateIx = sdk.buildDeprecateReleaseInstruction(authority.publicKey, releaseVersion, "sss/1.1.0", REGISTRY_PROGRAM_ID);
  await sendSingleInstruction(deprecateIx, authority);
  cover("deprecate_release");

  for (const stable of [sss1.stablecoin, sss2.stablecoin, sss3.stablecoin]) {
    const entry = await stable.getRegistryEntry();
    await sendSingleInstruction(
      sdk.buildRegisterStablecoinInstruction({ stablecoinProgramId: STABLECOIN_PROGRAM_ID, entry }, REGISTRY_PROGRAM_ID),
      authority
    );
    cover("register_stablecoin");
  }

  await sss1.stablecoin.mintOnChain({ destination: sss1AuthorityAta.address, amount: 500_000n, minter: authority });
  await sss1.stablecoin.burnOnChain({ source: sss1AuthorityAta.address, amount: 100_000n, burner: authority });
  await connectedSss1.mintOnChain({ destination: sss1OperatorAta.address, amount: 250_000n, minter: operator });
  await connectedSss1.burnOnChain({ source: sss1OperatorAta.address, amount: 50_000n, burner: operator });
  cover("mint");
  cover("burn");
  cover("mint");
  cover("burn");

  await connectedSss2.pauseOnChain(true);
  cover("pause");
  await expectFailure("mint while paused", () => sss2.stablecoin.mintOnChain({ destination: sss2SourceAta.address, amount: 10n, minter: authority }), /Paused|custom program error/i);
  results.counts.negative += 1;
  await connectedSss2.pauseOnChain(false);
  cover("unpause");

  await sss2.stablecoin.mintOnChain({ destination: sss2SourceAta.address, amount: 1_000_000n, minter: authority });
  cover("mint");
  await connectedSss2.freezeOnChain(sss2SourceAta.address, false);
  cover("freeze_account");
  await expectFailure("transfer while frozen", () => transferCheckedWithTransferHook(connection, authority, sss2SourceAta.address, sss2.stablecoin.getMintAddress(), sss2DestinationAta.address, sss2SourceOwner, 10n, TOKEN_DECIMALS, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID), /frozen|custom program error/i);
  results.counts.negative += 1;
  await connectedSss2.freezeOnChain(sss2SourceAta.address, true);
  cover("thaw_account");

  await connectedSss2.blacklistAddOnChain({ address: sss2DestinationOwner.publicKey, reason: "fuzz-blacklist" });
  cover("add_to_blacklist");
  await expectFailure("transfer to blacklisted destination", () => transferCheckedWithTransferHook(connection, authority, sss2SourceAta.address, sss2.stablecoin.getMintAddress(), sss2DestinationAta.address, sss2SourceOwner, 10n, TOKEN_DECIMALS, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID), /blacklist|custom program error/i);
  results.counts.negative += 1;
  await connectedSss2.blacklistRemoveOnChain(sss2DestinationOwner.publicKey);
  cover("remove_from_blacklist");
  await transferCheckedWithTransferHook(connection, authority, sss2SourceAta.address, sss2.stablecoin.getMintAddress(), sss2DestinationAta.address, sss2SourceOwner, 100_000n, TOKEN_DECIMALS, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);
  results.counts.positive += 1;

  await connectedSss2.seizeOnChain({ fromAccount: sss2SourceAta.address, toAccount: sss2TreasuryAta.address, seizer: operator });
  cover("seize");

  const zkProof = generateZkProof(sss3Owner.publicKey, (await connection.getSlot("confirmed")) + 500);
  await expectFailure("sss3 transfer without proof", () => transferCheckedWithTransferHook(connection, authority, sss3Source, sss3.stablecoin.getMintAddress(), sss3Destination, sss3Owner, 1n, TOKEN_DECIMALS, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID), /proof receipt|custom program error/i);
  results.counts.negative += 1;
  await sss3.stablecoin.updateComplianceRootOnChain(zkProof.compliance_root);
  cover("update_compliance_root");
  await sss3.stablecoin.mintOnChain({ destination: sss3Source, amount: 500_000n, minter: authority });
  cover("mint");
  await sss3.stablecoin.submitProofReceiptOnChain({
    subject: sss3Owner.publicKey,
    commitment: hexToBytes(zkProof.commitment),
    proofCommitment: hexToBytes(zkProof.proof_commitment),
    response: hexToBytes(zkProof.response),
    merkleSiblings: [],
    merkleDirections: [],
    circuit: "sss3-merkle-schnorr-v1",
    expiresAtSlot: BigInt(zkProof.expires_at_slot)
  });
  cover("submit_proof_receipt");
  await transferCheckedWithTransferHook(connection, authority, sss3Source, sss3.stablecoin.getMintAddress(), sss3Destination, sss3Owner, 100_000n, TOKEN_DECIMALS, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);
  results.counts.positive += 1;
  await sss3.stablecoin.revokeProofReceiptOnChain(sss3Owner.publicKey);
  cover("revoke_proof_receipt");

  await sendBuiltTransaction(await transferStable.stablecoin.buildAuthorityTransferTransaction(nextAuthority.publicKey), authority, []);
  cover("propose_authority");
  const acceptIx = sdk.buildInstruction(STABLECOIN_PROGRAM_ID, "accept_authority", sdk.encodeStablecoinInstruction("accept_authority", {}), [
    sdk.writable(transferStable.stablecoin.getConfigAddress()),
    sdk.readonly(nextAuthority.publicKey, true)
  ]);
  await sendBuiltTransaction(sdk.buildTransaction(acceptIx), nextAuthority, []);
  cover("accept_authority");
  const transferredStable = await sdk.SolanaStablecoin.connect({
    connection,
    authority: nextAuthority,
    programId: STABLECOIN_PROGRAM_ID,
    mint: transferStable.stablecoin.getMintAddress()
  });
  const transferAuthorityAta = await getOrCreateAssociatedTokenAccount(connection, authority, transferStable.stablecoin.getMintAddress(), nextAuthority.publicKey, false, "confirmed", undefined, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  await transferredStable.mintOnChain({ destination: transferAuthorityAta.address, amount: 1n, minter: nextAuthority });
  cover("mint");

  const randomActions = [
    async () => {
      const amount = randomAmount(rand, 1n, 50_000n);
      await connectedSss1.mintOnChain({ destination: sss1OperatorAta.address, amount, minter: operator });
      results.randomActions.push({ action: "sss1_delegated_mint", amount: amount.toString() });
      results.counts.positive += 1;
      cover("mint");
    },
    async () => {
      const account = await getAccount(connection, sss1OperatorAta.address, "confirmed", TOKEN_2022_PROGRAM_ID);
      if (account.amount === 0n) return;
      const amount = account.amount < 25_000n ? account.amount : randomAmount(rand, 1n, account.amount);
      await connectedSss1.burnOnChain({ source: sss1OperatorAta.address, amount, burner: operator });
      results.randomActions.push({ action: "sss1_delegated_burn", amount: amount.toString() });
      results.counts.positive += 1;
      cover("burn");
    },
    async () => {
      await connectedSss2.pauseOnChain(true);
      await expectFailure("fuzz paused mint", () => sss2.stablecoin.mintOnChain({ destination: sss2SourceAta.address, amount: 1n, minter: authority }), /Paused|custom program error/i);
      await connectedSss2.pauseOnChain(false);
      results.randomActions.push({ action: "sss2_pause_cycle" });
      results.counts.negative += 1;
      results.counts.positive += 2;
      cover("pause");
      cover("unpause");
    },
    async () => {
      await sss2.stablecoin.mintOnChain({ destination: sss2SourceAta.address, amount: 5n, minter: authority });
      cover("mint");
      await connectedSss2.freezeOnChain(sss2SourceAta.address, false);
      await expectFailure("fuzz frozen transfer", () => transferCheckedWithTransferHook(connection, authority, sss2SourceAta.address, sss2.stablecoin.getMintAddress(), sss2DestinationAta.address, sss2SourceOwner, 1n, TOKEN_DECIMALS, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID), /frozen|custom program error/i);
      await connectedSss2.freezeOnChain(sss2SourceAta.address, true);
      results.randomActions.push({ action: "sss2_freeze_cycle" });
      results.counts.negative += 1;
      results.counts.positive += 3;
      cover("freeze_account");
      cover("thaw_account");
    },
    async () => {
      await sss2.stablecoin.mintOnChain({ destination: sss2SourceAta.address, amount: 5n, minter: authority });
      cover("mint");
      await connectedSss2.blacklistAddOnChain({ address: sss2DestinationOwner.publicKey, reason: randomReason(rand) });
      await expectFailure("fuzz blacklisted transfer", () => transferCheckedWithTransferHook(connection, authority, sss2SourceAta.address, sss2.stablecoin.getMintAddress(), sss2DestinationAta.address, sss2SourceOwner, 1n, TOKEN_DECIMALS, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID), /blacklist|custom program error/i);
      await connectedSss2.blacklistRemoveOnChain(sss2DestinationOwner.publicKey);
      results.randomActions.push({ action: "sss2_blacklist_cycle" });
      results.counts.negative += 1;
      results.counts.positive += 3;
      cover("add_to_blacklist");
      cover("remove_from_blacklist");
    },
    async () => {
      const amount = randomAmount(rand, 1n, 25_000n);
      await sss2.stablecoin.mintOnChain({ destination: sss2SourceAta.address, amount, minter: authority });
      await transferCheckedWithTransferHook(connection, authority, sss2SourceAta.address, sss2.stablecoin.getMintAddress(), sss2DestinationAta.address, sss2SourceOwner, amount, TOKEN_DECIMALS, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);
      results.randomActions.push({ action: "sss2_mint_transfer", amount: amount.toString() });
      results.counts.positive += 2;
      cover("mint");
    },
    async () => {
      const currentSlot = await connection.getSlot("confirmed");
      const proof = generateZkProof(sss3Owner.publicKey, currentSlot + 500);
      await sss3.stablecoin.updateComplianceRootOnChain(proof.compliance_root);
      await sss3.stablecoin.submitProofReceiptOnChain({
        subject: sss3Owner.publicKey,
        commitment: hexToBytes(proof.commitment),
        proofCommitment: hexToBytes(proof.proof_commitment),
        response: hexToBytes(proof.response),
        merkleSiblings: [],
        merkleDirections: [],
        circuit: "sss3-merkle-schnorr-v1",
        expiresAtSlot: BigInt(proof.expires_at_slot)
      });
      await transferCheckedWithTransferHook(connection, authority, sss3Source, sss3.stablecoin.getMintAddress(), sss3Destination, sss3Owner, 1n, TOKEN_DECIMALS, [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID);
      await sss3.stablecoin.revokeProofReceiptOnChain(sss3Owner.publicKey);
      results.randomActions.push({ action: "sss3_proof_cycle" });
      results.counts.positive += 4;
      cover("update_compliance_root");
      cover("submit_proof_receipt");
      cover("revoke_proof_receipt");
    }
  ];

  for (let step = 0; step < DEFAULT_STEPS; step += 1) {
    await randomActions[Math.floor(rand() * randomActions.length)]();
  }

  for (const name of REQUIRED_COVERAGE) {
    assert.ok(results.coverage[name] > 0, `Missing fuzz coverage for instruction ${name}`);
  }

  const sss1MintInfo = await getMint(connection, sss1.stablecoin.getMintAddress(), "confirmed", TOKEN_2022_PROGRAM_ID);
  const sss2Treasury = await getAccount(connection, sss2TreasuryAta.address, "confirmed", TOKEN_2022_PROGRAM_ID);
  const transferConfig = await transferredStable.getConfig();
  assert.equal(transferConfig.authority, nextAuthority.publicKey.toBase58(), "authority transfer did not persist");

  results.finalState = {
    sss1Supply: sss1MintInfo.supply.toString(),
    sss2Treasury: sss2Treasury.amount.toString(),
    transferAuthority: transferConfig.authority,
    registeredStablecoins: [
      sdk.findStablecoinRegistrationPda(sss1.stablecoin.getMintAddress(), REGISTRY_PROGRAM_ID).toBase58(),
      sdk.findStablecoinRegistrationPda(sss2.stablecoin.getMintAddress(), REGISTRY_PROGRAM_ID).toBase58(),
      sdk.findStablecoinRegistrationPda(sss3.stablecoin.getMintAddress(), REGISTRY_PROGRAM_ID).toBase58()
    ]
  };

  await mkdir("artifacts", { recursive: true });
  await writeFile(ARTIFACT_PATH, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(results)}\n`);
}

main().catch((error) => {
  process.stderr.write(`localnet-fuzz:failed:${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
