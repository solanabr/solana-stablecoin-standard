import { Keypair } from "@solana/web3.js";

export interface TuiConfig {
  cluster: string;
  rpcUrl: string;
  mint: string | null;
  walletPath: string;
  refreshMs: number;
}

export interface RuntimeContext {
  wallet: Keypair | null;
}

export interface DashboardStats {
  supply: string;
  totalMinted: string;
  totalBurned: string;
  totalMintedValue: bigint;
  totalBurnedValue: bigint;
  minters: number;
  holders: number;
  paused: boolean;
  preset: string;
  walletBalance: string;
  blockHeight: number;
}

export type UiLogLevel = "info" | "success" | "warn" | "error" | "event";

export interface UiEventItem {
  name: string;
  signature: string;
  timestamp: number;
  summary: string;
  primaryAddress?: string;
}

export enum OperationId {
  Mint = "mint",
  Burn = "burn",
  Transfer = "transfer",
  PauseToggle = "pause-toggle",
  AddMinter = "add-minter",
  RemoveMinter = "remove-minter",
  Freeze = "freeze",
  Thaw = "thaw",
  BlacklistAdd = "blacklist-add",
  BlacklistRemove = "blacklist-remove",
  Seize = "seize",
  Refresh = "refresh",
}

export interface OperationItem {
  id: OperationId;
  label: string;
  enabled: boolean;
  reason?: string;
}

export interface RoleFlags {
  isMaster: boolean;
  isMinter: boolean;
  isBurner: boolean;
  isPauser: boolean;
  isFreezer: boolean;
  isBlacklister: boolean;
  isSeizer: boolean;
}

export interface TuiCapabilities {
  preset: "SSS-1" | "SSS-2" | "unknown";
  roles: RoleFlags;
  operations: OperationItem[];
}

export interface LogLink {
  signatureUrl?: string;
  addressUrl?: string;
}
