import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, Transaction } from "@solana/web3.js";
import type { SssCore } from "./idl/sss_core";
import type { SssTransferHook } from "./idl/sss_transfer_hook";
import { SssCoreIdl, SssTransferHookIdl } from "./idl";
import {
  deriveConfigPda,
  deriveRolePda,
  deriveBlacklistPda,
  SSS_CORE_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
} from "./pda";
import type {
  Preset,
  RoleType,
  StablecoinCreateOptions,
  StablecoinInfo,
} from "./types";
import { PRESET_MAP, REVERSE_PRESET_MAP, ROLE_MAP } from "./types";
import { mapAnchorError } from "./errors";
import * as coreix from "./instructions/core";
import * as hookix from "./instructions/hook";
import { createSss1MintTransaction } from "./presets/sss1";
import { createSss2MintTransaction } from "./presets/sss2";
import { createSss3MintTransaction } from "./presets/sss3";
import { ConfidentialOps } from "./confidential";

export class SSS {
  readonly mint: PublicKey;
  readonly configPda: PublicKey;
  readonly configBump: number;
  private coreProgram: Program<SssCore>;
  private hookProgram: Program<SssTransferHook>;
  private provider: AnchorProvider;

  private constructor(
    mint: PublicKey,
    configPda: PublicKey,
    configBump: number,
    coreProgram: Program<SssCore>,
    hookProgram: Program<SssTransferHook>,
    provider: AnchorProvider,
  ) {
    this.mint = mint;
    this.configPda = configPda;
    this.configBump = configBump;
    this.coreProgram = coreProgram;
    this.hookProgram = hookProgram;
    this.provider = provider;
  }

  // ---------------------------------------------------------------------------
  // Factory: create programs
  // ---------------------------------------------------------------------------

  private static createPrograms(
    provider: AnchorProvider,
    coreProgramId: PublicKey = SSS_CORE_PROGRAM_ID,
    hookProgramId: PublicKey = SSS_HOOK_PROGRAM_ID,
  ): { coreProgram: Program<SssCore>; hookProgram: Program<SssTransferHook> } {
    const coreProgram = new Program<SssCore>(
      SssCoreIdl as SssCore,
      provider,
    );
    const hookProgram = new Program<SssTransferHook>(
      SssTransferHookIdl as SssTransferHook,
      provider,
    );
    return { coreProgram, hookProgram };
  }

  // ---------------------------------------------------------------------------
  // Factory: create new stablecoin
  // ---------------------------------------------------------------------------

  /**
   * Create a new stablecoin from scratch.
   *
   * 1. Generates a mint keypair
   * 2. Builds the mint creation tx (per preset)
   * 3. Builds the sss-core initialize instruction
   * 4. Sends the transaction
   * 5. Returns an SSS instance
   */
  static async create(
    provider: AnchorProvider,
    options: StablecoinCreateOptions,
    mintKeypair?: Keypair,
  ): Promise<SSS> {
    const { coreProgram, hookProgram } = SSS.createPrograms(provider);
    const mint = mintKeypair ?? Keypair.generate();
    const payer = provider.publicKey;
    const decimals = options.decimals ?? 6;
    const supplyCap = options.supplyCap
      ? new BN(options.supplyCap.toString())
      : null;

    // Build mint creation transaction per preset
    let mintTx: Transaction;
    switch (options.preset) {
      case "sss-1":
        mintTx = await createSss1MintTransaction(
          provider.connection,
          payer,
          mint,
          {
            name: options.name,
            symbol: options.symbol,
            uri: options.uri,
            decimals,
          },
          coreProgram.programId,
        );
        break;
      case "sss-2":
        mintTx = await createSss2MintTransaction(
          provider.connection,
          payer,
          mint,
          {
            name: options.name,
            symbol: options.symbol,
            uri: options.uri,
            decimals,
          },
          coreProgram.programId,
        );
        break;
      case "sss-3":
        mintTx = await createSss3MintTransaction(
          provider.connection,
          payer,
          mint,
          {
            name: options.name,
            symbol: options.symbol,
            uri: options.uri,
            decimals,
          },
          coreProgram.programId,
        );
        break;
      default:
        throw new Error(`Unknown preset: ${options.preset}`);
    }

    // Build sss-core initialize instruction
    const initIx = await coreix.buildInitializeIx(
      coreProgram,
      mint.publicKey,
      payer,
      {
        preset: PRESET_MAP[options.preset],
        name: options.name,
        symbol: options.symbol,
        uri: options.uri ?? "",
        decimals,
        supplyCap,
      },
    );

    mintTx.add(initIx);

    // For SSS-2, also initialize extra account metas for the transfer hook
    if (options.preset === "sss-2") {
      const hookInitIx = await hookix.buildInitializeExtraAccountMetasIx(
        hookProgram,
        mint.publicKey,
        payer,
      );
      mintTx.add(hookInitIx);
    }

    try {
      await provider.sendAndConfirm(mintTx, [mint]);
    } catch (err) {
      throw mapAnchorError(err);
    }

    const [configPda, configBump] = deriveConfigPda(
      mint.publicKey,
      coreProgram.programId,
    );

    return new SSS(
      mint.publicKey,
      configPda,
      configBump,
      coreProgram,
      hookProgram,
      provider,
    );
  }

