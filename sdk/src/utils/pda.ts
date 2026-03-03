import { PublicKey } from "@solana/web3.js";

export const SSS_CORE_PROGRAM_ID = new PublicKey(
  "FH3XosNdAdUPfcxVxjUrUoCrGaLw9L3i9eadu7M8nQZQ"
);

export const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "Hook1111111111111111111111111111111111111111"
);

export function findConfigPda(
  mint: PublicKey,
  programId: PublicKey = SSS_CORE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sss_config"), mint.toBuffer()],
    programId
  );
}

export function findRolePda(
  config: PublicKey,
  holder: PublicKey,
  roleDiscriminant: number,
  programId: PublicKey = SSS_CORE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("sss_role"),
      config.toBuffer(),
      holder.toBuffer(),
      Buffer.from([roleDiscriminant]),
    ],
    programId
  );
}

export function findHookConfigPda(
  mint: PublicKey,
  programId: PublicKey = SSS_TRANSFER_HOOK_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("hook_config"), mint.toBuffer()],
    programId
  );
}

export function findBlacklistEntryPda(
  hookConfig: PublicKey,
  wallet: PublicKey,
  programId: PublicKey = SSS_TRANSFER_HOOK_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), hookConfig.toBuffer(), wallet.toBuffer()],
    programId
  );
}

export function findExtraAccountMetaListPda(
  mint: PublicKey,
  programId: PublicKey = SSS_TRANSFER_HOOK_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    programId
  );
}
