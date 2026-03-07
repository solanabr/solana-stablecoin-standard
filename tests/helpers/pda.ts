import * as anchor from "@coral-xyz/anchor";

const CONFIG_SEED = Buffer.from("config");
const MASTER_SEED = Buffer.from("master");
const ROLE_SEED = Buffer.from("role");
const MINTER_SEED = Buffer.from("minter");
const MINTER_ROLE = Buffer.from("minter");
const MINT_SEED = Buffer.from("mint");
const FREEZE_SEED = Buffer.from("freeze");
const PAUSE_SEED = Buffer.from("pause");
const MASTER_ROLE = Buffer.from("master");
const BURNER_ROLE = Buffer.from("burner");
const PAUSER_ROLE = Buffer.from("pauser");
const SEIZER_SEED = Buffer.from("seizer");
const BLACKLIST_SEED = Buffer.from("blacklist");

/**
 * Get the mint PDA for the SSS program (seeds: ["mint", symbol]).
 */
export function getMintPda(
  programId: anchor.web3.PublicKey,
  symbol: string,
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [MINT_SEED, Buffer.from(symbol, "utf8")],
    programId,
  );
}

/**
 * Get the config PDA for a given mint.
 */
export function getConfigPda(
  programId: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [CONFIG_SEED, mint.toBuffer()],
    programId,
  );
}

/**
 * Get the MasterConfig PDA for a given mint.
 * Seeds: [MASTER_SEED, mint]
 * @deprecated Use getMasterRolePda for RBAC; master is now a RoleAccount.
 */
export function getMasterConfigPda(
  programId: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [MASTER_SEED, mint.toBuffer()],
    programId,
  );
}

/**
 * Get the master RoleAccount PDA for a given mint and master pubkey.
 * Seeds: [ROLE_SEED, mint, MASTER_ROLE, master]
 */
export function getMasterRolePda(
  programId: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
  master: anchor.web3.PublicKey,
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [ROLE_SEED, mint.toBuffer(), MASTER_ROLE, master.toBuffer()],
    programId,
  );
}

/**
 * Get the freeze authority PDA. Seeds: [FREEZE_SEED, mint]
 */
export function getFreezeAuthorityPda(
  programId: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [FREEZE_SEED, mint.toBuffer()],
    programId,
  );
}

/**
 * Get the pause authority PDA. Seeds: [PAUSE_SEED, mint]
 */
export function getPauseAuthorityPda(
  programId: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [PAUSE_SEED, mint.toBuffer()],
    programId,
  );
}

/**
 * Get the mint authority PDA (SPL mint_authority). No account data.
 * Seeds: [MINTER_SEED, mint]
 */
export function getMintAuthorityPda(
  programId: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [MINTER_SEED, mint.toBuffer()],
    programId,
  );
}

/**
 * Get the seizer authority PDA. Seeds: [SEIZER_SEED, mint]
 */
export function getSeizerAuthorityPda(
  programId: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [SEIZER_SEED, mint.toBuffer()],
    programId,
  );
}

/**
 * Get the BlacklistedEntry PDA for a given mint and wallet.
 * Seeds: [BLACKLIST_SEED, mint, wallet]
 */
export function getBlacklistedEntryPda(
  programId: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
  wallet: anchor.web3.PublicKey,
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, mint.toBuffer(), wallet.toBuffer()],
    programId,
  );
}

/**
 * Get the MinterAccount PDA for a given mint and user.
 * Seeds: [MINT_MINTER_SEED, mint, user]
 */
export function getMinterAccountPda(
  programId: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
  user: anchor.web3.PublicKey,
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [ROLE_SEED, mint.toBuffer(), MINTER_ROLE, user.toBuffer()],
    programId,
  );
}

/**
 * Get the RoleAccount PDA for a given mint, role name, and user.
 * Seeds: [ROLE_SEED, mint, roleName, user]
 */
export function getRoleAccountPda(
  programId: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
  roleName: Buffer | Uint8Array,
  user: anchor.web3.PublicKey,
): [anchor.web3.PublicKey, number] {
  const roleBuf =
    roleName instanceof Buffer ? roleName : Buffer.from(roleName);
  return anchor.web3.PublicKey.findProgramAddressSync(
    [ROLE_SEED, mint.toBuffer(), roleBuf, user.toBuffer()],
    programId,
  );
}

/**
 * Get the Metaplex metadata PDA for a mint (used for SSS1 / SPL Token).
 */
export function getMetadataPda(
  mint: anchor.web3.PublicKey,
): anchor.web3.PublicKey {
  const METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  );
  const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID,
  );
  return pda;
}

export function getEventAuthorityPda(programId: anchor.web3.PublicKey): anchor.web3.PublicKey {
  const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    programId,
  );
  return pda;
}