  // ---------------------------------------------------------------------------
  // Factory: load existing stablecoin
  // ---------------------------------------------------------------------------

  /**
   * Load an existing stablecoin by its mint address.
   * Verifies the config PDA exists on-chain.
   */
  static async load(
    provider: AnchorProvider,
    mint: PublicKey,
  ): Promise<SSS> {
    const { coreProgram, hookProgram } = SSS.createPrograms(provider);
    const [configPda, configBump] = deriveConfigPda(
      mint,
      coreProgram.programId,
    );

    // Verify config exists
    const configAccount =
      await coreProgram.account.stablecoinConfig.fetchNullable(configPda);
    if (!configAccount) {
      throw new Error(
        `No StablecoinConfig found for mint ${mint.toBase58()}`,
      );
    }

    return new SSS(
      mint,
      configPda,
      configBump,
      coreProgram,
      hookProgram,
      provider,
    );
  }

  // ---------------------------------------------------------------------------
  // Token operations
  // ---------------------------------------------------------------------------

  /**
   * Mint new tokens to a token account.
   * Caller must have the minter role.
   */
  async mintTokens(to: PublicKey, amount: bigint): Promise<string> {
    const minter = this.provider.publicKey;
    const ix = await coreix.buildMintTokensIx(
      this.coreProgram,
      this.mint,
      minter,
      to,
      new BN(amount.toString()),
    );
    try {
      return await this.provider.sendAndConfirm(
        new Transaction().add(ix),
      );
    } catch (err) {
      throw mapAnchorError(err);
    }
  }

  /**
   * Burn tokens from a token account.
   * Caller must have the minter role (minters can burn).
   */
  async burn(from: PublicKey, amount: bigint): Promise<string> {
    const burner = this.provider.publicKey;
    const ix = await coreix.buildBurnTokensIx(
      this.coreProgram,
      this.mint,
      burner,
      from,
      new BN(amount.toString()),
    );
    try {
      return await this.provider.sendAndConfirm(
        new Transaction().add(ix),
      );
    } catch (err) {
      throw mapAnchorError(err);
    }
  }

  /**
   * Freeze a token account.
   * Caller must have the freezer role.
   */
  async freeze(tokenAccount: PublicKey): Promise<string> {
    const freezer = this.provider.publicKey;
    const ix = await coreix.buildFreezeAccountIx(
      this.coreProgram,
      this.mint,
      freezer,
      tokenAccount,
    );
    try {
      return await this.provider.sendAndConfirm(
        new Transaction().add(ix),
      );
    } catch (err) {
      throw mapAnchorError(err);
    }
  }

  /**
   * Thaw a frozen token account.
   * Caller must have the freezer role.
   */
  async thaw(tokenAccount: PublicKey): Promise<string> {
    const freezer = this.provider.publicKey;
    const ix = await coreix.buildThawAccountIx(
      this.coreProgram,
      this.mint,
      freezer,
      tokenAccount,
    );
    try {
      return await this.provider.sendAndConfirm(
        new Transaction().add(ix),
      );
    } catch (err) {
      throw mapAnchorError(err);
    }
  }

