import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { SEEDS, SSS_TOKEN_PROGRAM_ID, SSS_TRANSFER_HOOK_PROGRAM_ID } from "./constants";

export function getConfigPda(
  mint: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.CONFIG, mint.toBuffer()],
    programId
  );
}

export function getRoleRegistryPda(
  config: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.ROLES, config.toBuffer()],
    programId
  );
}

export function getMinterInfoPda(
  config: PublicKey,
  minter: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.MINTER, config.toBuffer(), minter.toBuffer()],
    programId
  );
}

export function getBlacklistPda(
  config: PublicKey,
  address: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.BLACKLIST, config.toBuffer(), address.toBuffer()],
    programId
  );
}

export function getReserveAttestationPda(
  config: PublicKey,
  index: BN | number,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  const indexBn = typeof index === "number" ? new BN(index) : index;
  return PublicKey.findProgramAddressSync(
    [SEEDS.RESERVE, config.toBuffer(), indexBn.toArrayLike(Buffer, "le", 8)],
    programId
  );
}

export function getExtraAccountMetaListPda(
  mint: PublicKey,
  programId: PublicKey = SSS_TRANSFER_HOOK_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.EXTRA_ACCOUNT_METAS, mint.toBuffer()],
    programId
  );
}
