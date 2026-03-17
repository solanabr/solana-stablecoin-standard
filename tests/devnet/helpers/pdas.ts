import { PublicKey } from "@solana/web3.js";

const SEED_CONFIG = Buffer.from("config");
const SEED_ROLES = Buffer.from("roles");
const SEED_MINTER = Buffer.from("minter");
const SEED_BLACKLIST = Buffer.from("blacklist");
const SEED_EXTRA_ACCOUNT_METAS = Buffer.from("extra-account-metas");
const SEED_HOOK_CONFIG = Buffer.from("hook_config");
const SEED_EVENT_AUTHORITY = Buffer.from("__event_authority");

export function hookConfigPda(
  transferHookProgramId: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_HOOK_CONFIG],
    transferHookProgramId,
  )[0];
}

export function configPda(
  stablecoinProgramId: PublicKey,
  mint: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_CONFIG, mint.toBuffer()],
    stablecoinProgramId,
  )[0];
}

export function rolesPda(
  stablecoinProgramId: PublicKey,
  mint: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_ROLES, mint.toBuffer()],
    stablecoinProgramId,
  )[0];
}

export function minterQuotaPda(
  stablecoinProgramId: PublicKey,
  mint: PublicKey,
  minter: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_MINTER, mint.toBuffer(), minter.toBuffer()],
    stablecoinProgramId,
  )[0];
}

export function blacklistPda(
  stablecoinProgramId: PublicKey,
  mint: PublicKey,
  wallet: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_BLACKLIST, mint.toBuffer(), wallet.toBuffer()],
    stablecoinProgramId,
  )[0];
}

export function extraAccountMetaListPda(
  transferHookProgramId: PublicKey,
  mint: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_EXTRA_ACCOUNT_METAS, mint.toBuffer()],
    transferHookProgramId,
  )[0];
}

export function eventAuthorityPda(stablecoinProgramId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [SEED_EVENT_AUTHORITY],
    stablecoinProgramId,
  )[0];
}
