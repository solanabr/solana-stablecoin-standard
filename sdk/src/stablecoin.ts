import { BN, Wallet } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";

import { StablecoinClient } from "./client";
import { ComplianceClient } from "./compliance";
import {
  SSS_CORE_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
  PRESET_MINIMAL,
  PRESET_COMPLIANT,
  PRESET_CONFIDENTIAL,
} from "./constants";
import type {
  StablecoinConfig,
  MinterState,
  InitializeResult,
  BlacklistEntry,
  HookConfig,
} from "./types";
import { RoleType } from "./types";
import { validateCreateOptions } from "./validation";

/**
 * Preset identifiers matching the bounty-specified API surface.
 *
 * Usage:
 * ```ts
 * import { Presets } from "@sss/sdk";
 * const stable = await SolanaStablecoin.create(connection, {
 *   preset: Presets.SSS_1,
 *   ...
 * });
 * ```
 */
export enum Presets {
  /** SSS-1 Minimal: mint/freeze/pause, no compliance. */
  SSS_1 = PRESET_MINIMAL,
  /** SSS-2 Compliant: SSS-1 + permanent delegate + transfer hook + blacklist. */
  SSS_2 = PRESET_COMPLIANT,
  /** SSS-3 Confidential: SSS-2 + confidential transfers + allowlist (POC). */
  SSS_3 = PRESET_CONFIDENTIAL,
}

/**
 * Options accepted by `SolanaStablecoin.create()`.
 */
export interface CreateStablecoinOptions {
  /** Preset standard to deploy. */
  preset: Presets;
  /** Human-readable name (e.g. "USD Coin"). Max 32 chars. */
  name: string;
  /** Ticker symbol (e.g. "USDC"). Max 10 chars. */
  symbol: string;
  /** URI to off-chain metadata JSON. Max 200 chars. */
  uri?: string;
  /** Number of decimal places (0–9). Defaults to 6. */
  decimals?: number;
  /** Authority/admin wallet. Required — used as signer and initial authority. */
  authority: Wallet;
  /** Hook program ID. Required for SSS-2, ignored for SSS-1. */
  hookProgram?: PublicKey;
  /** Custom sss-core program ID. Defaults to deployed mainnet/devnet ID. */
  coreProgramId?: PublicKey;
  /** Custom sss-hook program ID. Defaults to deployed mainnet/devnet ID. */
  hookProgramId?: PublicKey;
}

/**
 * Compliance sub-object exposed on every SolanaStablecoin instance.
 *
 * For SSS-1 stablecoins, calling any compliance method throws a
 * descriptive error. For SSS-2, methods delegate to `ComplianceClient`.
 */
export class ComplianceModule {
  private readonly complianceClient: ComplianceClient | null;
  private readonly mint: PublicKey;

  constructor(
    complianceClient: ComplianceClient | null,
    mint: PublicKey,
  ) {
    this.complianceClient = complianceClient;
    this.mint = mint;
  }

  private requireCompliance(): ComplianceClient {
    if (!this.complianceClient) {
      throw new Error(
        "Compliance features require SSS-2 preset. " +
        "Initialize with preset: Presets.SSS_2 to enable blacklist and seize."
      );
    }
    return this.complianceClient;
  }

  /**
   * Initialize the transfer hook. Must be called after create() and before
   * the mint begins circulating.
   */
  async initializeHook(): Promise<string> {
    return this.requireCompliance().initializeHook(this.mint);
  }

  /** Add a wallet to the blacklist. Only callable by the blacklister role. */
  async blacklistAdd(wallet: PublicKey, reason: string): Promise<string> {
    return this.requireCompliance().addToBlacklist(this.mint, wallet, reason);
  }

  /** Remove a wallet from the blacklist. Only callable by the blacklister. */
  async blacklistRemove(wallet: PublicKey): Promise<string> {
    return this.requireCompliance().removeFromBlacklist(this.mint, wallet);
  }

  /** Check whether a wallet is currently blacklisted. */
  async isBlacklisted(wallet: PublicKey): Promise<boolean> {
    return this.requireCompliance().isBlacklisted(this.mint, wallet);
  }

  /** Fetch the full BlacklistEntry, or null if none exists. */
  async getBlacklistEntry(wallet: PublicKey): Promise<BlacklistEntry | null> {
    return this.requireCompliance().getBlacklistEntry(this.mint, wallet);
  }

