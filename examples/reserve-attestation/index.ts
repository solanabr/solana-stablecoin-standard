import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { BN, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import {
  OracleModule,
  SSSClient,
  StablecoinPreset,
  buildInitializeParams,
} from "solana-stablecoin-standard";

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ?? path.join(os.homedir(), ".config/solana/id.json");

function resolveHome(filePath: string): string {
  return filePath.startsWith("~")
    ? path.join(os.homedir(), filePath.slice(1))
    : path.resolve(filePath);
}

function loadKeypair(): Keypair {
  const secretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(resolveHome(KEYPAIR_PATH), "utf8"))
  );
  return Keypair.fromSecretKey(secretKey);
}

async function main(): Promise<void> {
  const authority = loadKeypair();
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(authority);
  const client = new SSSClient(connection, wallet);
  const oracle = new OracleModule(connection);
  const mint = Keypair.generate();

  await client.initialize(
    buildInitializeParams(
      "Reserve Demo",
      "RSV",
      "https://example.com/sss/reserve-demo.json",
      6,
      StablecoinPreset.SSS1
    ),
    mint
  );

  const reserveReport = {
    asOf: new Date().toISOString(),
    auditor: "Example Audit LLP",
    reservesUsd: 20_000_000,
    liabilitiesTokens: 1_000,
    assets: [
      { name: "US Treasury Bills", amountUsd: 15_000_000 },
      { name: "Cash", amountUsd: 5_000_000 },
    ],
  };
  const reserveHash = oracle.computeReserveHash(JSON.stringify(reserveReport));

  const attestResult = await client.attestReserve(mint.publicKey, {
    reserveHash,
    totalReservesUsd: new BN(2_000_000_000),
    totalOutstanding: new BN(1_000_000_000),
    attestationUri: "https://example.com/audits/devnet-reserve-demo.json",
  });

  const config = await client.fetchConfig(mint.publicKey);
  const [configPda] = client.getConfigPda(mint.publicKey);
  const attestation = await client.fetchReserveAttestation(
    configPda,
    config.reserveAttestationIndex.subn(1)
  );

  console.log(`Mint: ${mint.publicKey.toBase58()}`);
  console.log(`Attestation signature: ${attestResult.signature}`);
  console.log(`Attestation index: ${attestation.index.toString()}`);
  console.log(`Reserve hash: ${Buffer.from(attestation.reserveHash).toString("hex")}`);
  console.log(`Attestation URI: ${attestation.attestationUri}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
