import { PublicKey } from "@solana/web3.js";

export const SSS_CORE_PROGRAM_ID = new PublicKey(
  "CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y"
);

export const SSS_HOOK_PROGRAM_ID = new PublicKey(
  "9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM"
);

export const PRESET_MINIMAL = 1;
export const PRESET_COMPLIANT = 2;

export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://api.devnet.solana.com";

export const EXPLORER_URL = "https://explorer.solana.com";

export const CONFIG_SEED = "config";
export const MINT_AUTHORITY_SEED = "mint-authority";
export const MINTER_SEED = "minter";
export const BLACKLIST_SEED = "blacklist";

export function findConfigPda(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(CONFIG_SEED), mint.toBuffer()],
    SSS_CORE_PROGRAM_ID
  );
}

export function findMinterStatePda(
  config: PublicKey,
  minter: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(MINTER_SEED), config.toBuffer(), minter.toBuffer()],
    SSS_CORE_PROGRAM_ID
  );
}

export function findBlacklistPda(
  mint: PublicKey,
  wallet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(BLACKLIST_SEED), mint.toBuffer(), wallet.toBuffer()],
    SSS_HOOK_PROGRAM_ID
  );
}