  /** Seize tokens from source to destination via permanent delegate. */
  async seize(
    sourceTokenAccount: PublicKey,
    destinationTokenAccount: PublicKey,
    amount: BN,
  ): Promise<string> {
    return this.requireCompliance().seize(
      this.mint,
      sourceTokenAccount,
      destinationTokenAccount,
      amount,
    );
  }

  /** Fetch the HookConfig, or null if not yet initialized. */
  async getHookConfig(): Promise<HookConfig | null> {
    return this.requireCompliance().getHookConfig(this.mint);
  }
}

/**
 * SolanaStablecoin — the high-level facade matching the bounty-specified API.
 *
 * Wraps StablecoinClient (SSS-1) and ComplianceClient (SSS-2) behind a
 * single, ergonomic interface with a static `.create()` factory method.
 *
 * Usage:
 * ```ts
 * import { SolanaStablecoin, Presets } from "@sss/sdk";
 *
 * const stable = await SolanaStablecoin.create(connection, {
 *   preset: Presets.SSS_2,
 *   name: "My Stablecoin",
 *   symbol: "MYUSD",
 *   decimals: 6,
 *   authority: adminKeypair,
 * });
 *
 * await stable.mint({ recipient, amount: 1_000_000, minter });
 * await stable.compliance.blacklistAdd(address, "Sanctions match");
 * await stable.compliance.seize(frozenAccount, treasury, amount);
 * ```
 */
export class SolanaStablecoin {
  /** The Token-2022 mint address. */
  readonly mintAddress: PublicKey;
  /** The StablecoinConfig PDA. */
  readonly configAddress: PublicKey;
  /** The preset used to create this stablecoin. */
  readonly preset: Presets;
  /** Compliance operations (blacklist, seize). SSS-2 only — throws on SSS-1. */
  readonly compliance: ComplianceModule;

  private readonly client: StablecoinClient;
  private readonly complianceClient: ComplianceClient | null;

  private constructor(
    mint: PublicKey,
    config: PublicKey,
    preset: Presets,
    client: StablecoinClient,
    complianceClient: ComplianceClient | null,
  ) {
    this.mintAddress = mint;
    this.configAddress = config;
    this.preset = preset;
    this.client = client;
    this.complianceClient = complianceClient;
    this.compliance = new ComplianceModule(complianceClient, this.mintAddress);
  }

  /**
   * Create and initialize a new stablecoin on-chain.
   *
   * @param connection  Solana RPC connection.
   * @param options     Preset, name, symbol, authority, and optional overrides.
   * @returns           A fully initialized SolanaStablecoin instance.
   */
  static async create(
    connection: Connection,
    options: CreateStablecoinOptions,
  ): Promise<SolanaStablecoin> {
    // Validate plain-data fields at the SDK boundary
    validateCreateOptions(options as unknown as Record<string, unknown>);

    const coreProgramId = options.coreProgramId ?? SSS_CORE_PROGRAM_ID;
    const hookProgramId = options.hookProgramId ?? SSS_HOOK_PROGRAM_ID;
    const isCompliant = options.preset === Presets.SSS_2;

    // Determine hook program
    let hookProgram: PublicKey | undefined;
    if (isCompliant) {
      hookProgram = options.hookProgram ?? hookProgramId;
    }

    // Instantiate the appropriate client
    let client: StablecoinClient;
    let complianceClient: ComplianceClient | null = null;

    if (isCompliant) {
      complianceClient = new ComplianceClient(
        connection,
        options.authority,
        coreProgramId,
        hookProgramId,
      );
      client = complianceClient;
    } else {
      client = new StablecoinClient(connection, options.authority, coreProgramId);
    }

    // Initialize on-chain
    const result: InitializeResult = await client.initialize(
      {
        preset: options.preset,
        name: options.name,
        symbol: options.symbol,
        uri: options.uri ?? "",
        decimals: options.decimals ?? 6,
      },
      hookProgram,
    );

    return new SolanaStablecoin(
      result.mint,
      result.config,
      options.preset,
      client,
      complianceClient,
    );
  }

