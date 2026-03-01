import { PublicKey } from "@solana/web3.js";
import { SSS_TOKEN_PROGRAM_ID } from "./constants";
import { Role, ROLE_SEEDS } from "./types";

/** Derive the StablecoinState PDA for a given mint. */
export function findStablecoinPda(
  mint: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stablecoin"), mint.toBuffer()],
    programId
  );
}

/** Derive the MinterState PDA for a given stablecoin and minter. */
export function findMinterPda(
  stablecoin: PublicKey,
  minter: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("minter"), stablecoin.toBuffer(), minter.toBuffer()],
    programId
  );
}

/** Derive the RoleAssignment PDA. */
export function findRolePda(
  stablecoin: PublicKey,
  role: Role,
  assignee: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("role"),
      stablecoin.toBuffer(),
      Buffer.from(ROLE_SEEDS[role]),
      assignee.toBuffer(),
    ],
    programId
  );
}

/** Derive the BlacklistEntry PDA. */
export function findBlacklistPda(
  stablecoin: PublicKey,
  target: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), stablecoin.toBuffer(), target.toBuffer()],
    programId
  );
}
