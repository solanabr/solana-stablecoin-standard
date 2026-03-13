import { PublicKey } from "@solana/web3.js";

const SSS1_PROGRAM_ID = new PublicKey("J4Z8HDQs2VbmSxs1VURkGY5M51SDmiY8K5a1RVuTN6np");

export function findConfigPda(mint: PublicKey, programId = SSS1_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    programId
  );
}

export function findRolePda(
  config: PublicKey,
  authority: PublicKey,
  roleType: number,
  programId = SSS1_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("role"), config.toBuffer(), authority.toBuffer(), Buffer.from([roleType])],
    programId
  );
}

export function findHookConfigPda(mint: PublicKey, programId = SSS1_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("hook_config"), mint.toBuffer()],
    programId
  );
}

export function findBlacklistPda(
  hookConfig: PublicKey,
  address: PublicKey,
  programId = SSS1_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), hookConfig.toBuffer(), address.toBuffer()],
    programId
  );
}

export function findExtraAccountMetaListPda(
  mint: PublicKey,
  programId = SSS1_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    programId
  );
}

export { SSS1_PROGRAM_ID };
