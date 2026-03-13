import { readFile } from "node:fs/promises";

const { Connection, Keypair, PublicKey } = await import("@solana/web3.js");

async function loadKeypair(path) {
  const secret = Uint8Array.from(JSON.parse(await readFile(path, "utf8")));
  return Keypair.fromSecretKey(secret);
}

async function executableStatus(connection, value) {
  if (!value) {
    return { id: null, present: false, executable: false };
  }
  const id = new PublicKey(value);
  const account = await connection.getAccountInfo(id, "confirmed");
  return {
    id: id.toBase58(),
    present: Boolean(account),
    executable: Boolean(account?.executable)
  };
}

async function mintStatus(connection, stablecoinProgramId, mintValue) {
  if (!mintValue || !stablecoinProgramId) {
    return {
      mint: mintValue ?? null,
      config: null,
      mintPresent: false,
      configPresent: false
    };
  }

  const mint = new PublicKey(mintValue);
  const programId = new PublicKey(stablecoinProgramId);
  const config = PublicKey.findProgramAddressSync(
    [Buffer.from("stablecoin_config"), mint.toBuffer()],
    programId
  )[0];
  const [mintInfo, configInfo] = await Promise.all([
    connection.getAccountInfo(mint, "confirmed"),
    connection.getAccountInfo(config, "confirmed")
  ]);
  return {
    mint: mint.toBase58(),
    config: config.toBase58(),
    mintPresent: Boolean(mintInfo),
    configPresent: Boolean(configInfo)
  };
}

async function main() {
  const rpcUrl = process.env.SSS_RPC_URL ?? "https://api.devnet.solana.com";
  const keypairPath = process.env.SSS_KEYPAIR;
  if (!keypairPath) {
    throw new Error("MissingEnv:SSS_KEYPAIR");
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const authority = await loadKeypair(keypairPath);
  const stablecoinProgramId = process.env.SSS_STABLECOIN_PROGRAM_ID ?? null;
  const registryProgramId = process.env.SSS_REGISTRY_PROGRAM_ID ?? null;
  const registryConfig = registryProgramId
    ? PublicKey.findProgramAddressSync(
        [Buffer.from("sss_registry_config")],
        new PublicKey(registryProgramId)
      )[0].toBase58()
    : null;

  const [balanceLamports, latestBlockhash, stablecoinProgram, transferHookProgram, registryProgram, registryConfigInfo, sss1, sss2, sss3] =
    await Promise.all([
      connection.getBalance(authority.publicKey, "confirmed"),
      connection.getLatestBlockhash("confirmed"),
      executableStatus(connection, stablecoinProgramId),
      executableStatus(connection, process.env.SSS_TRANSFER_HOOK_PROGRAM_ID ?? null),
      executableStatus(connection, registryProgramId),
      registryConfig
        ? connection.getAccountInfo(new PublicKey(registryConfig), "confirmed")
        : Promise.resolve(null),
      mintStatus(connection, stablecoinProgramId, process.env.SSS1_MINT ?? null),
      mintStatus(connection, stablecoinProgramId, process.env.SSS2_MINT ?? null),
      mintStatus(connection, stablecoinProgramId, process.env.SSS3_MINT ?? null)
    ]);

  const result = {
    checkedAt: new Date().toISOString(),
    rpcUrl,
    authority: authority.publicKey.toBase58(),
    balanceLamports,
    latestBlockhash: latestBlockhash.blockhash,
    programs: {
      stablecoin: stablecoinProgram,
      transferHook: transferHookProgram,
      registry: registryProgram
    },
    registry: {
      config: registryConfig,
      present: Boolean(registryConfigInfo)
    },
    mints: {
      sss1,
      sss2,
      sss3
    }
  };

  const failures = [
    !stablecoinProgram.present || !stablecoinProgram.executable,
    !transferHookProgram.present || !transferHookProgram.executable,
    !registryProgram.present || !registryProgram.executable,
    registryProgramId ? !registryConfigInfo : false
  ].some(Boolean);

  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (failures) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
