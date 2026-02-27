// Mock types for SSS contracts
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export interface ConfidentialAccount {
  owner: PublicKey;
  mint: PublicKey;
  pendingBalance: Buffer;
  availableBalance: Buffer;
  allowTimestamps: BN;
  bump: number;
}

export interface AllowlistEntry {
  address: PublicKey;
  stablecoin: PublicKey;
  reason: string;
  isActive: boolean;
  createdAt: number;
  expiry?: BN;
}

export interface MinterInfo {
  minter: PublicKey;
  quota: BN;
  minted: BN;
  stablecoin: PublicKey;
  bump: number;
}
