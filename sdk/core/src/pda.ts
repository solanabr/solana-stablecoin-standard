import { PublicKey } from "@solana/web3.js";

// Seeds must match constants.rs in the sss-token program
const CONFIG_SEED = Buffer.from("config");
const MINTER_SEED = Buffer.from("minter");
const BLACKLIST_SEED = Buffer.from("blacklist");
const EXTRA_ACCOUNT_METAS_SEED = Buffer.from("extra-account-metas");

export function findConfigPda(
  mint: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED, mint.toBuffer()],
    programId
  );
}

export function findMinterPda(
  mint: PublicKey,
  minter: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINTER_SEED, mint.toBuffer(), minter.toBuffer()],
    programId
  );
}

export function findBlacklistPda(
  mint: PublicKey,
  address: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, mint.toBuffer(), address.toBuffer()],
    programId
  );
}

export function findExtraAccountMetaListPda(
  mint: PublicKey,
  hookProgramId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()],
    hookProgramId
  );
}
