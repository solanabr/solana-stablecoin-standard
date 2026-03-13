import { readFile } from "node:fs/promises";

const { Connection, Keypair, PublicKey } = await import("@solana/web3.js");

async function loadKeypair(path) {
  const secret = Uint8Array.from(JSON.parse(await readFile(path, "utf8")));
  return Keypair.fromSecretKey(secret);
}

async function main() {
  const rpcUrl = process.env.SSS_RPC_URL ?? "https://api.devnet.solana.com";
  const keypairPath = process.env.SSS_KEYPAIR;
  if (!keypairPath) {
    throw new Error("MissingEnv:SSS_KEYPAIR");
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const authority = await loadKeypair(keypairPath);
  const balanceLamports = await connection.getBalance(authority.publicKey, "confirmed");
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");

  const stablecoinProgramId = process.env.SSS_STABLECOIN_PROGRAM_ID ?? null;
  const transferHookProgramId = process.env.SSS_TRANSFER_HOOK_PROGRAM_ID ?? null;
  const registryProgramId = process.env.SSS_REGISTRY_PROGRAM_ID ?? null;

  for (const candidate of [stablecoinProgramId, transferHookProgramId, registryProgramId]) {
    if (candidate) {
      new PublicKey(candidate);
    }
  }

  process.stdout.write(`${JSON.stringify({
    rpcUrl,
    authority: authority.publicKey.toBase58(),
    balanceLamports,
    balanceSol: balanceLamports / 1_000_000_000,
    latestBlockhash: latestBlockhash.blockhash,
    stablecoinProgramId,
    transferHookProgramId,
    registryProgramId
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
