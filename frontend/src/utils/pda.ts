import { PublicKey } from "@solana/web3.js";

export const SSS_CORE_PROGRAM_ID = new PublicKey(
  "G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL"
);

export const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389"
);

export function getConfigAddress(
  mint: PublicKey,
  programId: PublicKey = SSS_CORE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    programId
  );
}

export function getRoleAddress(
  config: PublicKey,
  role: number,
  holder: PublicKey,
  programId: PublicKey = SSS_CORE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("role"), config.toBuffer(), Buffer.from([role]), holder.toBuffer()],
    programId
  );
}

export function getQuotaAddress(
  config: PublicKey,
  minter: PublicKey,
  programId: PublicKey = SSS_CORE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("quota"), config.toBuffer(), minter.toBuffer()],
    programId
  );
}

export function getBlacklistAddress(
  config: PublicKey,
  address: PublicKey,
  programId: PublicKey = SSS_CORE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), config.toBuffer(), address.toBuffer()],
    programId
  );
}

export function getAllowlistAddress(
  config: PublicKey,
  address: PublicKey,
  programId: PublicKey = SSS_CORE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("allowlist"), config.toBuffer(), address.toBuffer()],
    programId
  );
}

export function getExtraAccountMetasAddress(
  mint: PublicKey,
  hookProgramId: PublicKey = SSS_TRANSFER_HOOK_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    hookProgramId
  );
}

// Role byte constants
export const ROLE_ADMIN = 0;
export const ROLE_MINTER = 1;
export const ROLE_PAUSER = 2;
export const ROLE_FREEZER = 3;
export const ROLE_BLACKLISTER = 4;
export const ROLE_SEIZER = 5;

export const ROLE_NAMES: Record<number, string> = {
  0: "Admin",
  1: "Minter",
  2: "Pauser",
  3: "Freezer",
  4: "Blacklister",
  5: "Seizer",
};

export function shortenAddress(addr: string, chars = 4): string {
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}
