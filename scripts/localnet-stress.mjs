import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";

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
  getAccount,
  getMint,
  getOrCreateAssociatedTokenAccount,
  transferCheckedWithTransferHook
} = await import("@solana/spl-token");
const sdk = await import("../sdk/dist/index.js");

const ARTIFACT_PATH = "artifacts/localnet-stress-results.json";
const CONCURRENCY = Number(process.env.SSS_STRESS_CONCURRENCY ?? 6);
const ROUNDS = Number(process.env.SSS_STRESS_ROUNDS ?? 12);
const TOKEN_DECIMALS = 6;

const STABLECOIN_PROGRAM_ID = new PublicKey("Gm2SdmH1ydLKmPtjNE4W2ZLjW5kMvPrx784L7oUcw4w");
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey("E24UT9RMiw9zBh51ZMzXRdmoiLQ2PkVZ1sYhBKqazYy8");
const REGISTRY_PROGRAM_ID = new PublicKey("5vedffCtRhecm5sSXJCbgrwe7GYnGC9XK5vWLiMHLVXB");

const connection = new Connection("http://127.0.0.1:8899", "confirmed");

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

async function main() {
  const authority = await loadKeypair(".local-validator-authority.json");
  const operators = Array.from({ length: CONCURRENCY }, () => Keypair.generate());
  const owners = Array.from({ length: CONCURRENCY }, () => Keypair.generate());
  const start = Date.now();

  const results = {
    checkedAt: new Date().toISOString(),
    concurrency: CONCURRENCY,
    rounds: ROUNDS,
    totals: {
      successful: 0,
      failed: 0
    },
    phases: []
  };

  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  for (const recipient of [...operators, ...owners].map((item) => item.publicKey)) {
    const transaction = new Transaction({
      feePayer: authority.publicKey,
      recentBlockhash: latestBlockhash.blockhash
    }).add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: recipient,
        lamports: 1_000_000_000
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
    name: "Stress Minimal USD",
    symbol: "s1USD",
    decimals: TOKEN_DECIMALS,
    standardVersion: "sss/1.0.0"
  });
  const sss2 = await sdk.SolanaStablecoin.createOnChain({
    connection,
    authority,
    programId: STABLECOIN_PROGRAM_ID,
    preset: sdk.Presets.SSS_2,
    name: "Stress Hook USD",
    symbol: "s2USD",
    decimals: TOKEN_DECIMALS,
    standardVersion: "sss/1.0.0",
    transferHookProgramId: TRANSFER_HOOK_PROGRAM_ID
  });
  await sss2.stablecoin.initializeTransferHookMetaListOnChain(TRANSFER_HOOK_PROGRAM_ID);

  for (const operator of operators) {
    await sss1.stablecoin.updateRoleOnChain({
      holder: operator.publicKey,
      role: "minter",
      isActive: true,
      mintQuota: 50_000_000n
    });
    await sss1.stablecoin.updateRoleOnChain({
      holder: operator.publicKey,
      role: "burner",
      isActive: true,
      mintQuota: null
    });
  }

  const sss1Contexts = [];
  for (const operator of operators) {
    const stable = await sdk.SolanaStablecoin.connect({
      connection,
      authority: operator,
      programId: STABLECOIN_PROGRAM_ID,
      mint: sss1.stablecoin.getMintAddress()
    });
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      sss1.stablecoin.getMintAddress(),
      operator.publicKey,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    sss1Contexts.push({ operator, stable, ata });
  }

  const sss2Contexts = [];
  for (const owner of owners) {
    const sourceAta = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      sss2.stablecoin.getMintAddress(),
      owner.publicKey,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const destinationOwner = Keypair.generate();
    const fundTx = new Transaction({
      feePayer: authority.publicKey,
      recentBlockhash: (await connection.getLatestBlockhash("confirmed")).blockhash
    }).add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: destinationOwner.publicKey,
        lamports: 500_000_000
      })
    );
    await sendAndConfirmTransaction(connection, fundTx, [authority], { commitment: "confirmed" });
    const destinationAta = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      sss2.stablecoin.getMintAddress(),
      destinationOwner.publicKey,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    for (const address of [sourceAta.address, destinationAta.address]) {
      await sss2.stablecoin.freezeOnChain(address, true);
    }
    await sss2.stablecoin.mintOnChain({
      destination: sourceAta.address,
      amount: 1_000_000n,
      minter: authority
    });
    sss2Contexts.push({ owner, sourceAta, destinationAta });
  }

  async function runPhase(name, tasksFactory) {
    const phaseStart = Date.now();
    const settled = await Promise.allSettled(tasksFactory());
    const phase = {
      name,
      durationMs: Date.now() - phaseStart,
      successful: settled.filter((item) => item.status === "fulfilled").length,
      failed: settled.filter((item) => item.status === "rejected").length
    };
    results.totals.successful += phase.successful;
    results.totals.failed += phase.failed;
    results.phases.push(phase);
    if (phase.failed > 0) {
      const firstFailure = settled.find((item) => item.status === "rejected");
      throw new Error(`${name} failed: ${firstFailure.reason instanceof Error ? firstFailure.reason.message : String(firstFailure.reason)}`);
    }
  }

  for (let round = 0; round < ROUNDS; round += 1) {
    await runPhase(`mint-round-${round + 1}`, () =>
      sss1Contexts.map(({ operator, stable, ata }, index) =>
        stable.mintOnChain({
          destination: ata.address,
          amount: BigInt(5_000 + round * 100 + index),
          minter: operator
        })
      )
    );
  }

  for (let round = 0; round < ROUNDS; round += 1) {
    await runPhase(`burn-round-${round + 1}`, () =>
      sss1Contexts.map(({ operator, stable, ata }, index) =>
        stable.burnOnChain({
          source: ata.address,
          amount: BigInt(1_000 + round * 10 + index),
          burner: operator
        })
      )
    );
  }

  for (let round = 0; round < ROUNDS; round += 1) {
    await runPhase(`transfer-round-${round + 1}`, () =>
      sss2Contexts.map(({ owner, sourceAta, destinationAta }, index) =>
        transferCheckedWithTransferHook(
          connection,
          owner,
          sourceAta.address,
          sss2.stablecoin.getMintAddress(),
          destinationAta.address,
          owner,
          BigInt(100 + round + index),
          TOKEN_DECIMALS,
          [],
          { commitment: "confirmed" },
          TOKEN_2022_PROGRAM_ID
        )
      )
    );
  }

  const registryEntries = [];
  for (let index = 0; index < Math.max(4, Math.floor(CONCURRENCY / 2)); index += 1) {
    const created = await sdk.SolanaStablecoin.createOnChain({
      connection,
      authority,
      programId: STABLECOIN_PROGRAM_ID,
      preset: sdk.Presets.SSS_1,
      name: `Stress Registry ${index}`,
      symbol: `sr${index}`,
      decimals: TOKEN_DECIMALS,
      standardVersion: "sss/1.0.0"
    });
    registryEntries.push(await created.stablecoin.getRegistryEntry());
  }

  await runPhase("registry-register", () =>
    registryEntries.map((entry) =>
      sendSingleInstruction(
        sdk.buildRegisterStablecoinInstruction({
          stablecoinProgramId: STABLECOIN_PROGRAM_ID,
          entry
        }, REGISTRY_PROGRAM_ID),
        authority
      )
    )
  );

  const sss1MintInfo = await getMint(connection, sss1.stablecoin.getMintAddress(), "confirmed", TOKEN_2022_PROGRAM_ID);
  const operatorBalances = await Promise.all(
    sss1Contexts.map(({ ata }) => getAccount(connection, ata.address, "confirmed", TOKEN_2022_PROGRAM_ID))
  );
  const transferBalances = await Promise.all(
    sss2Contexts.map(({ destinationAta }) => getAccount(connection, destinationAta.address, "confirmed", TOKEN_2022_PROGRAM_ID))
  );

  results.durationMs = Date.now() - start;
  results.finalState = {
    sss1Supply: sss1MintInfo.supply.toString(),
    sss1OperatorBalances: operatorBalances.map((account) => account.amount.toString()),
    sss2DestinationBalances: transferBalances.map((account) => account.amount.toString()),
    registryRegistrations: registryEntries.length
  };

  assert.equal(results.totals.failed, 0, "stress run contained failures");

  await mkdir("artifacts", { recursive: true });
  await writeFile(ARTIFACT_PATH, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(results)}\n`);
}

main().catch((error) => {
  process.stderr.write(`localnet-stress:failed:${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
