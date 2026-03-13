/**
 * Stablecoin service — read/write operations against the on-chain program.
 * @module services/stablecoin
 */

import { Connection, PublicKey } from "@solana/web3.js";
import {
  fetchStablecoinConfig,
  fetchRoleManager,
  deriveConfigPda,
  deriveRolesPda,
  deriveBlacklistPda,
  fetchBlacklistEntry,
} from "@stbr/sss-token";
import type { StablecoinConfig, RoleManager, BlacklistEntry } from "@stbr/sss-token";

export class StablecoinService {
  private readonly connection: Connection;
  private readonly mintAddress: PublicKey;
  private readonly configPda: PublicKey;
  private readonly rolesPda: PublicKey;

  constructor(rpcUrl: string, mintAddress: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.mintAddress = new PublicKey(mintAddress);
    const [configPda] = deriveConfigPda(this.mintAddress);
    this.configPda = configPda;
    const [rolesPda] = deriveRolesPda(configPda);
    this.rolesPda = rolesPda;
  }

  /** Get stablecoin config */
  async getConfig(): Promise<StablecoinConfig> {
    return fetchStablecoinConfig(this.connection, this.configPda);
  }

  /** Get role assignments (returns null for SSS-1 minimal preset) */
  async getRoles(): Promise<RoleManager | null> {
    try {
      return await fetchRoleManager(this.connection, this.rolesPda);
    } catch {
      return null;
    }
  }

  /** Get supply info */
  async getSupply(): Promise<{ totalMinted: string; totalBurned: string; netSupply: string }> {
    const config = await this.getConfig();
    return {
      totalMinted: config.totalMinted.toString(),
      totalBurned: config.totalBurned.toString(),
      netSupply: (config.totalMinted - config.totalBurned).toString(),
    };
  }

  /** Check if address is blacklisted */
  async isBlacklisted(address: string): Promise<boolean> {
    const [blacklistPda] = deriveBlacklistPda(this.configPda, new PublicKey(address));
    const entry = await fetchBlacklistEntry(this.connection, blacklistPda);
    return entry !== null;
  }

  /** Get blacklist entry */
  async getBlacklistEntry(address: string): Promise<BlacklistEntry | null> {
    const [blacklistPda] = deriveBlacklistPda(this.configPda, new PublicKey(address));
    return fetchBlacklistEntry(this.connection, blacklistPda);
  }

  /** Get all blacklisted addresses */
  async getBlacklist(): Promise<BlacklistInfo[]> {
    try {
      const accounts = await this.connection.getProgramAccounts(
        new PublicKey("AcmGr2zw5RqMjuT1BN68Gk8gBhaFeF4piUXTyRQrVw3t"),
        {
          filters: [
            { memcmp: { offset: 0, bytes: "3" } }, // Blacklist discriminator hint
          ],
        }
      );
      // If getProgramAccounts works, parse entries
      return accounts.slice(0, 50).map((a) => ({
        address: a.pubkey.toBase58(),
        pda: a.pubkey.toBase58(),
      }));
    } catch {
      // Fallback: return empty (getProgramAccounts may not be available)
      return [];
    }
  }

  /** Get recent transactions for audit log */
  async getAuditLog(limit: number = 20): Promise<AuditEntry[]> {
    const sigs = await this.connection.getSignaturesForAddress(this.configPda, { limit });
    return sigs.map((sig) => ({
      signature: sig.signature,
      blockTime: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : null,
      status: sig.err ? "failed" : "success",
      memo: sig.memo ?? null,
    }));
  }

  /** Get token holders */
  async getHolders(): Promise<HolderEntry[]> {
    const { value: accounts } = await this.connection.getTokenLargestAccounts(this.mintAddress);
    return accounts.map((a) => ({
      address: a.address.toBase58(),
      amount: a.amount,
      decimals: a.decimals,
    }));
  }

  /** Get minter list with quotas */
  async getMinters(): Promise<MinterInfo[]> {
    const roles = await this.getRoles();
    if (!roles) return [];
    return roles.minters.map((m) => ({
      address: m.address.toBase58(),
      quota: m.quota.toString(),
      minted: m.minted.toString(),
      remaining: (m.quota - m.minted).toString(),
    }));
  }

  /** Get full status */
  async getStatus(): Promise<StatusResponse> {
    const [config, roles] = await Promise.all([this.getConfig(), this.getRoles()]);
    const supply = config.totalMinted - config.totalBurned;

    return {
      name: config.name,
      symbol: config.symbol,
      decimals: config.decimals,
      mint: config.mint.toBase58(),
      authority: config.authority.toBase58(),
      isPaused: config.isPaused,
      supply: {
        total: supply.toString(),
        minted: config.totalMinted.toString(),
        burned: config.totalBurned.toString(),
      },
      features: {
        permanentDelegate: config.enablePermanentDelegate,
        transferHook: config.enableTransferHook,
        confidentialTransfers: config.enableConfidentialTransfers,
        defaultAccountFrozen: config.defaultAccountFrozen,
      },
      roles: roles
        ? {
          masterAuthority: roles.masterAuthority.toBase58(),
          pauser: roles.pauser.toBase58(),
          blacklister: roles.blacklister.toBase58(),
          seizer: roles.seizer.toBase58(),
          minterCount: roles.minters.length,
          burnerCount: roles.burners.length,
        }
        : {
          masterAuthority: config.authority.toBase58(),
          pauser: "—",
          blacklister: "—",
          seizer: "—",
          minterCount: 0,
          burnerCount: 0,
        },
    };
  }
}

// ── Response Types ──────────────────────────────────────────────────────

export interface AuditEntry {
  signature: string;
  blockTime: string | null;
  status: "success" | "failed";
  memo: string | null;
}

export interface HolderEntry {
  address: string;
  amount: string;
  decimals: number;
}

export interface MinterInfo {
  address: string;
  quota: string;
  minted: string;
  remaining: string;
}

export interface StatusResponse {
  name: string;
  symbol: string;
  decimals: number;
  mint: string;
  authority: string;
  isPaused: boolean;
  supply: { total: string; minted: string; burned: string };
  features: {
    permanentDelegate: boolean;
    transferHook: boolean;
    confidentialTransfers: boolean;
    defaultAccountFrozen: boolean;
  };
  roles: {
    masterAuthority: string;
    pauser: string;
    blacklister: string;
    seizer: string;
    minterCount: number;
    burnerCount: number;
  };
}

export interface BlacklistInfo {
  address: string;
  pda: string;
}
