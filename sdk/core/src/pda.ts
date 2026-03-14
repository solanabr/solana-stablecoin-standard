import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export const CONFIG_SEED = Buffer.from("config");
export const ROLE_SEED = Buffer.from("role");
export const QUOTA_SEED = Buffer.from("quota");
export const BLACKLIST_SEED = Buffer.from("blacklist");
export const ALLOWLIST_SEED = Buffer.from("allowlist");
export const ORACLE_CONFIG_SEED = Buffer.from("oracle");
export const EXTRA_ACCOUNT_METAS_SEED = Buffer.from("extra-account-metas");

/** Role byte constants matching on-chain constants.rs */
export const ROLE_ADMIN = 0;
export const ROLE_MINTER = 1;
export const ROLE_PAUSER = 2;
export const ROLE_FREEZER = 3;
export const ROLE_BLACKLISTER = 4;
export const ROLE_SEIZER = 5;

export function getConfigAddress(
  programId: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED, mint.toBuffer()],
    programId,
  );
}

export function getRoleAddress(
  programId: PublicKey,
  role: number,
  config: PublicKey,
  holder: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ROLE_SEED, config.toBuffer(), Buffer.from([role]), holder.toBuffer()],
    programId,
  );
}

export function getQuotaAddress(
  programId: PublicKey,
  config: PublicKey,
  minter: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [QUOTA_SEED, config.toBuffer(), minter.toBuffer()],
    programId,
  );
}

export function getBlacklistAddress(
  programId: PublicKey,
  config: PublicKey,
  address: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, config.toBuffer(), address.toBuffer()],
    programId,
  );
}

export function getAllowlistAddress(
  programId: PublicKey,
  config: PublicKey,
  address: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ALLOWLIST_SEED, config.toBuffer(), address.toBuffer()],
    programId,
  );
}

export function getOracleConfigAddress(
  programId: PublicKey,
  config: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ORACLE_CONFIG_SEED, config.toBuffer()],
    programId,
  );
}

export function getExtraAccountMetasAddress(
  hookProgramId: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()],
    hookProgramId,
  );
}

/** Derive all common addresses for a stablecoin */
export function deriveStablecoinAddresses(
  programId: PublicKey,
  mint: PublicKey,
) {
  const [config, configBump] = getConfigAddress(programId, mint);
  return { config, configBump, mint };
}
