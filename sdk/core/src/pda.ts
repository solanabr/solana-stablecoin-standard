import { PublicKey } from "@solana/web3.js";
import { SSS_TOKEN_PROGRAM_ID, TRANSFER_HOOK_PROGRAM_ID } from "./types";

export const CONFIG_SEED = Buffer.from("config");
export const MINTER_SEED = Buffer.from("minter");
export const ROLE_SEED = Buffer.from("role");
export const BLACKLIST_SEED = Buffer.from("blacklist");
export const EXTRA_ACCOUNT_METAS_SEED = Buffer.from("extra-account-metas");

export function getConfigAddress(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED, mint.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function getMinterAddress(mint: PublicKey, minter: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINTER_SEED, mint.toBuffer(), minter.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function getRoleAddress(mint: PublicKey, roleType: number, address: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ROLE_SEED, mint.toBuffer(), Buffer.from([roleType]), address.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function getBlacklistAddress(mint: PublicKey, address: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, mint.toBuffer(), address.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function getExtraAccountMetasAddress(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()],
    TRANSFER_HOOK_PROGRAM_ID
  );
}

export function deriveAddresses(mint: PublicKey) {
  const [config, configBump] = getConfigAddress(mint);
  const [extraAccountMetas] = getExtraAccountMetasAddress(mint);
  return { config, configBump, extraAccountMetas };
}
