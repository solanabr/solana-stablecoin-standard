import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";
import {
  deriveBlacklistPda,
  deriveConfigPda,
  deriveExtraAccountMetaListPda,
  deriveRoleRegistryPda,
  ixAddToBlacklist,
  ixFreeze,
  ixInitialize,
  ixInitializeExtraAccountMetaList,
  ixMint,
  ixSeize,
  ixUpdateMinterAdd,
  ixUpdateRoleAdd,
  loadProvider,
  sendInstructions,
  SSS_STABLECOIN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "./demo-utils";

async function main(): Promise<void> {
  const { provider, walletKeypair } = loadProvider();
  const authority = provider.wallet.publicKey;

  console.log("=== SSS-2 Demo: Compliant Stablecoin ===\n");

  const mint = Keypair.generate();
  const recipient = Keypair.generate();
  const uniqueSuffix = `${Date.now().toString().slice(-5)}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
  const symbol = `R${uniqueSuffix}`;
  const [configPda] = deriveConfigPda(authority, symbol);
  const [roleRegistryPda] = deriveRoleRegistryPda(configPda);
  const [senderBlacklistPda] = deriveBlacklistPda(configPda, authority);
  const [recipientBlacklistPda] = deriveBlacklistPda(configPda, recipient.publicKey);
  const [extraAccountMetaListPda] = deriveExtraAccountMetaListPda(mint.publicKey);

  const authorityAta = getAssociatedTokenAddressSync(mint.publicKey, authority, false, TOKEN_2022_PROGRAM_ID);
  const recipientAta = getAssociatedTokenAddressSync(mint.publicKey, recipient.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const treasuryAta = getAssociatedTokenAddressSync(mint.publicKey, authority, false, TOKEN_2022_PROGRAM_ID);

  console.log(`1. Initializing SSS-2 'RegulatedUSD' (${symbol})...`);
  const initTx = await sendInstructions(provider.connection, walletKeypair, [
    ixInitialize({
      config: configPda,
      roleRegistry: roleRegistryPda,
      mint: mint.publicKey,
      authority,
      name: "RegulatedUSD",
      symbol,
      decimals: 6,
      enablePermanentDelegate: true,
      enableTransferHook: true,
      defaultAccountFrozen: false,
      enablePrivacy: false,
    }),
  ], [mint]);
  console.log("   TX:", initTx);

  console.log("\n1b. Initializing transfer hook extra account meta list...");
  const initExtraAccountMetaListTx = await sendInstructions(provider.connection, walletKeypair, [
    ixInitializeExtraAccountMetaList({
      extraAccountMetaList: extraAccountMetaListPda,
      mint: mint.publicKey,
      payer: authority,
    }),
  ]);
  console.log("   TX:", initExtraAccountMetaListTx);

  console.log("\n2. Minting 500,000 RUSD...");
  const ataTx = await sendInstructions(provider.connection, walletKeypair, [
    createAssociatedTokenAccountIdempotentInstruction(
      authority,
      authorityAta,
      authority,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      authority,
      recipientAta,
      recipient.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
    ),
  ]);
  const minterTx = await sendInstructions(provider.connection, walletKeypair, [
    ixUpdateMinterAdd({
      config: configPda,
      roleRegistry: roleRegistryPda,
      authority,
      address: authority,
      quota: 2_000_000n * 1_000_000n,
    }),
  ]);
  const mintTx = await sendInstructions(provider.connection, walletKeypair, [
    ixMint({
      config: configPda,
      roleRegistry: roleRegistryPda,
      mint: mint.publicKey,
      recipientAta: authorityAta,
      minter: authority,
      amount: 500_000n * 1_000_000n,
    }),
  ]);
  console.log("   ATA TX:", ataTx);
  console.log("   Role TX:", minterTx);
  console.log("   Mint TX:", mintTx);

  console.log("\n3. Transfer 10,000 RUSD to recipient — should succeed...");
  const transferOkIx = await createTransferCheckedWithTransferHookInstruction(
    provider.connection,
    authorityAta,
    mint.publicKey,
    recipientAta,
    authority,
    10_000n * 1_000_000n,
    6,
    [],
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );
  const transferOkTx = await sendInstructions(provider.connection, walletKeypair, [transferOkIx]);
  console.log("   TX:", transferOkTx);

  console.log("\n4. Blacklisting recipient — re: 'OFAC match'...");
  const blacklisterRoleTx = await sendInstructions(provider.connection, walletKeypair, [
    ixUpdateRoleAdd({
      config: configPda,
      roleRegistry: roleRegistryPda,
      authority,
      roleType: 2,
      address: authority,
    }),
    ixUpdateRoleAdd({
      config: configPda,
      roleRegistry: roleRegistryPda,
      authority,
      roleType: 3,
      address: authority,
    }),
  ]);
  const blacklistTx = await sendInstructions(provider.connection, walletKeypair, [
    ixAddToBlacklist({
      config: configPda,
      roleRegistry: roleRegistryPda,
      blacklistEntry: recipientBlacklistPda,
      blacklister: authority,
      address: recipient.publicKey,
      reason: "OFAC match",
    }),
  ]);
  console.log("   Role TX:", blacklisterRoleTx);
  console.log("   Blacklist TX:", blacklistTx);

  console.log("\n5. Attempting transfer to blacklisted address — expected to fail...");
  let transferFailed = false;
  try {
    const transferBlockedIx = await createTransferCheckedWithTransferHookInstruction(
      provider.connection,
      authorityAta,
      mint.publicKey,
      recipientAta,
      authority,
      1_000n * 1_000_000n,
      6,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );
    const tx = await sendInstructions(provider.connection, walletKeypair, [transferBlockedIx]);
    console.log("   Transfer TX:", tx);
  } catch (error) {
    transferFailed = true;
    console.log("   Transfer blocked as expected.");
  }
  if (!transferFailed) {
    console.log("   ERROR: Transfer should have been blocked by the hook!");
  }

  console.log("\n6. Freezing blacklisted account...");
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

  console.log("\n7. Seizing tokens from frozen account to treasury...");
  try {
    const seizeTx = await sendInstructions(provider.connection, walletKeypair, [
      ixSeize({
        config: configPda,
        roleRegistry: roleRegistryPda,
        mint: mint.publicKey,
        targetAta: recipientAta,
        treasuryAta,
        transferHookProgram: SSS_TRANSFER_HOOK_PROGRAM_ID,
        extraAccountMetaList: extraAccountMetaListPda,
        stablecoinProgram: SSS_STABLECOIN_PROGRAM_ID,
        senderBlacklist: senderBlacklistPda,
        receiverBlacklist: recipientBlacklistPda,
        seizer: authority,
      }),
    ]);
    console.log("   TX:", seizeTx);
  } catch (error) {
    console.log("   Seize failed:", error instanceof Error ? error.message : String(error));
  }

  console.log("\n8. Final balance check...");
  const authorityBal = await getAccount(provider.connection, authorityAta, "confirmed", TOKEN_2022_PROGRAM_ID);
  const recipientBal = await getAccount(provider.connection, recipientAta, "confirmed", TOKEN_2022_PROGRAM_ID);
  console.log("   Authority ATA:", authorityBal.amount.toString());
  console.log("   Recipient ATA:", recipientBal.amount.toString());

  console.log("\n=== SSS-2 Demo Complete ===");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
