import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import {
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
  const mint = Keypair.generate();

  const params = buildInitializeParams(
    "Devnet Dollar",
    "DUSD",
    "https://example.com/sss/devnet-dollar.json",
    6,
    StablecoinPreset.SSS2
  );

  const { signature: initializeSignature } = await client.initialize(
    params,
    mint,
    client.hookProgramId
  );
  const { signature: hookSignature } = await client.initializeExtraAccountMetaList(
    mint.publicKey
  );

  console.log(`Authority: ${authority.publicKey.toBase58()}`);
  console.log(`Mint: ${mint.publicKey.toBase58()}`);
  console.log(`Initialize: ${initializeSignature}`);
  console.log(`Hook meta list: ${hookSignature}`);
  console.log(
    `Explorer: https://explorer.solana.com/address/${mint.publicKey.toBase58()}?cluster=devnet`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