  /**
   * Pause all operations.
   * Caller must have the pauser role.
   */
  async pause(): Promise<string> {
    const pauser = this.provider.publicKey;
    const ix = await coreix.buildPauseIx(
      this.coreProgram,
      this.configPda,
      pauser,
    );
    try {
      return await this.provider.sendAndConfirm(
        new Transaction().add(ix),
      );
    } catch (err) {
      throw mapAnchorError(err);
    }
  }

  /**
   * Unpause all operations.
   * Caller must have the pauser role.
   */
  async unpause(): Promise<string> {
    const pauser = this.provider.publicKey;
    const ix = await coreix.buildUnpauseIx(
      this.coreProgram,
      this.configPda,
      pauser,
    );
    try {
      return await this.provider.sendAndConfirm(
        new Transaction().add(ix),
      );
    } catch (err) {
      throw mapAnchorError(err);
    }
  }

  /**
   * Seize tokens from one account to another using permanent delegate.
   * Admin-only, works even when paused.
   */
  async seize(
    from: PublicKey,
    to: PublicKey,
    amount: bigint,
  ): Promise<string> {
    const admin = this.provider.publicKey;
    const ix = await coreix.buildSeizeIx(
      this.coreProgram,
      this.mint,
      admin,
      from,
      to,
      new BN(amount.toString()),
    );
    try {
      return await this.provider.sendAndConfirm(
        new Transaction().add(ix),
      );
    } catch (err) {
      throw mapAnchorError(err);
    }
  }

  /**
   * Update the supply cap. Admin-only.
   * Pass null to remove the cap.
   */
  async updateSupplyCap(newSupplyCap: bigint | null): Promise<string> {
    const admin = this.provider.publicKey;
    const capBN = newSupplyCap !== null
      ? new BN(newSupplyCap.toString())
      : null;
    const ix = await coreix.buildUpdateSupplyCapIx(
      this.coreProgram,
      this.configPda,
      admin,
      capBN,
    );
    try {
      return await this.provider.sendAndConfirm(
        new Transaction().add(ix),
      );
    } catch (err) {
      throw mapAnchorError(err);
    }
  }

  // ---------------------------------------------------------------------------
  // Info
  // ---------------------------------------------------------------------------

  /**
   * Fetch and return the on-chain stablecoin configuration.
   */
  async info(): Promise<StablecoinInfo> {
    const config =
      await this.coreProgram.account.stablecoinConfig.fetch(this.configPda);

    const totalMinted = BigInt(config.totalMinted.toString());
    const totalBurned = BigInt(config.totalBurned.toString());
    const supplyCap = config.supplyCap
      ? BigInt(config.supplyCap.toString())
      : null;

    return {
      mint: config.mint,
      authority: config.authority,
      preset: REVERSE_PRESET_MAP[config.preset] ?? ("sss-1" as Preset),
      paused: config.paused,
      supplyCap,
      totalMinted,
      totalBurned,
      currentSupply: totalMinted - totalBurned,
    };
  }

  // ---------------------------------------------------------------------------
  // Role management
  // ---------------------------------------------------------------------------

  roles = {
    /**
     * Grant a role to an address. Admin-only.
     */
    grant: async (address: PublicKey, role: RoleType): Promise<string> => {
      const admin = this.provider.publicKey;
      const ix = await coreix.buildGrantRoleIx(
        this.coreProgram,
        this.configPda,
        admin,
        address,
        role,
      );
      try {
        return await this.provider.sendAndConfirm(
          new Transaction().add(ix),
        );
      } catch (err) {
        throw mapAnchorError(err);
      }
    },

    /**
     * Revoke a role from an address. Admin-only.
     * Closes the role PDA and returns rent to the admin.
     */
    revoke: async (address: PublicKey, role: RoleType): Promise<string> => {
      const admin = this.provider.publicKey;
      const [roleAccountPda] = deriveRolePda(
        this.configPda,
        address,
        role,
        this.coreProgram.programId,
      );
      const ix = await coreix.buildRevokeRoleIx(
        this.coreProgram,
        this.configPda,
        admin,
        roleAccountPda,
      );
      try {
        return await this.provider.sendAndConfirm(
          new Transaction().add(ix),
        );
      } catch (err) {
        throw mapAnchorError(err);
      }
    },

    /**
     * Check if an address has a specific role.
     * Returns true if the role PDA exists on-chain.
     */
    check: async (address: PublicKey, role: RoleType): Promise<boolean> => {
      const [rolePda] = deriveRolePda(
        this.configPda,
        address,
        role,
        this.coreProgram.programId,
      );
      const account =
        await this.coreProgram.account.roleAccount.fetchNullable(rolePda);
      return account !== null;
    },
  };

