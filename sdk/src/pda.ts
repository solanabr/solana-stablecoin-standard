import { PublicKey } from "@solana/web3.js";
import { SSS_TOKEN_PROGRAM_ID, SEEDS } from "./types";

/**
 * Derive the config PDA for a stablecoin mint
 */
export function deriveConfigPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.CONFIG, mint.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

/**
 * Derive the roles PDA for a specific user
 */
export function deriveRolesPda(
  config: PublicKey,
  target: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.ROLES, config.toBuffer(), target.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

/**
 * Derive the blacklist entry PDA
 */
export function deriveBlacklistPda(
  config: PublicKey,
  address: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.BLACKLIST, config.toBuffer(), address.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

/**
 * Derive mint request PDA
 */
export function deriveMintRequestPda(
  config: PublicKey,
  referenceId: Buffer
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.MINT_REQUEST, config.toBuffer(), referenceId],
    SSS_TOKEN_PROGRAM_ID
  );
}

/**
 * Derive redemption request PDA
 */
export function deriveRedemptionPda(
  config: PublicKey,
  redeemer: PublicKey,
  nonce: Buffer
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.REDEMPTION, config.toBuffer(), redeemer.toBuffer(), nonce],
    SSS_TOKEN_PROGRAM_ID
  );
}

/**
 * Derive attestation PDA
 */
export function deriveAttestationPda(
  config: PublicKey,
  nonce: Buffer
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.ATTESTATION, config.toBuffer(), nonce],
    SSS_TOKEN_PROGRAM_ID
  );
}
