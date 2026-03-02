/**
 * High-level factory API for creating stablecoins.
 * Provides a clean, opinionated interface over SssClient.
 *
 * @example
 * ```ts
 * // SSS-1: Minimal stablecoin
 * const result = await SolanaStablecoin.create(provider, {
 *   name: 'ACME USD',
 *   symbol: 'AUSD',
 *   uri: 'https://acme.com/token.json',
 *   preset: StablecoinPreset.SSS1,
 * });
 *
 * // Mint $100
 * await result.mint(recipientAta, new BN(100_000_000)); // 100 AUSD (6 decimals)
 *
 * // SSS-2: Compliance stablecoin with blacklist
 * const compliant = await SolanaStablecoin.create(provider, {
 *   name: 'Regulated USD',
 *   symbol: 'RUSD',
 *   uri: 'https://bank.com/token.json',
 *   preset: StablecoinPreset.SSS2,
 * });
 *
 * // Blacklist a wallet
 * await compliant.compliance.blacklistAdd(badActor);
 *
 * // Seize their tokens
 * await compliant.compliance.seize(badActorAta, myAta, amount);
 * ```
 */

import { AnchorProvider, BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { SssClient } from './sss-client';
import { StablecoinPreset, InitializeParams, InitializeResult, UpdateRolesParams } from './types';

export { StablecoinPreset };

export class SolanaStablecoin {
  private client: SssClient;
  public readonly mintAddress: PublicKey;

  private constructor(client: SssClient, mintAddress: PublicKey) {
    this.client = client;
    this.mintAddress = mintAddress;
  }

  /** Create a new stablecoin with SSS-1 or SSS-2 preset */
  static async create(
    provider: AnchorProvider,
    params: InitializeParams,
  ): Promise<SolanaStablecoin> {
    const client = new SssClient(provider);
    const result = await client.initialize(params);
    return new SolanaStablecoin(client, result.mint);
  }

  /** Initialize a new stablecoin and return full result details */
  static async initialize(
    provider: AnchorProvider,
    params: InitializeParams,
  ): Promise<InitializeResult> {
    const client = new SssClient(provider);
    return client.initialize(params);
  }

  /** Load an existing stablecoin by mint address */
  static load(provider: AnchorProvider, mintAddress: PublicKey): SolanaStablecoin {
    const client = new SssClient(provider);
    return new SolanaStablecoin(client, mintAddress);
  }

  // ─── Token Operations ────────────────────────────────────────────────────

  /** Mint tokens to a destination account */
  async mint(destination: PublicKey, amount: BN): Promise<string> {
    return this.client.mint(this.mintAddress, destination, amount);
  }

  /** Burn tokens from a source account */
  async burn(source: PublicKey, amount: BN): Promise<string> {
    return this.client.burn(this.mintAddress, source, amount);
  }

  /** Freeze a token account */
  async freeze(tokenAccount: PublicKey): Promise<string> {
    return this.client.freeze(this.mintAddress, tokenAccount);
  }

  /** Unfreeze a token account */
  async thaw(tokenAccount: PublicKey): Promise<string> {
    return this.client.thaw(this.mintAddress, tokenAccount);
  }

  /** Pause all transfers */
  async pause(): Promise<string> {
    return this.client.pause(this.mintAddress);
  }

  /** Unpause transfers */
  async unpause(): Promise<string> {
    return this.client.unpause(this.mintAddress);
  }

  /** Get total token supply */
  async getTotalSupply(): Promise<bigint> {
    return this.client.getTotalSupply(this.mintAddress);
  }

  /** Get or create an associated token account */
  async getOrCreateAta(owner: PublicKey): Promise<PublicKey> {
    return this.client.getOrCreateAta(this.mintAddress, owner);
  }

  /** Get configuration */
  async getConfig() {
    return this.client.getConfig(this.mintAddress);
  }

  /** Get roles */
  async getRoles() {
    return this.client.getRoles(this.mintAddress);
  }

  // ─── Administration ──────────────────────────────────────────────────────

  /** Update roles (requires master_authority) */
  async updateRoles(params: UpdateRolesParams): Promise<string> {
    return this.client.updateRoles(this.mintAddress, params);
  }

  /** Transfer master authority */
  async transferAuthority(newAuthority: PublicKey): Promise<string> {
    return this.client.transferAuthority(this.mintAddress, newAuthority);
  }

  // ─── SSS-2 Compliance (fluent namespace) ─────────────────────────────────

  get compliance() {
    const client = this.client;
    const mintAddress = this.mintAddress;
    return {
      /** Add address to blacklist */
      blacklistAdd: (target: PublicKey, reason?: number) =>
        client.addToBlacklist(mintAddress, target, reason),

      /** Remove address from blacklist */
      blacklistRemove: (target: PublicKey) =>
        client.removeFromBlacklist(mintAddress, target),

      /** Check if address is blacklisted */
      isBlacklisted: (address: PublicKey) =>
        client.isBlacklisted(mintAddress, address),

      /** Seize tokens from a target using permanent delegate */
      seize: (source: PublicKey, destination: PublicKey, amount: BN) =>
        client.seize(mintAddress, source, destination, amount),
    };
  }
}
