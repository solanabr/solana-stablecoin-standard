import { PublicKey } from "@solana/web3.js";
import { SSS_CORE_PROGRAM_ID, SSS_HOOK_PROGRAM_ID } from "./constants";

const SSS_CONFIG_SEED = Buffer.from("sss-config");
const SSS_ROLE_SEED = Buffer.from("sss-role");
const BLACKLIST_SEED = Buffer.from("blacklist");

export function deriveConfigPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SSS_CONFIG_SEED, mint.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

export function deriveRolePda(
  config: PublicKey,
  address: PublicKey,
  role: number,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SSS_ROLE_SEED, config.toBuffer(), address.toBuffer(), Buffer.from([role])],
    SSS_CORE_PROGRAM_ID,
  );
}

export function deriveBlacklistPda(
  mint: PublicKey,
  address: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, mint.toBuffer(), address.toBuffer()],
    SSS_HOOK_PROGRAM_ID,
  );
}
