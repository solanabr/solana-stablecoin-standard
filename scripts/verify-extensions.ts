import * as anchor from "@coral-xyz/anchor";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { readFileSync } from "fs";
import * as borsh from "@coral-xyz/borsh";
import { createHash } from "crypto";

const STABLECOIN_PROGRAM_ID = new PublicKey(
  process.env.SSS_STABLECOIN_PROGRAM_ID ?? "AmBgA4sV1xFrT4BwbqUU3P3cFqLa6yNJmHyX98k4eW1j",
);
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  process.env.SSS_TRANSFER_HOOK_PROGRAM_ID ?? "FiUMBoLyzCzgXQwysxY7ypo4DcZ21Svd2qScsfdtsrj",
);

const initializeLayout = borsh.struct([
  borsh.str("name"),
  borsh.str("symbol"),
  borsh.u8("decimals"),
  borsh.bool("enablePermanentDelegate"),
  borsh.bool("enableTransferHook"),
  borsh.bool("defaultAccountFrozen"),
  borsh.bool("enablePrivacy"),
]);

function initializeDiscriminator(): Buffer {
  return createHash("sha256").update("global:initialize").digest().subarray(0, 8);
}

async function main(): Promise<void> {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const walletPath = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  const secret = JSON.parse(readFileSync(walletPath, "utf-8")) as number[];
  const wallet = new anchor.Wallet(Keypair.fromSecretKey(Uint8Array.from(secret)));
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const mint = Keypair.generate();
  const uniqueSuffix = `${Date.now().toString().slice(-5)}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
  const symbol = `R${uniqueSuffix}`;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("stablecoin"), provider.wallet.publicKey.toBuffer(), Buffer.from(symbol)],
    STABLECOIN_PROGRAM_ID,
  );
  const [roleRegistryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("role_registry"), configPda.toBuffer()],
    STABLECOIN_PROGRAM_ID,
  );

  const dataBuffer = Buffer.alloc(1000);
  const encodedSize = initializeLayout.encode(
    {
      name: "RegulatedUSD",
      symbol,
      decimals: 6,
      enablePermanentDelegate: true,
      enableTransferHook: true,
      defaultAccountFrozen: false,
      enablePrivacy: false,
    },
    dataBuffer,
  );
  const instructionData = Buffer.concat([
    initializeDiscriminator(),
    dataBuffer.subarray(0, encodedSize),
  ]);

  const ix = new TransactionInstruction({
    programId: STABLECOIN_PROGRAM_ID,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: roleRegistryPda, isSigner: false, isWritable: true },
      { pubkey: mint.publicKey, isSigner: true, isWritable: true },
      { pubkey: provider.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: TRANSFER_HOOK_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: instructionData,
  });

  console.log("Initializing SSS-2 stablecoin on devnet...");
  const tx = await provider.sendAndConfirm(new Transaction().add(ix), [mint], {
    commitment: "confirmed",
  });

  console.log("Init tx:", tx);
  console.log("Mint:", mint.publicKey.toBase58());

  const mintInfo = await getMint(connection, mint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID);
  console.log("Mint decimals:", mintInfo.decimals);
  console.log("Mint supply:", mintInfo.supply.toString());

  const mintAccountInfo = await connection.getAccountInfo(mint.publicKey, "confirmed");
  if (!mintAccountInfo) {
    throw new Error("Mint account not found after initialization");
  }

  console.log("Mint account data length:", mintAccountInfo.data.length);
  if (mintAccountInfo.data.length > 170) {
    console.log("Extensions check: PASS (account larger than base Token-2022 mint)");
  } else {
    console.log("Extensions check: FAIL (account size too small for expected extensions)");
  }

  console.log("\nAdd to docs/DEVNET.md:");
  console.log(`| SSS-2 Init (extension verification) | \`${tx}\` |`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
