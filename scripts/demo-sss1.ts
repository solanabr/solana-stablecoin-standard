import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";
import {
  deriveConfigPda,
  deriveRoleRegistryPda,
  ixFreeze,
  ixInitialize,
  ixMint,
  ixPause,
  ixThaw,
  ixUnpause,
  ixUpdateMinterAdd,
  loadProvider,
  sendInstructions,
} from "./demo-utils";

async function main(): Promise<void> {
  const { provider, walletKeypair } = loadProvider();
  const authority = provider.wallet.publicKey;

  console.log("=== SSS-1 Demo: Minimal Stablecoin ===\n");

  const mint = Keypair.generate();
  const recipient = Keypair.generate();
  const uniqueSuffix = `${Date.now().toString().slice(-5)}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
  const symbol = `D${uniqueSuffix}`;
  const [configPda] = deriveConfigPda(authority, symbol);
  const [roleRegistryPda] = deriveRoleRegistryPda(configPda);

  const recipientAta = getAssociatedTokenAddressSync(mint.publicKey, recipient.publicKey, false, TOKEN_2022_PROGRAM_ID);

  console.log(`1. Initializing SSS-1 'DemoUSD' (${symbol})...`);
  const initTx = await sendInstructions(provider.connection, walletKeypair, [
    ixInitialize({
      config: configPda,
      roleRegistry: roleRegistryPda,
      mint: mint.publicKey,
      authority,
      name: "DemoUSD",
      symbol,
      decimals: 6,
      enablePermanentDelegate: false,
      enableTransferHook: false,
      defaultAccountFrozen: false,
      enablePrivacy: false,
    }),
  ], [mint]);
  console.log("   TX:", initTx);

  console.log("\n2. Adding minter with 1,000,000 quota...");
  const minterTx = await sendInstructions(provider.connection, walletKeypair, [
    ixUpdateMinterAdd({
      config: configPda,
      roleRegistry: roleRegistryPda,
      authority,
      address: authority,
      quota: 1_000_000n * 1_000_000n,
    }),
  ]);
  console.log("   TX:", minterTx);

  console.log("\n3. Minting 100,000 DUSD...");
  const createAtaTx = await sendInstructions(provider.connection, walletKeypair, [
    createAssociatedTokenAccountIdempotentInstruction(
      authority,
      recipientAta,
      recipient.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
  ]);
  const mintTx = await sendInstructions(provider.connection, walletKeypair, [
    ixMint({
      config: configPda,
      roleRegistry: roleRegistryPda,
      mint: mint.publicKey,
      recipientAta,
      minter: authority,
      amount: 100_000n * 1_000_000n,
    }),
  ]);
  console.log("   ATA TX:", createAtaTx);
  console.log("   Mint TX:", mintTx);

  console.log("\n4. Checking total supply...");
  const mintInfo = await getMint(provider.connection, mint.publicKey, "confirmed", TOKEN_2022_PROGRAM_ID);
  console.log("   Total minted:", mintInfo.supply.toString());

  console.log("\n5. Freezing recipient account...");
  const freezeTx = await sendInstructions(provider.connection, walletKeypair, [
    ixFreeze({
      config: configPda,
      roleRegistry: roleRegistryPda,
      mint: mint.publicKey,
      targetAta: recipientAta,
      authority,
    }),
  ]);
  console.log("   TX:", freezeTx);

  console.log("\n6. Thawing recipient account...");
  const thawTx = await sendInstructions(provider.connection, walletKeypair, [
    ixThaw({
      config: configPda,
      roleRegistry: roleRegistryPda,
      mint: mint.publicKey,
      targetAta: recipientAta,
      authority,
    }),
  ]);
  console.log("   TX:", thawTx);

  console.log("\n7. Pausing stablecoin...");
  const pauseTx = await sendInstructions(provider.connection, walletKeypair, [
    ixPause(configPda, roleRegistryPda, authority),
  ]);
  console.log("   TX:", pauseTx);

  console.log("\n8. Unpausing stablecoin...");
  const unpauseTx = await sendInstructions(provider.connection, walletKeypair, [
    ixUnpause(configPda, roleRegistryPda, authority),
  ]);
  console.log("   TX:", unpauseTx);

  console.log("\n=== SSS-1 Demo Complete ===");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
