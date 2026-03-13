import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { BN, Wallet } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedWithTransferHookInstruction,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
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

async function ensureAta(
  client: SSSClient,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = client.getAssociatedTokenAddress(mint, owner);
  const accountInfo = await client.connection.getAccountInfo(ata);

  if (!accountInfo) {
    const transaction = new Transaction().add(
      client.createAssociatedTokenAccountInstruction(
        client.provider.wallet.publicKey,
        mint,
        owner
      )
    );
    await client.provider.sendAndConfirm(transaction, []);
  }

  return ata;
}

async function main(): Promise<void> {
  const authority = loadKeypair();
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(authority);
  const client = new SSSClient(connection, wallet);
  const mint = Keypair.generate();
  const holder = Keypair.generate();
  const recipient = Keypair.generate();

  await client.initialize(
    buildInitializeParams(
      "Compliance Demo",
      "COMP",
      "https://example.com/sss/compliance-demo.json",
      6,
      StablecoinPreset.SSS2
    ),
    mint,
    client.hookProgramId
  );
  await client.initializeExtraAccountMetaList(mint.publicKey);
  await client.updateMinter(mint.publicKey, wallet.publicKey, {
    isActive: true,
    mintQuota: new BN(1_000_000_000),
  });

  const holderAta = await ensureAta(client, mint.publicKey, holder.publicKey);
  const recipientAta = await ensureAta(client, mint.publicKey, recipient.publicKey);

  await client.mintTokens(
    mint.publicKey,
    new BN(200_000_000),
    holderAta,
    holder.publicKey
  );
  const blacklistResult = await client.blacklistAdd(
    mint.publicKey,
    holder.publicKey,
    holderAta,
    { reason: "screening match" }
  );

  let blockedMessage: string | null = null;
  try {
    const transferIx = await createTransferCheckedWithTransferHookInstruction(
      connection,
      holderAta,
      mint.publicKey,
      recipientAta,
      holder.publicKey,
      BigInt(50_000_000),
      6,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    await client.provider.sendAndConfirm(new Transaction().add(transferIx), [holder]);
  } catch (error) {
    blockedMessage = error instanceof Error ? error.message : String(error);
  }

  if (!blockedMessage) {
    throw new Error("Expected the hook-enabled transfer to fail after blacklisting");
  }

  const removeResult = await client.blacklistRemove(
    mint.publicKey,
    holder.publicKey,
    holderAta
  );
  const [configPda] = client.getConfigPda(mint.publicKey);
  const blacklistEntry = await client.fetchBlacklistEntry(configPda, holder.publicKey);

  console.log(`Mint: ${mint.publicKey.toBase58()}`);
  console.log(`Holder: ${holder.publicKey.toBase58()}`);
  console.log(`Recipient: ${recipient.publicKey.toBase58()}`);
  console.log(`Blacklist signature: ${blacklistResult.signature}`);
  console.log(`Blocked transfer error: ${blockedMessage}`);
  console.log(`Remove signature: ${removeResult.signature}`);
  console.log(`Blacklist cleared: ${blacklistEntry === null}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
