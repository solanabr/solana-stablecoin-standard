import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

/**
 * Derives the Associated Token Account (ATA) for a wallet and mint.
 * Uses Token-2022 program; the ATA program derives the same PDA for SPL and Token-2022.
 */
export function getAssociatedTokenAddress(
  mint: string,
  owner: string
): string {
  const mintPubkey = new PublicKey(mint);
  const ownerPubkey = new PublicKey(owner);
  const ata = getAssociatedTokenAddressSync(
    mintPubkey,
    ownerPubkey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  return ata.toBase58();
}
