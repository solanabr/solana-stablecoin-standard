import { PublicKey } from "@solana/web3.js";

const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  "SSSTokenXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
);
const SSS_HOOK_PROGRAM_ID = new PublicKey(
  "SSSHookXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
);

export function getConfigPDA(
  mint: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sss_config"), mint.toBuffer()],
    programId
  );
}

export function getRolePDA(
  config: PublicKey,
  authority: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sss_role"), config.toBuffer(), authority.toBuffer()],
    programId
  );
}

export function getBlacklistPDA(
  config: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sss_blacklist"), config.toBuffer()],
    programId
  );
}

export function getExtraAccountMetaListPDA(
  mint: PublicKey,
  programId: PublicKey = SSS_HOOK_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    programId
  );
}

export { SSS_TOKEN_PROGRAM_ID, SSS_HOOK_PROGRAM_ID };
