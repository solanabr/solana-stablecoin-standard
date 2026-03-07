import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "7qYYBZqC88Vt61pon3cJnbTpukCsgCETypo13cttMVMG",
);

// Seeds matching programs/sss/src/constants.rs
const CONFIG_SEED = Buffer.from("config");
const ROLE_SEED = Buffer.from("role");
const MINTER_SEED = Buffer.from("minter");
const SEIZER_SEED = Buffer.from("seizer");
const FREEZE_SEED = Buffer.from("freeze");
const PAUSE_SEED = Buffer.from("pause");
const BLACKLIST_SEED = Buffer.from("blacklist");

// Role name seeds
export const MASTER_ROLE = Buffer.from("master");
export const MINTER_ROLE = Buffer.from("minter");
export const BURNER_ROLE = Buffer.from("burner");
export const PAUSER_ROLE = Buffer.from("pauser");
export const BLACKLISTER_ROLE = Buffer.from("blacklister");
export const SEIZER_ROLE = Buffer.from("seizer");

export function getConfigPda(
  programId: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED, mint.toBuffer()],
    programId,
  );
}

/** SPL mint authority PDA. Seeds: [minter, mint] */
export function getMintAuthorityPda(
  programId: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINTER_SEED, mint.toBuffer()],
    programId,
  );
}

export function getFreezeAuthorityPda(
  programId: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [FREEZE_SEED, mint.toBuffer()],
    programId,
  );
}

export function getPauseAuthorityPda(
  programId: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PAUSE_SEED, mint.toBuffer()],
    programId,
  );
}

export function getSeizerAuthorityPda(
  programId: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEIZER_SEED, mint.toBuffer()],
    programId,
  );
}

/** Generic role account PDA. Seeds: [role, mint, roleName, user] */
export function getRoleAccountPda(
  programId: PublicKey,
  mint: PublicKey,
  roleName: Buffer | Uint8Array,
  user: PublicKey,
): [PublicKey, number] {
  const roleNameBuf =
    roleName instanceof Buffer ? roleName : Buffer.from(roleName);
  return PublicKey.findProgramAddressSync(
    [ROLE_SEED, mint.toBuffer(), roleNameBuf, user.toBuffer()],
    programId,
  );
}

export function getMasterRolePda(
  programId: PublicKey,
  mint: PublicKey,
  master: PublicKey,
): [PublicKey, number] {
  return getRoleAccountPda(programId, mint, MASTER_ROLE, master);
}

export function getMinterAccountPda(
  programId: PublicKey,
  mint: PublicKey,
  minter: PublicKey,
): [PublicKey, number] {
  return getRoleAccountPda(programId, mint, MINTER_ROLE, minter);
}

export function getBurnerRolePda(
  programId: PublicKey,
  mint: PublicKey,
  burner: PublicKey,
): [PublicKey, number] {
  return getRoleAccountPda(programId, mint, BURNER_ROLE, burner);
}

export function getPauserRolePda(
  programId: PublicKey,
  mint: PublicKey,
  pauser: PublicKey,
): [PublicKey, number] {
  return getRoleAccountPda(programId, mint, PAUSER_ROLE, pauser);
}

export function getSeizerRolePda(
  programId: PublicKey,
  mint: PublicKey,
  seizer: PublicKey,
): [PublicKey, number] {
  return getRoleAccountPda(programId, mint, SEIZER_ROLE, seizer);
}

export function getBlacklisterRolePda(
  programId: PublicKey,
  mint: PublicKey,
  blacklister: PublicKey,
): [PublicKey, number] {
  return getRoleAccountPda(programId, mint, BLACKLISTER_ROLE, blacklister);
}

export function getBlacklistedEntryPda(
  programId: PublicKey,
  mint: PublicKey,
  wallet: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, mint.toBuffer(), wallet.toBuffer()],
    programId,
  );
}

export function getEventAuthorityPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    programId,
  );
  return pda;
}
