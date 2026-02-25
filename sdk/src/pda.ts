import { PublicKey } from "@solana/web3.js";
import { SSS_TOKEN_PROGRAM_ID, HOOK_PROGRAM_ID } from "./presets.js";

/**
 * Derives the StablecoinConfig PDA for a given mint.
 * Seeds: ["stablecoin", mint]
 */
export async function deriveStablecoinConfig(
  mint: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [Buffer.from("stablecoin"), mint.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

/**
 * Derives the RoleManager PDA for a given stablecoin config PDA.
 * Seeds: ["roles", config]
 */
export async function deriveRoleManager(
  config: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [Buffer.from("roles"), config.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

/**
 * Derives the MinterInfo PDA for a given config + minter address.
 * Seeds: ["minter", config, minter]
 */
export async function deriveMinterInfo(
  config: PublicKey,
  minter: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [Buffer.from("minter"), config.toBuffer(), minter.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

/**
 * Derives the BlacklistEntry PDA for a given mint + address.
 * Seeds: ["blacklist", mint, address]
 */
export async function deriveBlacklistEntry(
  mint: PublicKey,
  address: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [Buffer.from("blacklist"), mint.toBuffer(), address.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

/**
 * Derives the ExtraAccountMetaList PDA for the transfer hook program.
 * Seeds: ["extra-account-metas", mint]
 */
export async function deriveExtraAccountMetaList(
  mint: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddress(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    HOOK_PROGRAM_ID
  );
}
