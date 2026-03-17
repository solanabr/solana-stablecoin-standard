import { PublicKey } from "@solana/web3.js";
import { TRANSFERHOOK_PROGRAM_ID } from "..";

export function findHookConfigPda(
  programId: PublicKey = TRANSFERHOOK_PROGRAM_ID,
): [PublicKey, number] {
  const seedsBuffer: Buffer[] = [Buffer.from("hook_config", "utf8")];
  return PublicKey.findProgramAddressSync(seedsBuffer, programId);
}
