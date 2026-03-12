import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

// PDA seeds
export const CONFIG_SEED = "config";
export const MINT_AUTHORITY_SEED = "mint-authority";
export const MINTER_SEED = "minter";
export const HOOK_CONFIG_SEED = "hook-config";
export const BLACKLIST_SEED = "blacklist";
export const EXTRA_ACCOUNT_METAS_SEED = "extra-account-metas";

// Program IDs
export const SSS_CORE_PROGRAM_ID = new PublicKey(
  "CZzvCtyZC8KR37DNDeGYpwN46YEc7WEh6RyeSRdhjY4Y"
);
export const SSS_HOOK_PROGRAM_ID = new PublicKey(
  "9aw7Ac4aGMMfND3BvYgGEcASuvyJiBXnQizbhNBphcNM"
);

// Presets
export const PRESET_MINIMAL = 1;
export const PRESET_COMPLIANT = 2;
export const PRESET_CONFIDENTIAL = 3;

// PDA seed for allowlist (SSS-3)
export const ALLOWLIST_SEED = "allowlist";

// Re-export TOKEN_2022_PROGRAM_ID for convenience
export { TOKEN_2022_PROGRAM_ID };
