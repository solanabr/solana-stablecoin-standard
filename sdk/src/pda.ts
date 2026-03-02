import { PublicKey } from '@solana/web3.js';
import {
  SSS_PROGRAM_ID,
  STABLECOIN_CONFIG_SEED,
  ROLES_CONFIG_SEED,
  BLACKLIST_SEED,
} from './constants';

/** Derive the StablecoinConfig PDA for a given mint */
export function findStablecoinConfigPda(mint: PublicKey, programId = SSS_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [STABLECOIN_CONFIG_SEED, mint.toBuffer()],
    programId,
  );
}

/** Derive the RolesConfig PDA for a given mint */
export function findRolesConfigPda(mint: PublicKey, programId = SSS_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ROLES_CONFIG_SEED, mint.toBuffer()],
    programId,
  );
}

/** Derive the BlacklistEntry PDA for a given mint + target address (SSS-2 only) */
export function findBlacklistEntryPda(
  mint: PublicKey,
  target: PublicKey,
  programId = SSS_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, mint.toBuffer(), target.toBuffer()],
    programId,
  );
}
