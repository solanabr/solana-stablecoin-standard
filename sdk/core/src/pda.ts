import { PublicKey } from "@solana/web3.js";
import {
  BLACKLIST_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
  MINTER_RECORD_SEED,
  SSS_CORE_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
  STABLECOIN_SEED,
} from "./constants";

export function findStablecoinStatePda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [STABLECOIN_SEED, mint.toBuffer()],
    SSS_CORE_PROGRAM_ID
  );
}

export function findMinterRecordPda(
  mint: PublicKey,
  minter: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINTER_RECORD_SEED, mint.toBuffer(), minter.toBuffer()],
    SSS_CORE_PROGRAM_ID
  );
}

export function findBlacklistEntryPda(
  mint: PublicKey,
  address: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, mint.toBuffer(), address.toBuffer()],
    SSS_CORE_PROGRAM_ID
  );
}

export function findExtraAccountMetaListPda(
  mint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()],
    SSS_TRANSFER_HOOK_PROGRAM_ID
  );
}