  /**
   * Attach to an existing stablecoin deployment without re-initializing.
   *
   * @param connection  Solana RPC connection.
   * @param mint        Existing stablecoin mint address.
   * @param wallet      Wallet to sign transactions with.
   * @param options     Optional program ID overrides.
   * @returns           A SolanaStablecoin instance bound to the existing mint.
   */
  static async load(
    connection: Connection,
    mint: PublicKey,
    wallet: Wallet,
    options?: {
      coreProgramId?: PublicKey;
      hookProgramId?: PublicKey;
    },
  ): Promise<SolanaStablecoin> {
    const coreProgramId = options?.coreProgramId ?? SSS_CORE_PROGRAM_ID;
    const hookProgramId = options?.hookProgramId ?? SSS_HOOK_PROGRAM_ID;

    // Fetch on-chain config to determine preset
    const client = new StablecoinClient(connection, wallet, coreProgramId);
    const cfg = await client.getConfig(mint);

    const isCompliant = cfg.preset >= PRESET_COMPLIANT;
    let complianceClient: ComplianceClient | null = null;
    let effectiveClient: StablecoinClient = client;

    if (isCompliant) {
      complianceClient = new ComplianceClient(
        connection,
        wallet,
        coreProgramId,
        hookProgramId,
      );
      effectiveClient = complianceClient;
    }

    const { findConfigPda } = await import("./pda");
    const [config] = findConfigPda(mint, coreProgramId);

    return new SolanaStablecoin(
      mint,
      config,
      isCompliant ? Presets.SSS_2 : Presets.SSS_1,
      effectiveClient,
      complianceClient,
    );
  }

  // ---------------------------------------------------------------------------
  // Core operations — delegate to underlying StablecoinClient
  // ---------------------------------------------------------------------------

  /** Configure or update a minter's quota. Only callable by master minter. */
  async configureMinter(minterWallet: PublicKey, quota: BN): Promise<string> {
    return this.client.configureMinter(this.mintAddress, minterWallet, quota);
  }

  /** Disable a minter. Preserves account for audit trail. */
  async removeMinter(minterWallet: PublicKey): Promise<string> {
    return this.client.removeMinter(this.mintAddress, minterWallet);
  }

  /** Mint tokens to a destination token account. */
  async mint(params: {
    recipient: PublicKey;
    amount: BN | number;
  }): Promise<string> {
    const amount = typeof params.amount === "number"
      ? new BN(params.amount)
      : params.amount;
    return this.client.mint(this.mintAddress, params.recipient, amount);
  }

  /** Burn tokens from the signer's ATA. */
  async burn(amount: BN | number): Promise<string> {
    const bn = typeof amount === "number" ? new BN(amount) : amount;
    return this.client.burn(this.mintAddress, bn);
  }

  /** Freeze a token account. Works even when paused. */
  async freezeAccount(tokenAccount: PublicKey): Promise<string> {
    return this.client.freezeAccount(this.mintAddress, tokenAccount);
  }

  /** Thaw a frozen token account. Works even when paused. */
  async thawAccount(tokenAccount: PublicKey): Promise<string> {
    return this.client.thawAccount(this.mintAddress, tokenAccount);
  }

  /** Pause all operations. Only callable by pauser. */
  async pause(): Promise<string> {
    return this.client.pause(this.mintAddress);
  }

  /** Unpause operations. Only callable by pauser. */
  async unpause(): Promise<string> {
    return this.client.unpause(this.mintAddress);
  }

  /** Update a role assignment. Only callable by authority. */
  async updateRole(role: RoleType, newAddress: PublicKey): Promise<string> {
    return this.client.updateRole(this.mintAddress, role, newAddress);
  }

  /** Initiate two-step authority transfer. */
  async transferAuthority(newAuthority: PublicKey): Promise<string> {
    return this.client.transferAuthority(this.mintAddress, newAuthority);
  }

  /** Accept a pending authority transfer. */
  async acceptAuthority(): Promise<string> {
    return this.client.acceptAuthority(this.mintAddress);
  }

  // ---------------------------------------------------------------------------
  // Query helpers
  // ---------------------------------------------------------------------------

  /** Fetch the on-chain StablecoinConfig. */
  async getConfig(): Promise<StablecoinConfig> {
    return this.client.getConfig(this.mintAddress);
  }

  /** Fetch a minter's state (quota, minted amount, enabled status). */
  async getMinterState(minterWallet: PublicKey): Promise<MinterState> {
    return this.client.getMinterState(this.mintAddress, minterWallet);
  }

  /** Get the current total supply (totalMinted - totalBurned). */
  async getTotalSupply(): Promise<BN> {
    const cfg = await this.getConfig();
    return cfg.totalMinted.sub(cfg.totalBurned);
  }
}
