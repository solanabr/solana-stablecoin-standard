import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { BN, Wallet } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID, getAccount } from "@solana/spl-token";
import { Connection, Keypair, Transaction } from "@solana/web3.js";
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

  await client.initialize(
    buildInitializeParams(
      "Mint Burn Demo",
      "MBD",
      "https://example.com/sss/mint-burn.json",
      6,
      StablecoinPreset.SSS1
    ),
    mint
  );

  await client.updateMinter(mint.publicKey, wallet.publicKey, {
    isActive: true,
    mintQuota: new BN(1_000_000_000),
  });

  const recipientAta = client.getAssociatedTokenAddress(
    mint.publicKey,
    wallet.publicKey
  );
  const recipientAccountInfo = await client.connection.getAccountInfo(recipientAta);
  if (!recipientAccountInfo) {
    const transaction = new Transaction().add(
      client.createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        mint.publicKey,
        wallet.publicKey
      )
    );
    await client.provider.sendAndConfirm(transaction, []);
  }

  const mintResult = await client.mintTokens(
    mint.publicKey,
    new BN(250_000_000),
    recipientAta
  );
  const burnResult = await client.burnTokens(
    mint.publicKey,
    new BN(50_000_000),
    recipientAta
  );

  const balance = await getAccount(
    connection,
    recipientAta,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  const totals = await client.getTotalSupply(mint.publicKey);

  console.log(`Mint: ${mint.publicKey.toBase58()}`);
  console.log(`Recipient: ${wallet.publicKey.toBase58()}`);
  console.log(`Recipient ATA: ${recipientAta.toBase58()}`);
  console.log(`Mint signature: ${mintResult.signature}`);
  console.log(`Burn signature: ${burnResult.signature}`);
  console.log(`Account balance: ${balance.amount.toString()}`);
  console.log(`Current supply: ${totals.currentSupply.toString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
