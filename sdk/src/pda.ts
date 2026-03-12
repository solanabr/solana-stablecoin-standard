import { PublicKey } from "@solana/web3.js";
import {
  CONFIG_SEED,
  MINT_AUTHORITY_SEED,
  MINTER_SEED,
  HOOK_CONFIG_SEED,
  BLACKLIST_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
  ALLOWLIST_SEED,
  SSS_CORE_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
} from "./constants";

/**
 * Derive the stablecoin config PDA.
 * Seeds: ["config", mint]
 */
export function findConfigPda(
  mint: PublicKey,
  programId: PublicKey = SSS_CORE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(CONFIG_SEED), mint.toBuffer()],
    programId
  );
}

/**
 * Derive the mint authority PDA.
 * Seeds: ["mint-authority", mint]
 */
export function findMintAuthorityPda(
  mint: PublicKey,
  programId: PublicKey = SSS_CORE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(MINT_AUTHORITY_SEED), mint.toBuffer()],
    programId
  );
}

/**
 * Derive the minter state PDA for a specific minter wallet.
 * Seeds: ["minter", config, minter_wallet]
 */
export function findMinterStatePda(
  config: PublicKey,
  minter: PublicKey,
  programId: PublicKey = SSS_CORE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(MINTER_SEED), config.toBuffer(), minter.toBuffer()],
    programId
  );
}

/**
 * Derive the hook config PDA.
 * Seeds: ["hook-config", mint]
 */
export function findHookConfigPda(
  mint: PublicKey,
  programId: PublicKey = SSS_HOOK_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(HOOK_CONFIG_SEED), mint.toBuffer()],
    programId
  );
}

/**
 * Derive the blacklist entry PDA for a specific wallet.
 * Seeds: ["blacklist", mint, wallet]
 */
export function findBlacklistEntryPda(
  mint: PublicKey,
  wallet: PublicKey,
  programId: PublicKey = SSS_HOOK_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(BLACKLIST_SEED), mint.toBuffer(), wallet.toBuffer()],
    programId
  );
}

/**
 * Derive the ExtraAccountMetaList PDA required by spl-transfer-hook-interface.
 * Seeds: ["extra-account-metas", mint]
 */
export function findExtraAccountMetaListPda(
  mint: PublicKey,
  programId: PublicKey = SSS_HOOK_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(EXTRA_ACCOUNT_METAS_SEED), mint.toBuffer()],
    programId
  );
}

/**
 * Derive the allowlist entry PDA for SSS-3 confidential transfer approval.
 * Seeds: ["allowlist", mint, wallet]
 */
export function findAllowlistEntryPda(
  mint: PublicKey,
  wallet: PublicKey,
  programId: PublicKey = SSS_CORE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(ALLOWLIST_SEED), mint.toBuffer(), wallet.toBuffer()],
    programId
  );
}
