import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import {
  findConfigPda,
  findRolePda,
  findHookConfigPda,
  findBlacklistEntryPda,
  findExtraAccountMetaListPda,
} from "@sss/sdk";
export const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

export const coreProgram = anchor.workspace.SssCore as Program;
export const hookProgram = anchor.workspace.SssTransferHook as Program;
export const admin = provider.wallet;

export async function createSSS1Mint(
  name = "Test USD",
  symbol = "TUSD",
  decimals = 6
) {
  const mintKeypair = Keypair.generate();
  const [configPda] = findConfigPda(mintKeypair.publicKey);

  await coreProgram.methods
    .createMint({
      name,
      symbol,
      uri: "",
      decimals,
      preset: 0,
      transferHookProgram: null,
      treasury: null,
    })
    .accounts({
      admin: admin.publicKey,
      mint: mintKeypair.publicKey,
      config: configPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([mintKeypair])
    .rpc();

  return { mintKeypair, configPda };
}

export async function createSSS2Mint(
  treasury: PublicKey,
  name = "Regulated USD",
  symbol = "RUSD",
  decimals = 6
) {
  const mintKeypair = Keypair.generate();
  const [configPda] = findConfigPda(mintKeypair.publicKey);

  await coreProgram.methods
    .createMint({
      name,
      symbol,
      uri: "",
      decimals,
      preset: 1,
      transferHookProgram: hookProgram.programId,
      treasury,
    })
    .accounts({
      admin: admin.publicKey,
      mint: mintKeypair.publicKey,
      config: configPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([mintKeypair])
    .rpc();

  return { mintKeypair, configPda };
}

export async function grantRole(
  configPda: PublicKey,
  holder: PublicKey,
  role: number,
  allowance: number = 0
) {
  const roleNames: Record<number, any> = {
    0: { minter: {} },
    1: { burner: {} },
    2: { seizer: {} },
    3: { pauser: {} },
    4: { complianceOfficer: {} },
  };
  const [roleAccount] = findRolePda(configPda, holder, role);

  await coreProgram.methods
    .grantRole(roleNames[role], new BN(allowance))
    .accounts({
      admin: admin.publicKey,
      config: configPda,
      holder,
      roleAccount,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return roleAccount;
}

export async function createTokenAccount(
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  // Check if ATA already exists (idempotent)
  const existing = await provider.connection.getAccountInfo(ata);
  if (existing) {
    return ata;
  }

  const ix = createAssociatedTokenAccountInstruction(
    admin.publicKey,
    ata,
    owner,
    mint,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const tx = new anchor.web3.Transaction().add(ix);
  await provider.sendAndConfirm(tx);
  return ata;
}

export async function airdropSol(to: PublicKey, amount: number = 2) {
  const sig = await provider.connection.requestAirdrop(
    to,
    amount * anchor.web3.LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(sig);
}

export async function initializeHook(
  mintPubkey: PublicKey,
  configPda: PublicKey
) {
  const [hookConfig] = findHookConfigPda(mintPubkey);
  const [extraAccountMetaList] = findExtraAccountMetaListPda(mintPubkey);

  await coreProgram.methods
    .initializeHook()
    .accounts({
      payer: admin.publicKey,
      admin: admin.publicKey,
      config: configPda,
      mint: mintPubkey,
      hookConfig,
      extraAccountMetaList,
      transferHookProgram: hookProgram.programId,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { hookConfig, extraAccountMetaList };
}

export async function blacklistWallet(
  hookConfig: PublicKey,
  configPda: PublicKey,
  wallet: PublicKey
): Promise<PublicKey> {
  const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);
  await coreProgram.methods
    .blacklist(wallet)
    .accounts({
      payer: admin.publicKey,
      admin: admin.publicKey,
      config: configPda,
      hookConfig,
      blacklistEntry,
      transferHookProgram: hookProgram.programId,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  return blacklistEntry;
}

export async function unblacklistWallet(
  hookConfig: PublicKey,
  configPda: PublicKey,
  wallet: PublicKey
): Promise<void> {
  const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);
  await coreProgram.methods
    .unblacklist(wallet)
    .accounts({
      payer: admin.publicKey,
      admin: admin.publicKey,
      config: configPda,
      hookConfig,
      blacklistEntry,
      transferHookProgram: hookProgram.programId,
    })
    .rpc();
}

export {
  findConfigPda,
  findRolePda,
  findHookConfigPda,
  findBlacklistEntryPda,
  findExtraAccountMetaListPda,
};
