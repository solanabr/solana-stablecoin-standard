import { PublicKey } from "@solana/web3.js";
import type { RoleType } from "./types";
import { ROLE_MAP } from "./types";

export const SSS_CORE_PROGRAM_ID = new PublicKey(
  "Corep3pXJzUGaqpw2xzWQi4q63cn1STABiCDMJhMECB",
);

export const SSS_HOOK_PROGRAM_ID = new PublicKey(
  "hookXMsC9txN6T8hyS9GCyubBL4nvp9XPWg5wW3z3pH",
);

const SSS_CONFIG_SEED = Buffer.from("sss-config");
const SSS_ROLE_SEED = Buffer.from("sss-role");
const BLACKLIST_SEED = Buffer.from("blacklist");
const EXTRA_ACCOUNT_METAS_SEED = Buffer.from("extra-account-metas");

export function deriveConfigPda(
  mint: PublicKey,
  programId: PublicKey = SSS_CORE_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SSS_CONFIG_SEED, mint.toBuffer()],
    programId,
  );
}

export function deriveRolePda(
  config: PublicKey,
  address: PublicKey,
  role: RoleType,
  programId: PublicKey = SSS_CORE_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      SSS_ROLE_SEED,
      config.toBuffer(),
      address.toBuffer(),
      Buffer.from([ROLE_MAP[role]]),
    ],
    programId,
  );
}

export function deriveBlacklistPda(
  mint: PublicKey,
  address: PublicKey,
  programId: PublicKey = SSS_HOOK_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, mint.toBuffer(), address.toBuffer()],
    programId,
  );
}

export function deriveExtraAccountMetasPda(
  mint: PublicKey,
  programId: PublicKey = SSS_HOOK_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()],
    programId,
  );
}
