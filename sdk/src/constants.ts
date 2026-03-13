import { PublicKey } from "@solana/web3.js";

// ── Program IDs ────────────────────────────────────────────────────────
// These are the deployed program addresses. Update after devnet deployment.

export const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
);

export const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "HmbTLCmaGtYhSJaoxkmcJA2MkRYEbn7gxjoYDMgbGnHb"
);

export const ORACLE_MODULE_PROGRAM_ID = new PublicKey(
  "J4ywvRqWbRSuijhFkvSfMbjXZvzR2eJYyGBJASarBPJc"
);

// Token-2022 program
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

// System program
export const SYSTEM_PROGRAM_ID = new PublicKey(
  "11111111111111111111111111111111"
);

// Rent sysvar
export const RENT_SYSVAR_ID = new PublicKey(
  "SysvarRent111111111111111111111111111111111"
);

// ── PDA Seeds ──────────────────────────────────────────────────────────

export const CONFIG_SEED = Buffer.from("config");
export const ROLES_SEED = Buffer.from("roles");
export const BLACKLIST_SEED = Buffer.from("blacklist");

// ── PDA Derivation Helpers ─────────────────────────────────────────────

/**
 * Derive the config PDA for a given mint.
 *
 * The config PDA stores all immutable feature flags and mutable state
 * for a stablecoin instance. Seeds: ["config", mint_pubkey]
 */
export function deriveConfigPda(
  mint: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED, mint.toBuffer()],
    programId
  );
}

/**
 * Derive the role manager PDA for a given config.
 *
 * The role manager stores all role assignments (minters, burners,
 * pauser, blacklister, seizer). Seeds: ["roles", config_pubkey]
 */
export function deriveRolesPda(
  configPda: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ROLES_SEED, configPda.toBuffer()],
    programId
  );
}

/**
 * Derive the blacklist entry PDA for a given config and address.
 *
 * Each blacklisted address gets its own PDA. If the PDA account
 * exists on-chain, the address is blacklisted.
 * Seeds: ["blacklist", config_pubkey, address_pubkey]
 */
export function deriveBlacklistPda(
  configPda: PublicKey,
  address: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, configPda.toBuffer(), address.toBuffer()],
    programId
  );
}

/**
 * Derive all PDAs for a stablecoin mint at once.
 * Handy for setting up tests or initializing a client.
 */
export function deriveAllPdas(
  mint: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
) {
  const [configPda, configBump] = deriveConfigPda(mint, programId);
  const [rolesPda, rolesBump] = deriveRolesPda(configPda, programId);

  return {
    configPda,
    configBump,
    rolesPda,
    rolesBump,
  };
}