  // ---------------------------------------------------------------------------
  // Blacklist management (SSS-2 only)
  // ---------------------------------------------------------------------------

  blacklist = {
    /**
     * Add an address to the blacklist. Admin-only.
     */
    add: async (address: PublicKey, reason: string): Promise<string> => {
      const authority = this.provider.publicKey;
      const ix = await hookix.buildAddToBlacklistIx(
        this.hookProgram,
        this.mint,
        authority,
        address,
        reason,
        this.coreProgram.programId,
      );
      try {
        return await this.provider.sendAndConfirm(
          new Transaction().add(ix),
        );
      } catch (err) {
        throw mapAnchorError(err);
      }
    },

    /**
     * Remove an address from the blacklist. Admin-only.
     */
    remove: async (address: PublicKey): Promise<string> => {
      const authority = this.provider.publicKey;
      const ix = await hookix.buildRemoveFromBlacklistIx(
        this.hookProgram,
        this.mint,
        authority,
        address,
        this.coreProgram.programId,
      );
      try {
        return await this.provider.sendAndConfirm(
          new Transaction().add(ix),
        );
      } catch (err) {
        throw mapAnchorError(err);
      }
    },

    /**
     * Check if an address is blacklisted.
     * Returns true if the blacklist PDA exists on-chain.
     */
    check: async (address: PublicKey): Promise<boolean> => {
      const [blacklistPda] = deriveBlacklistPda(
        this.mint,
        address,
        this.hookProgram.programId,
      );
      const account =
        await this.hookProgram.account.blacklistEntry.fetchNullable(
          blacklistPda,
        );
      return account !== null;
    },
  };

  // ---------------------------------------------------------------------------
  // SSS-3 confidential operations (placeholder)
  // ---------------------------------------------------------------------------

  confidential = {
    /**
     * Deposit tokens from public balance into confidential pending balance.
     * No ZK proofs required.
     */
    deposit: async (tokenAccount: PublicKey, amount: bigint, decimals: number): Promise<string> => {
      const ops = new ConfidentialOps(this.provider.connection, this.mint, this.provider.publicKey);
      const ix = ops.buildDepositInstruction(tokenAccount, amount, decimals);
      try {
        return await this.provider.sendAndConfirm(new Transaction().add(ix));
      } catch (err) {
        throw mapAnchorError(err);
      }
    },

    /**
     * Apply pending confidential balance to available confidential balance.
     * No ZK proofs required.
     */
    applyPending: async (tokenAccount: PublicKey): Promise<string> => {
      const ops = new ConfidentialOps(this.provider.connection, this.mint, this.provider.publicKey);
      const ix = ops.buildApplyPendingBalanceInstruction(tokenAccount);
      try {
        return await this.provider.sendAndConfirm(new Transaction().add(ix));
      } catch (err) {
        throw mapAnchorError(err);
      }
    },

    /**
     * Confidential transfer. Requires Rust proof service for ZK proof generation.
     * @throws Always throws - ZK proofs not available in TypeScript
     */
    transfer: async (_senderAccount: PublicKey, _recipientAccount: PublicKey, _amount: bigint): Promise<string> => {
      throw new Error("Confidential transfer requires Rust proof service. See docs/SSS-3.md");
    },

    /**
     * Confidential withdraw. Requires Rust proof service for ZK proof generation.
     * @throws Always throws - ZK proofs not available in TypeScript
     */
    withdraw: async (_tokenAccount: PublicKey, _amount: bigint, _decimals: number): Promise<string> => {
      throw new Error("Confidential withdraw requires Rust proof service. See docs/SSS-3.md");
    },
  };
}
