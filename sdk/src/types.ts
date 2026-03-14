import { PublicKey } from "@solana/web3.js";

// Program IDs
export const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  "2L6rZHyqhJ9VJqXhbgW7vyP3uerrw7Vzpp3qtqAq1FZj"
);
export const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "E3pPcPAU4Un7WMaHyMnG6L3SJ8dNu4gjZGU6ExqvhRzS"
);

// Presets
export enum Preset {
  SSS1 = 0, // Minimal stablecoin
  SSS2 = 1, // Compliant stablecoin (blacklist + seize)
  SSS3 = 2, // Private stablecoin (confidential transfers)
}

// Asset Backing Types
export enum BackingType {
  Fiat = 0,        // USD, EUR, etc
  Gold = 1,        // precious metals
  Crypto = 2,      // over-collateralized crypto
  Commodity = 3,   // oil, corn, silver
  RealEstate = 4,  // real estate backed
  MultiAsset = 5,  // basket of RWA
  Algorithmic = 6, // no direct backing
}

// Fiat Currencies
export enum FiatCurrency {
  Usd = 0,
  Eur = 1,
  Gbp = 2,
  Jpy = 3,
  Chf = 4,
  Cad = 5,
  Aud = 6,
  Cny = 7,
}

// Banking Rails
export enum BankingRail {
  Swift = 0,    // international wire
  Ach = 1,      // US domestic
  Sepa = 2,     // EU domestic
  Fedwire = 3,  // US high-value
  Fps = 4,      // UK Faster Payments
  Pix = 5,      // Brazil instant
  Upi = 6,      // India UPI
  None = 7,     // crypto-only
}

// Mint Request Status
export enum MintRequestStatus {
  Pending = 0,
  Confirmed = 1,
  Minted = 2,
  Rejected = 3,
  Expired = 4,
}

// Redemption Status
export enum RedemptionStatus {
  Requested = 0,
  Processing = 1,
  Completed = 2,
  Failed = 3,
}

// Role flags
export const Roles = {
  MINTER: 0,
  BURNER: 1,
  PAUSER: 2,
  FREEZER: 3,
  BLACKLISTER: 4,
  SEIZER: 5,
} as const;

// PDA Seeds
export const SEEDS = {
  CONFIG: Buffer.from("config"),
  ROLES: Buffer.from("roles"),
  BLACKLIST: Buffer.from("blacklist"),
  MINT_REQUEST: Buffer.from("mint_request"),
  REDEMPTION: Buffer.from("redemption"),
  ATTESTATION: Buffer.from("attestation"),
} as const;
