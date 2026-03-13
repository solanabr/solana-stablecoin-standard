/**
 * Custom Stablecoin Config Example
 *
 * Demonstrates how to create a stablecoin with specific extensions
 * and parameters beyond the SSS-1/SSS-2 presets.
 *
 * Customizations shown:
 * - Permanent delegate only (no transfer hook) - for seize without blacklist
 * - Supply cap - hard ceiling on total supply
 * - Custom decimals, name, symbol
 * - Transfer hook + permanent delegate - full SSS-2 style
 *
 * Run: npx ts-node -p tsconfig.json examples/custom-config.ts
 * Requires: anchor build, ANCHOR_PROVIDER_URL, ANCHOR_WALLET
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializePermanentDelegateInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  ExtensionType,
} from "@solana/spl-token";

const STABLECOIN_SEED = Buffer.from("stablecoin");
const ROLES_SEED = Buffer.from("roles");
const MINTER_SEED = Buffer.from("minter");

/** Options for custom stablecoin creation */
interface CustomStablecoinConfig {
  name: string;
  symbol: string;
  decimals: number;
  uri?: string;
  supplyCap: number; // 0 = unlimited
  /** Enable permanent delegate (for seize capability) */
  enablePermanentDelegate: boolean;
  /** Enable transfer hook (for blacklist enforcement; requires extra setup) */
  enableTransferHook: boolean;
  /** New accounts start frozen (compliance-heavy) */
  defaultAccountFrozen: boolean;
}

async function main() {
  console.log("=== Custom Stablecoin Config Example ===\n");

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SssToken as Program;
  const authority = (provider.wallet as anchor.Wallet).payer;

  // Example 1: DAO treasury token - permanent delegate only, supply cap
  const daoConfig: CustomStablecoinConfig = {
    name: "DAO Treasury Token",
    symbol: "DAOT",
    decimals: 6,
    uri: "https://example.com/dao-token.json",
    supplyCap: 10_000_000_000_000, // 10M tokens (6 decimals)
    enablePermanentDelegate: true, // Can seize if needed
    enableTransferHook: false, // No blacklist for internal use
    defaultAccountFrozen: false,
  };

  console.log("Creating custom stablecoin:", daoConfig.name);

  const mintKeypair = Keypair.generate();
  const extensions: ExtensionType[] = [];
  if (daoConfig.enablePermanentDelegate) {
    extensions.push(ExtensionType.PermanentDelegate);
  }
  if (daoConfig.enableTransferHook) {
    extensions.push(ExtensionType.TransferHook);
  }

  const [configPDA] = PublicKey.findProgramAddressSync(
    [STABLECOIN_SEED, mintKeypair.publicKey.toBuffer()],
    program.programId
  );

  const mintLen = getMintLen(extensions);
  const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

  const tx = new Transaction();
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  );

  if (daoConfig.enablePermanentDelegate) {
    tx.add(
      createInitializePermanentDelegateInstruction(
        mintKeypair.publicKey,
        configPDA,
        TOKEN_2022_PROGRAM_ID
      )
    );
  }

  tx.add(
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      daoConfig.decimals,
      configPDA,
      configPDA,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await provider.sendAndConfirm(tx, [authority, mintKeypair]);

  const [authorityRoles] = PublicKey.findProgramAddressSync(
    [ROLES_SEED, configPDA.toBuffer(), authority.publicKey.toBuffer()],
    program.programId
  );

  await program.methods
    .initialize({
      name: daoConfig.name,
      symbol: daoConfig.symbol,
      uri: daoConfig.uri ?? "",
      decimals: daoConfig.decimals,
      supplyCap: new anchor.BN(daoConfig.supplyCap),
      enablePermanentDelegate: daoConfig.enablePermanentDelegate,
      enableTransferHook: daoConfig.enableTransferHook,
      defaultAccountFrozen: daoConfig.defaultAccountFrozen,
    })
    .accounts({
      authority: authority.publicKey,
      stablecoinConfig: configPDA,
      mint: mintKeypair.publicKey,
      authorityRoles,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  const config = await program.account.stablecoinConfig.fetch(configPDA);
  console.log("Stablecoin created:");
  console.log("  Mint:", mintKeypair.publicKey.toBase58());
  console.log("  Name:", config.name);
  console.log("  Symbol:", config.symbol);
  console.log("  Decimals:", config.decimals);
  console.log("  Supply cap:", config.supplyCap.toString());
  console.log("  Permanent delegate:", config.enablePermanentDelegate);
  console.log("  Transfer hook:", config.enableTransferHook);

  // Optionally: set a different supply cap later via update_supply_cap
  // Optionally: add minter and mint (subject to supply cap)
  console.log("\n=== Custom config example complete ===");
}

main().catch(console.error);
