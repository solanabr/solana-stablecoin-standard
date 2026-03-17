import { PublicKey } from "@solana/web3.js";

const SEED_BLACKLIST = Buffer.from("blacklist", "utf8");
const SEED_CONFIG = Buffer.from("config", "utf8");
const SEED_ROLES = Buffer.from("roles", "utf8");
const SEED_MINTER = Buffer.from("minter", "utf8");
const SEED_EXTRA_ACCOUNT_METAS = Buffer.from("extra-account-metas", "utf8");
const SEED_HOOK_CONFIG = Buffer.from("hook_config", "utf8");

export function findHookConfigPda(
  transferHookProgramId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_HOOK_CONFIG],
    transferHookProgramId
  );
}

export function findBlacklistEntryPda(
  mint: PublicKey,
  wallet: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_BLACKLIST, mint.toBuffer(), wallet.toBuffer()],
    programId
  );
}

export function findConfigPda(
  mint: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_CONFIG, mint.toBuffer()],
    programId
  );
}

export function findRoleConfigPda(
  mint: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_ROLES, mint.toBuffer()],
    programId
  );
}

export function findMinterQuotaPda(
  mint: PublicKey,
  minter: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_MINTER, mint.toBuffer(), minter.toBuffer()],
    programId
  );
}

export function findExtraAccountMetaListPda(
  mint: PublicKey,
  transferHookProgramId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_EXTRA_ACCOUNT_METAS, mint.toBuffer()],
    transferHookProgramId
  );
}
