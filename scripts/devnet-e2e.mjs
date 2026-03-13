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
  ACCOUNT_SIZE,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountState,
  TOKEN_2022_PROGRAM_ID,
  createAccount,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  transferCheckedWithTransferHook
} = await import("@solana/spl-token");
const sdk = await import("../sdk/dist/index.js");

const ARTIFACT_PATH = "artifacts/devnet-e2e-results.json";
const TOKEN_DECIMALS = 6;
const TOKEN_ERROR_PATTERN =
  /custom program error|frozen|blacklist|proof receipt|paused|quota|failed|instruction error/i;

function envOrThrow(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`MissingEnv:${name}`);
  }
  return value;
}

async function loadKeypair(path) {
  const raw = await readFile(path, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(label, fn, attempts = 5) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === attempts) {
        throw new Error(`${label} failed after ${attempts} attempts: ${message}`);
      }
      process.stdout.write(`${JSON.stringify({ step: label, attempt, retrying: true, message })}\n`);
      await sleep(4000 * attempt);
    }
  }
  throw lastError ?? new Error(`${label} failed`);
}

function uniqueSigners(signers) {
  const seen = new Set();
  return signers.filter((signer) => {
    const key = signer.publicKey.toBase58();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function sendBuiltTransaction(connection, transaction, payer, signers) {
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = payer.publicKey;
  transaction.recentBlockhash = latestBlockhash.blockhash;
  return sendAndConfirmTransaction(connection, transaction, uniqueSigners([payer, ...signers]), {
    commitment: "confirmed"
  });
}

async function sendSingleInstruction(connection, instruction, payer, signers = []) {
  return sendBuiltTransaction(connection, sdk.buildRegistryTransaction(instruction), payer, signers);
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

async function expectFailure(label, fn, pattern = TOKEN_ERROR_PATTERN) {
  await assert.rejects(async () => fn(), pattern, label);
}

async function readTokenAccount(connection, address) {
  return getAccount(connection, address, "confirmed", TOKEN_2022_PROGRAM_ID);
}

async function assertAmount(connection, label, address, expected) {
  const account = await withRetry(`read ${label}`, () => readTokenAccount(connection, address));
  assert.equal(account.amount.toString(), expected.toString(), `${label} amount mismatch`);
  return account;
}

async function assertState(connection, label, address, expectedState) {
  const account = await withRetry(`read ${label} state`, () => readTokenAccount(connection, address));
  const actualState =
    account.state
    ?? (account.isFrozen ? AccountState.Frozen : (account.isInitialized ? AccountState.Initialized : undefined));
  assert.equal(actualState, expectedState, `${label} state mismatch`);
  return account;
}

async function main() {
  const rpcUrl = process.env.SSS_RPC_URL ?? "https://api.devnet.solana.com";
  const authority = await loadKeypair(envOrThrow("SSS_KEYPAIR"));
  const stablecoinProgramId = new PublicKey(envOrThrow("SSS_STABLECOIN_PROGRAM_ID"));
  const transferHookProgramId = new PublicKey(envOrThrow("SSS_TRANSFER_HOOK_PROGRAM_ID"));
  const registryProgramId = new PublicKey(envOrThrow("SSS_REGISTRY_PROGRAM_ID"));
  const connection = new Connection(rpcUrl, "confirmed");
  const delegatedOperator = Keypair.generate();

  const results = {
    checkedAt: new Date().toISOString(),
    rpcUrl,
    authority: authority.publicKey.toBase58(),
    delegatedOperator: delegatedOperator.publicKey.toBase58(),
    programs: {
      stablecoin: stablecoinProgramId.toBase58(),
      transferHook: transferHookProgramId.toBase58(),
      registry: registryProgramId.toBase58()
    },
    registry: {
      config: sdk.findRegistryConfigPda(registryProgramId).toBase58(),
      initializeSignature: null,
      release110Signature: null
    },
    stablecoins: {}
  };

  const registryConfigPda = new PublicKey(results.registry.config);
  await withRetry("fund delegated operator", async () => {
    const balance = await connection.getBalance(delegatedOperator.publicKey, "confirmed");
    if (balance >= 50_000_000) {
      return null;
    }
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
    const transaction = new Transaction({
      feePayer: authority.publicKey,
      recentBlockhash: latestBlockhash.blockhash
    }).add(SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: delegatedOperator.publicKey,
      lamports: 50_000_000
    }));
    return sendAndConfirmTransaction(connection, transaction, [authority], {
      commitment: "confirmed"
    });
  });
  const existingRegistry = await withRetry("fetch registry config", () =>
    connection.getAccountInfo(registryConfigPda, "confirmed")
  );
  if (!existingRegistry) {
    results.registry.initializeSignature = await withRetry("initialize registry", () =>
      sendSingleInstruction(
        connection,
        sdk.buildInitializeRegistryInstruction(authority.publicKey, registryProgramId),
        authority
      )
    );
  }

  async function createStablecoin(key, createParams) {
    const created = await withRetry(`create ${key}`, () =>
      sdk.SolanaStablecoin.createOnChain({
        connection,
        authority,
        programId: stablecoinProgramId,
        ...createParams
      })
    );
    const entry = await withRetry(`registry entry ${key}`, () => created.stablecoin.getRegistryEntry());
    const item = {
      mint: created.stablecoin.getMintAddress().toBase58(),
      config: created.stablecoin.getConfigAddress().toBase58(),
      signature: created.signature,
      preset: entry.preset,
      standardVersion: entry.standardVersion,
      configHash: entry.configHash,
      transferHookInitSignature: null,
      registrySignature: null,
      extra: {}
    };
    results.stablecoins[key] = item;
    return { created, entry, item };
  }

  const sss1 = await createStablecoin("sss1", {
    preset: sdk.Presets.SSS_1,
    name: "Devnet Minimal USD",
    symbol: "d1USD",
    decimals: TOKEN_DECIMALS,
    standardVersion: "sss/1.0.0",
    registryMetadata: {
      homepage: "https://example.com/sss/devnet",
      jurisdiction: "US"
    }
  });

  const sss2 = await createStablecoin("sss2", {
    preset: sdk.Presets.SSS_2,
    name: "Devnet Regulated USD",
    symbol: "d2USD",
    decimals: TOKEN_DECIMALS,
    standardVersion: "sss/1.0.0",
    transferHookProgramId,
    registryMetadata: {
      homepage: "https://example.com/sss/devnet",
      jurisdiction: "US"
    }
  });

  const sss3 = await createStablecoin("sss3", {
    preset: sdk.Presets.SSS_3,
    name: "Devnet Private USD",
    symbol: "d3USD",
    decimals: TOKEN_DECIMALS,
    standardVersion: "sss/1.1.0",
    transferHookProgramId,
    registryMetadata: {
      homepage: "https://example.com/sss/devnet",
      jurisdiction: "US"
    },
    compliance: {
      proofVerifierProgramId: stablecoinProgramId,
      compressedComplianceRoot: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      complianceCircuit: "sss3-merkle-schnorr-v1"
    }
  });

  for (const item of [sss2, sss3]) {
    item.item.transferHookInitSignature = await withRetry(`init hook ${item.item.preset}`, () =>
      item.created.stablecoin.initializeTransferHookMetaListOnChain(transferHookProgramId)
    );
  }

  const sss1Operator = await sdk.SolanaStablecoin.connect({
    connection,
    authority: delegatedOperator,
    programId: stablecoinProgramId,
    mint: sss1.created.stablecoin.getMintAddress()
  });
  const sss2Operator = await sdk.SolanaStablecoin.connect({
    connection,
    authority: delegatedOperator,
    programId: stablecoinProgramId,
    mint: sss2.created.stablecoin.getMintAddress()
  });

  sss1.item.extra.roleGrantSignatures = {};
  sss2.item.extra.roleGrantSignatures = {};

  sss1.item.extra.roleGrantSignatures.minter = await withRetry("grant sss1 minter", () =>
    sss1.created.stablecoin.updateRoleOnChain({
      holder: delegatedOperator.publicKey,
      role: "minter",
      isActive: true,
      mintQuota: 1_000_000n
    })
  );
  sss1.item.extra.roleGrantSignatures.burner = await withRetry("grant sss1 burner", () =>
    sss1.created.stablecoin.updateRoleOnChain({
      holder: delegatedOperator.publicKey,
      role: "burner",
      isActive: true,
      mintQuota: null
    })
  );
  sss2.item.extra.roleGrantSignatures.pauser = await withRetry("grant sss2 pauser", () =>
    sss2.created.stablecoin.updateRoleOnChain({
      holder: delegatedOperator.publicKey,
      role: "pauser",
      isActive: true,
      mintQuota: null
    })
  );
  sss2.item.extra.roleGrantSignatures.blacklister = await withRetry("grant sss2 blacklister", () =>
    sss2.created.stablecoin.updateRoleOnChain({
      holder: delegatedOperator.publicKey,
      role: "blacklister",
      isActive: true,
      mintQuota: null
    })
  );
  sss2.item.extra.roleGrantSignatures.seizer = await withRetry("grant sss2 seizer", () =>
    sss2.created.stablecoin.updateRoleOnChain({
      holder: delegatedOperator.publicKey,
      role: "seizer",
      isActive: true,
      mintQuota: null
    })
  );

  const sss1AuthorityAta = await withRetry("create sss1 authority ata", () =>
    getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      sss1.created.stablecoin.getMintAddress(),
      authority.publicKey,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  const sss1OperatorAta = await withRetry("create sss1 operator ata", () =>
    getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      sss1.created.stablecoin.getMintAddress(),
      delegatedOperator.publicKey,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );

  sss1.item.extra.accounts = {
    authorityAta: sss1AuthorityAta.address.toBase58(),
    operatorOwner: delegatedOperator.publicKey.toBase58(),
    operatorAta: sss1OperatorAta.address.toBase58()
  };

  sss1.item.extra.authorityMintSignature = await withRetry("mint sss1 authority balance", () =>
    sss1.created.stablecoin.mintOnChain({
      destination: sss1AuthorityAta.address,
      amount: 2_000_000n,
      minter: authority
    })
  );
  await assertAmount(connection, "sss1 authority ata after mint", sss1AuthorityAta.address, 2_000_000n);

  sss1.item.extra.authorityBurnSignature = await withRetry("burn sss1 authority balance", () =>
    sss1.created.stablecoin.burnOnChain({
      source: sss1AuthorityAta.address,
      amount: 500_000n,
      burner: authority
    })
  );
  await assertAmount(connection, "sss1 authority ata after burn", sss1AuthorityAta.address, 1_500_000n);

  sss1.item.extra.delegatedMintSignature = await withRetry("delegated mint sss1", async () =>
    sss1Operator.mintOnChain({
      destination: sss1OperatorAta.address,
      amount: 1_000_000n,
      minter: delegatedOperator
    })
  );
  await assertAmount(connection, "sss1 operator ata after delegated mint", sss1OperatorAta.address, 1_000_000n);

  await expectFailure("sss1 delegated mint over quota", async () =>
    sss1Operator.mintOnChain({
      destination: sss1OperatorAta.address,
      amount: 1n,
      minter: delegatedOperator
    })
  );
  sss1.item.extra.quotaExceededCheck = "expected-failure";

  sss1.item.extra.delegatedBurnSignature = await withRetry("delegated burn sss1", async () =>
    sss1Operator.burnOnChain({
      source: sss1OperatorAta.address,
      amount: 400_000n,
      burner: delegatedOperator
    })
  );
  await assertAmount(connection, "sss1 operator ata after delegated burn", sss1OperatorAta.address, 600_000n);

  const sss2SourceOwner = Keypair.generate();
  const sss2DestinationOwner = Keypair.generate();
  const sss2SourceAta = await withRetry("create sss2 source ata", () =>
    getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      sss2.created.stablecoin.getMintAddress(),
      sss2SourceOwner.publicKey,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  const sss2DestinationAta = await withRetry("create sss2 destination ata", () =>
    getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      sss2.created.stablecoin.getMintAddress(),
      sss2DestinationOwner.publicKey,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  const sss2TreasuryAta = await withRetry("create sss2 treasury ata", () =>
    getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      sss2.created.stablecoin.getMintAddress(),
      authority.publicKey,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );

  sss2.item.extra.accounts = {
    sourceOwner: sss2SourceOwner.publicKey.toBase58(),
    sourceAta: sss2SourceAta.address.toBase58(),
    destinationOwner: sss2DestinationOwner.publicKey.toBase58(),
    destinationAta: sss2DestinationAta.address.toBase58(),
    treasuryAta: sss2TreasuryAta.address.toBase58()
  };

  await assertState(connection, "sss2 source ata initial", sss2SourceAta.address, AccountState.Frozen);
  await assertState(connection, "sss2 destination ata initial", sss2DestinationAta.address, AccountState.Frozen);
  await assertState(connection, "sss2 treasury ata initial", sss2TreasuryAta.address, AccountState.Frozen);
  sss2.item.extra.defaultFrozenCheck = "verified";

  sss2.item.extra.delegatedPauseSignature = await withRetry("pause sss2", async () =>
    sss2Operator.pauseOnChain(true)
  );
  await expectFailure("sss2 mint while paused", () =>
    sss2.created.stablecoin.mintOnChain({
      destination: sss2SourceAta.address,
      amount: 1_000_000n,
      minter: authority
    })
  );
  sss2.item.extra.pauseBlocksMintCheck = "expected-failure";
  sss2.item.extra.delegatedUnpauseSignature = await withRetry("unpause sss2", async () =>
    sss2Operator.pauseOnChain(false)
  );

  for (const [label, address] of [
    ["sss2 source thaw", sss2SourceAta.address],
    ["sss2 destination thaw", sss2DestinationAta.address],
    ["sss2 treasury thaw", sss2TreasuryAta.address]
  ]) {
    sss2.item.extra[`${label.replaceAll(" ", "_")}Signature`] = await withRetry(label, async () =>
      sss2Operator.freezeOnChain(address, true)
    );
  }
  await assertState(connection, "sss2 source ata thawed", sss2SourceAta.address, AccountState.Initialized);
  await assertState(connection, "sss2 destination ata thawed", sss2DestinationAta.address, AccountState.Initialized);
  await assertState(connection, "sss2 treasury ata thawed", sss2TreasuryAta.address, AccountState.Initialized);

  sss2.item.extra.authorityMintSignature = await withRetry("mint sss2 source balance", () =>
    sss2.created.stablecoin.mintOnChain({
      destination: sss2SourceAta.address,
      amount: 2_000_000n,
      minter: authority
    })
  );
  await assertAmount(connection, "sss2 source after mint", sss2SourceAta.address, 2_000_000n);

  sss2.item.extra.delegatedFreezeSignature = await withRetry("freeze sss2 source", async () =>
    sss2Operator.freezeOnChain(sss2SourceAta.address, false)
  );
  await assertState(connection, "sss2 source ata frozen", sss2SourceAta.address, AccountState.Frozen);
  await expectFailure("sss2 transfer while frozen", () =>
    transferCheckedWithTransferHook(
      connection,
      authority,
      sss2SourceAta.address,
      sss2.created.stablecoin.getMintAddress(),
      sss2DestinationAta.address,
      sss2SourceOwner,
      100_000n,
      TOKEN_DECIMALS,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    )
  );
  sss2.item.extra.freezeBlocksTransferCheck = "expected-failure";

  sss2.item.extra.delegatedThawSignature = await withRetry("thaw sss2 source", async () =>
    sss2Operator.freezeOnChain(sss2SourceAta.address, true)
  );
  await assertState(connection, "sss2 source ata thawed after freeze", sss2SourceAta.address, AccountState.Initialized);

  sss2.item.extra.transferBeforeBlacklistSignature = await withRetry("transfer sss2 before blacklist", () =>
    transferCheckedWithTransferHook(
      connection,
      authority,
      sss2SourceAta.address,
      sss2.created.stablecoin.getMintAddress(),
      sss2DestinationAta.address,
      sss2SourceOwner,
      300_000n,
      TOKEN_DECIMALS,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    )
  );
  await assertAmount(connection, "sss2 source after first transfer", sss2SourceAta.address, 1_700_000n);
  await assertAmount(connection, "sss2 destination after first transfer", sss2DestinationAta.address, 300_000n);

  sss2.item.extra.delegatedBlacklistAddSignature = await withRetry("blacklist sss2 destination owner", async () =>
    sss2Operator.blacklistAddOnChain({
      address: sss2DestinationOwner.publicKey,
      reason: "devnet-e2e"
    })
  );
  await expectFailure("sss2 transfer to blacklisted destination", () =>
    transferCheckedWithTransferHook(
      connection,
      authority,
      sss2SourceAta.address,
      sss2.created.stablecoin.getMintAddress(),
      sss2DestinationAta.address,
      sss2SourceOwner,
      100_000n,
      TOKEN_DECIMALS,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    )
  );
  sss2.item.extra.blacklistBlocksTransferCheck = "expected-failure";

  sss2.item.extra.delegatedBlacklistRemoveSignature = await withRetry("remove sss2 blacklist", async () =>
    sss2Operator.blacklistRemoveOnChain(sss2DestinationOwner.publicKey)
  );
  sss2.item.extra.transferAfterBlacklistRemovalSignature = await withRetry("transfer sss2 after blacklist removal", () =>
    transferCheckedWithTransferHook(
      connection,
      authority,
      sss2SourceAta.address,
      sss2.created.stablecoin.getMintAddress(),
      sss2DestinationAta.address,
      sss2SourceOwner,
      100_000n,
      TOKEN_DECIMALS,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    )
  );
  await assertAmount(connection, "sss2 source after second transfer", sss2SourceAta.address, 1_600_000n);
  await assertAmount(connection, "sss2 destination after second transfer", sss2DestinationAta.address, 400_000n);

  sss2.item.extra.delegatedSeizeSignature = await withRetry("seize sss2 source", async () =>
    sss2Operator.seizeOnChain({
      fromAccount: sss2SourceAta.address,
      toAccount: sss2TreasuryAta.address,
      seizer: delegatedOperator
    })
  );
  await assertAmount(connection, "sss2 source after seize", sss2SourceAta.address, 0n);
  await assertAmount(connection, "sss2 treasury after seize", sss2TreasuryAta.address, 1_600_000n);

  const sss3Owner = Keypair.generate();
  const sss3SourceKeypair = Keypair.generate();
  const sss3DestinationKeypair = Keypair.generate();
  const sss3SourceAccount = await withRetry("create sss3 source token account", () =>
    createAccount(
      connection,
      authority,
      sss3.created.stablecoin.getMintAddress(),
      sss3Owner.publicKey,
      sss3SourceKeypair,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    )
  );
  const sss3DestinationAccount = await withRetry("create sss3 destination token account", () =>
    createAccount(
      connection,
      authority,
      sss3.created.stablecoin.getMintAddress(),
      sss3Owner.publicKey,
      sss3DestinationKeypair,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    )
  );

  sss3.item.extra.accounts = {
    owner: sss3Owner.publicKey.toBase58(),
    sourceAccount: sss3SourceAccount.toBase58(),
    destinationAccount: sss3DestinationAccount.toBase58(),
    tokenAccountSize: ACCOUNT_SIZE
  };

  await assertState(connection, "sss3 source initial", sss3SourceAccount, AccountState.Frozen);
  await assertState(connection, "sss3 destination initial", sss3DestinationAccount, AccountState.Frozen);
  sss3.item.extra.defaultFrozenCheck = "verified";

  sss3.item.extra.sourceThawSignature = await withRetry("thaw sss3 source", () =>
    sss3.created.stablecoin.freezeOnChain(sss3SourceAccount, true)
  );
  sss3.item.extra.destinationThawSignature = await withRetry("thaw sss3 destination", () =>
    sss3.created.stablecoin.freezeOnChain(sss3DestinationAccount, true)
  );
  await assertState(connection, "sss3 source thawed", sss3SourceAccount, AccountState.Initialized);
  await assertState(connection, "sss3 destination thawed", sss3DestinationAccount, AccountState.Initialized);

  sss3.item.extra.authorityMintSignature = await withRetry("mint sss3 source balance", () =>
    sss3.created.stablecoin.mintOnChain({
      destination: sss3SourceAccount,
      amount: 1_000_000n,
      minter: authority
    })
  );
  await assertAmount(connection, "sss3 source after mint", sss3SourceAccount, 1_000_000n);

  await expectFailure("sss3 transfer without proof", () =>
    transferCheckedWithTransferHook(
      connection,
      authority,
      sss3SourceAccount,
      sss3.created.stablecoin.getMintAddress(),
      sss3DestinationAccount,
      sss3Owner,
      100_000n,
      TOKEN_DECIMALS,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    )
  );
  sss3.item.extra.preProofTransferCheck = "expected-failure";

  const currentSlot = await withRetry("get current slot", () => connection.getSlot("confirmed"));
  const zkProof = generateZkProof(sss3Owner.publicKey, currentSlot + 500);
  sss3.item.extra.complianceRootUpdateSignature = await withRetry("update compliance root sss3", () =>
    sss3.created.stablecoin.updateComplianceRootOnChain(zkProof.compliance_root)
  );
  sss3.entry = await withRetry("refresh registry entry sss3", () => sss3.created.stablecoin.getRegistryEntry());
  sss3.item.configHash = sss3.entry.configHash;
  sss3.item.extra.proofSubmitSignature = await withRetry("submit proof receipt sss3", () =>
    sss3.created.stablecoin.submitProofReceiptOnChain({
      subject: sss3Owner.publicKey,
      commitment: hexToBytes(zkProof.commitment),
      proofCommitment: hexToBytes(zkProof.proof_commitment),
      response: hexToBytes(zkProof.response),
      merkleSiblings: [],
      merkleDirections: [],
      circuit: "sss3-merkle-schnorr-v1",
      expiresAtSlot: BigInt(zkProof.expires_at_slot)
    })
  );
  sss3.item.extra.transferWithProofSignature = await withRetry("transfer sss3 with proof", () =>
    transferCheckedWithTransferHook(
      connection,
      authority,
      sss3SourceAccount,
      sss3.created.stablecoin.getMintAddress(),
      sss3DestinationAccount,
      sss3Owner,
      100_000n,
      TOKEN_DECIMALS,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    )
  );
  await assertAmount(connection, "sss3 source after proof transfer", sss3SourceAccount, 900_000n);
  await assertAmount(connection, "sss3 destination after proof transfer", sss3DestinationAccount, 100_000n);

  sss3.item.extra.proofRevokeSignature = await withRetry("revoke proof receipt sss3", () =>
    sss3.created.stablecoin.revokeProofReceiptOnChain(sss3Owner.publicKey)
  );
  await expectFailure("sss3 transfer after proof revoke", () =>
    transferCheckedWithTransferHook(
      connection,
      authority,
      sss3SourceAccount,
      sss3.created.stablecoin.getMintAddress(),
      sss3DestinationAccount,
      sss3Owner,
      100_000n,
      TOKEN_DECIMALS,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    )
  );
  sss3.item.extra.postRevokeTransferCheck = "expected-failure";

  const existing110Release = await withRetry("fetch release sss/1.1.0", () =>
    connection.getAccountInfo(sdk.findRegistryReleasePda("sss/1.1.0", registryProgramId), "confirmed")
  );
  if (!existing110Release) {
    results.registry.release110Signature = await withRetry("register release sss/1.1.0", () =>
      sendSingleInstruction(
        connection,
        sdk.buildRegisterReleaseInstruction(
          {
            authority: authority.publicKey,
            standardVersion: "sss/1.1.0",
            preset: "sss-3",
            schemaHash: sss3.entry.configHash,
            notesUri: "https://example.com/sss/devnet/sss-1.1.0"
          },
          registryProgramId
        ),
        authority
      )
    );
  }

  async function registerStablecoin(key, stablecoin) {
    const entry = await withRetry(`registry entry refresh ${key}`, () =>
      stablecoin.created.stablecoin.getRegistryEntry()
    );
    results.stablecoins[key].configHash = entry.configHash;
    const signature = await withRetry(`register ${key}`, () =>
      sendSingleInstruction(
        connection,
        sdk.buildRegisterStablecoinInstruction(
          {
            stablecoinProgramId,
            entry
          },
          registryProgramId
        ),
        authority
      )
    );
    results.stablecoins[key].registrySignature = signature;
    const registrationPda = sdk.findStablecoinRegistrationPda(new PublicKey(entry.mint), registryProgramId);
    const registrationInfo = await withRetry(`verify registration ${key}`, () =>
      connection.getAccountInfo(registrationPda, "confirmed")
    );
    assert.ok(registrationInfo, `Missing registration PDA for ${key}`);
    results.stablecoins[key].registration = registrationPda.toBase58();
  }

  await registerStablecoin("sss1", sss1);
  await registerStablecoin("sss2", sss2);
  await registerStablecoin("sss3", sss3);

  await mkdir("artifacts", { recursive: true });
  await writeFile(ARTIFACT_PATH, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(results)}\n`);
}

main().catch((error) => {
  process.stderr.write(`devnet-e2e:failed:${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
