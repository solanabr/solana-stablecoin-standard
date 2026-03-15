import { PublicKey } from "@solana/web3.js";
import { STABLECOIN_PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID } from "../types";

export function findConfigPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stablecoin-config"), mint.toBuffer()],
    STABLECOIN_PROGRAM_ID
  );
}

export function findRolePDA(config: PublicKey, holder: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("role"), config.toBuffer(), holder.toBuffer()],
    STABLECOIN_PROGRAM_ID
  );
}

export function findBlacklistPDA(mint: PublicKey, address: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), mint.toBuffer(), address.toBuffer()],
    STABLECOIN_PROGRAM_ID
  );
}

export function findExtraAccountMetasPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    TRANSFER_HOOK_PROGRAM_ID
  );
}
