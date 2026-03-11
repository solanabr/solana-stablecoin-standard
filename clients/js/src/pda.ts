import { PublicKey } from "@solana/web3.js";

export const STABLECOIN_PROGRAM_ID = new PublicKey("SSSW3EixhrbB6yYpTdKmH2nCReqsA1VJqJkhwvcdzLA");
export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey("Fi6N4Z2Xm47dRmLoDRcVAvoiQ1UnT2WcuzvwjXvcB8mu");

export function deriveConfigPda(
  mint: PublicKey,
  programId: PublicKey = STABLECOIN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    programId
  );
}

export function deriveMintAuthorityPda(
  mint: PublicKey,
  programId: PublicKey = STABLECOIN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("authority"), mint.toBuffer()],
    programId
  );
}

export function deriveMinterPda(
  mint: PublicKey,
  minter: PublicKey,
  programId: PublicKey = STABLECOIN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("minter"), mint.toBuffer(), minter.toBuffer()],
    programId
  );
}

export function deriveBlacklistPda(
  mint: PublicKey,
  wallet: PublicKey,
  programId: PublicKey = STABLECOIN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), mint.toBuffer(), wallet.toBuffer()],
    programId
  );
}

export function deriveRolePda(
  mint: PublicKey,
  role: string,
  assignee: PublicKey,
  programId: PublicKey = STABLECOIN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("role"), mint.toBuffer(), Buffer.from(role), assignee.toBuffer()],
    programId
  );
}

export function deriveExtraAccountMetaListPda(
  mint: PublicKey,
  hookProgramId: PublicKey = TRANSFER_HOOK_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    hookProgramId
  );
}
