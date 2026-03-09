import { PublicKey } from "@solana/web3.js";

export const SSS_CORE_PROGRAM_ID = new PublicKey(
  "GmG49Q2d988k5C6dkTLLCihGfH5G6QVg5Rbgv54Z7iw4"
);

export const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "2b5HCPo4PC7w63MmUnXxuR9kwtaQpni8AXktfZHiMf2p"
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
