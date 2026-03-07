import { PublicKey } from "@solana/web3.js";

export function findConfigPda(mint: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    programId
  );
}

export function findMinterPda(mint: PublicKey, minter: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("minter"), mint.toBuffer(), minter.toBuffer()],
    programId
  );
}

export function findBlacklistPda(mint: PublicKey, address: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), mint.toBuffer(), address.toBuffer()],
    programId
  );
}
