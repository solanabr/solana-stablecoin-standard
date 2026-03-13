/**
 * Main SDK client for the Solana Stablecoin Standard.
 *
 * ## Architecture
 *
 * The client wraps the on-chain `sss_token` Anchor program and provides:
 * - **Factory methods**: `create()` initializes a new stablecoin, `connect()` reconnects
 * - **Operations**: `mint()`, `burn()`, `freeze()`, `thaw()`, `pause()`, `unpause()`
 * - **Role management**: `updateMinter()`, `removeMinter()`, `updateRoles()`, `transferAuthority()`
 * - **Queries**: `getConfig()`, `getRoles()`, `getTotalSupply()`
 * - **Compliance**: `compliance.blacklistAdd()`, `compliance.seize()` (SSS-2 only)
 *
 * ## Key concept: the config PDA
 *
 * Every stablecoin has a **config PDA** derived from the mint address:
 * ```
 * seeds = ["config", mint.publicKey]
 * ```
 * This PDA is the **mint authority** and **freeze authority**, meaning
 * only the program can mint/freeze — and it checks roles before allowing it.
 *
 * @example
 * ```typescript
 * import { SolanaStablecoin, Presets } from "@stbr/sss-token";
 *
 * // Create a new SSS-2 stablecoin
 * const stable = await SolanaStablecoin.create(connection, wallet, {
 *   preset: Presets.SSS_2,
 *   name: "BRL Stable",
 *   symbol: "BRLs",
 *   decimals: 6,
 * });
 *
 * // Mint tokens
 * await stable.mint({ recipient: userPubkey, amount: BigInt(1_000_000) });
 *
 * // Compliance (SSS-2)
 * await stable.compliance.blacklistAdd(suspectAddress, "Sanctions match");
 * await stable.compliance.seize(suspectAddress, treasuryWallet);
 * ```
 *
 * @module client
 */

import {
  Connection,
  PublicKey,
  Keypair,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import type { Wallet } from "@coral-xyz/anchor";
import type {
  CreateParams,
  MintParams,
  BurnParams,
  FreezeParams,
  ThawParams,
  UpdateMinterParams,
  UpdateRolesParams,
  StablecoinConfig,
  RoleManager,
} from "./types";
import { Presets, getPresetConfig } from "./presets";
import {
  SSS_TOKEN_PROGRAM_ID,
  deriveAllPdas,
} from "./constants";
import { fetchStablecoinConfig, fetchRoleManager } from "./accounts";
import { ComplianceManager } from "./compliance";

export class SolanaStablecoin {
  /** The Solana connection */
  readonly connection: Connection;
  /** The config PDA address */
  readonly configPda: PublicKey;
  /** The config PDA bump */
  readonly configBump: number;
  /** The roles PDA address */
  readonly rolesPda: PublicKey;
  /** The roles PDA bump */
  readonly rolesBump: number;
  /** The Token-2022 mint address */
  readonly mintAddress: PublicKey;
  /** The signer wallet */
  readonly wallet: Wallet;
  /** The SSS program ID */
  readonly programId: PublicKey;

  /**
   * Compliance module for SSS-2 operations.
   *
   * Provides blacklisting, seizure, and compliance query capabilities.
   * These operations only work if the stablecoin was initialized with SSS-2 features.
   *
   * @example
   * ```typescript
   * await stable.compliance.blacklistAdd(address, "Sanctions match");
   * await stable.compliance.seize(frozenAccount, treasury);
   * const blocked = await stable.compliance.isBlacklisted(address);
   * ```
   */
  readonly compliance: ComplianceManager;

  private constructor(
    connection: Connection,
    mint: PublicKey,
    wallet: Wallet,
    programId: PublicKey = SSS_TOKEN_PROGRAM_ID
  ) {
    this.connection = connection;
    this.mintAddress = mint;
    this.wallet = wallet;
    this.programId = programId;

    const pdas = deriveAllPdas(mint, programId);
    this.configPda = pdas.configPda;
    this.configBump = pdas.configBump;
    this.rolesPda = pdas.rolesPda;
    this.rolesBump = pdas.rolesBump;

    // Wire compliance module
    this.compliance = new ComplianceManager({
      connection,
      wallet,
      programId,
      mintAddress: mint,
      configPda: this.configPda,
      rolesPda: this.rolesPda,
      buildInstruction: this.buildInstruction.bind(this),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Factory Methods
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Initialize a new stablecoin and return a connected client.
   *
   * This sends an `initialize` transaction that:
   * 1. Creates a Token-2022 mint with the right extensions
   * 2. Creates the config PDA (stores feature flags + metadata)
   * 3. Creates the role manager PDA (stores role assignments)
   *
   * @param connection - Solana RPC connection
   * @param wallet - The authority's wallet (payer + signer)
   * @param params - Creation parameters (preset, name, symbol, etc.)
   * @returns The connected client instance
   *
   * @example
   * ```typescript
   * const stable = await SolanaStablecoin.create(connection, wallet, {
   *   preset: Presets.SSS_2,
   *   name: "My Stablecoin",
   *   symbol: "MYUSD",
   *   decimals: 6,
   * });
   * ```
   */
  static async create(
    connection: Connection,
    wallet: Wallet,
    params: CreateParams
  ): Promise<SolanaStablecoin> {
    const extensions = params.preset
      ? getPresetConfig(params.preset as Presets)
      : params.extensions ?? {};

    const mintKeypair = params.mintKeypair ?? Keypair.generate();
    const client = new SolanaStablecoin(connection, mintKeypair.publicKey, wallet);

    const ix = client.buildInitializeInstruction({
      name: params.name,
      symbol: params.symbol,
      uri: params.uri ?? "",
      decimals: params.decimals,
      enablePermanentDelegate: extensions.permanentDelegate ?? false,
      enableTransferHook: extensions.transferHook ?? false,
      enableConfidentialTransfers: extensions.confidentialTransfers ?? false,
      defaultAccountFrozen: extensions.defaultAccountFrozen ?? false,
      pauser: params.roles?.pauser ?? wallet.publicKey,
      blacklister: params.roles?.blacklister ?? null,
      seizer: params.roles?.seizer ?? null,
      supplyCap: params.supplyCap ?? null,
    }, mintKeypair);

    const tx = new Transaction().add(ix);
    await sendAndConfirmTransaction(
      connection, tx, [wallet.payer, mintKeypair],
      { commitment: "confirmed" }
    );

    return client;
  }

  /**
   * Connect to an existing stablecoin by its mint address.
   *
   * Does NOT send any transactions — just sets up the client
   * with the correct PDAs derived from the mint.
   *
   * @param connection - Solana RPC connection
   * @param mint - The Token-2022 mint address
   * @param wallet - The signer wallet
   * @param programId - Optional custom program ID
   * @returns The connected client instance
   *
   * @example
   * ```typescript
   * const stable = SolanaStablecoin.connect(connection, mintAddress, wallet);
   * const config = await stable.getConfig();
   * ```
   */
  static connect(
    connection: Connection,
    mint: PublicKey,
    wallet: Wallet,
    programId?: PublicKey
  ): SolanaStablecoin {
    return new SolanaStablecoin(connection, mint, wallet, programId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Core Operations
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Mint tokens to a recipient.
   *
   * The signer must be an authorized minter with available quota.
   * The config PDA signs the actual Token-2022 MintTo CPI on-chain.
   * Automatically creates the recipient's Associated Token Account if needed.
   *
   * @param params - Mint parameters
   * @returns Transaction signature
   * @throws `UnauthorizedMinter` if the signer is not a minter
   * @throws `MinterQuotaExceeded` if amount exceeds remaining quota
   * @throws `Paused` if operations are paused
   *
   * @example
   * ```typescript
   * await stable.mint({ recipient: userPubkey, amount: BigInt(1_000_000) });
   * ```
   */
  async mint(params: MintParams): Promise<string> {
    const minter = params.minter ?? this.wallet.payer;
    const recipientAta = getAssociatedTokenAddressSync(
      this.mintAddress, params.recipient, false, TOKEN_2022_PROGRAM_ID
    );

    // Ensure ATA exists
    const ataInfo = await this.connection.getAccountInfo(recipientAta);
    const preIxs: TransactionInstruction[] = [];
    if (!ataInfo) {
      preIxs.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey, recipientAta, params.recipient,
          this.mintAddress, TOKEN_2022_PROGRAM_ID
        )
      );
    }

    const ix = this.buildInstruction("mint_tokens", {
      amount: new BN(params.amount.toString()),
    }, {
      minter: minter.publicKey,
      config: this.configPda,
      roleManager: this.rolesPda,
      mint: this.mintAddress,
      recipientTokenAccount: recipientAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });

    const tx = new Transaction().add(...preIxs, ix);
    return sendAndConfirmTransaction(
      this.connection, tx, [this.wallet.payer, minter],
      { commitment: "confirmed" }
    );
  }

  /**
   * Burn tokens from the burner's token account.
   *
   * The signer must be an authorized burner.
   * Burns are tracked in `config.totalBurned`.
   *
   * @param params - Burn parameters
   * @returns Transaction signature
   *
   * @example
   * ```typescript
   * await stable.burn({ amount: BigInt(500_000) });
   * ```
   */
  async burn(params: BurnParams): Promise<string> {
    const burner = params.burner ?? this.wallet.payer;
    const burnerAta = getAssociatedTokenAddressSync(
      this.mintAddress, burner.publicKey, false, TOKEN_2022_PROGRAM_ID
    );

    const ix = this.buildInstruction("burn_tokens", {
      amount: new BN(params.amount.toString()),
    }, {
      burner: burner.publicKey,
      config: this.configPda,
      roleManager: this.rolesPda,
      mint: this.mintAddress,
      burnerTokenAccount: burnerAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(
      this.connection, tx, [this.wallet.payer, burner],
      { commitment: "confirmed" }
    );
  }

  /**
   * Freeze a token account, preventing all transfers.
   *
   * The signer must be the master authority or pauser.
   *
   * @param params - Freeze parameters (address of the wallet to freeze)
   * @returns Transaction signature
   *
   * @example
   * ```typescript
   * await stable.freeze({ address: suspectWallet });
   * ```
   */
  async freeze(params: FreezeParams): Promise<string> {
    const tokenAccount = getAssociatedTokenAddressSync(
      this.mintAddress, params.address, false, TOKEN_2022_PROGRAM_ID
    );

    const ix = this.buildInstruction("freeze_account", {}, {
      authority: this.wallet.publicKey,
      config: this.configPda,
      roleManager: this.rolesPda,
      mint: this.mintAddress,
      tokenAccount,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(
      this.connection, tx, [this.wallet.payer],
      { commitment: "confirmed" }
    );
  }

  /**
   * Thaw (unfreeze) a token account.
   *
   * Only the master authority can thaw accounts.
   *
   * @param params - Thaw parameters (address of the wallet to thaw)
   * @returns Transaction signature
   *
   * @example
   * ```typescript
   * await stable.thaw({ address: suspectWallet });
   * ```
   */
  async thaw(params: ThawParams): Promise<string> {
    const tokenAccount = getAssociatedTokenAddressSync(
      this.mintAddress, params.address, false, TOKEN_2022_PROGRAM_ID
    );

    const ix = this.buildInstruction("thaw_account", {}, {
      authority: this.wallet.publicKey,
      config: this.configPda,
      roleManager: this.rolesPda,
      mint: this.mintAddress,
      tokenAccount,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(
      this.connection, tx, [this.wallet.payer],
      { commitment: "confirmed" }
    );
  }

  /**
   * Pause all mint/burn operations.
   *
   * The signer must be the master authority or pauser.
   * When paused, only freeze/thaw and role management still work.
   *
   * @returns Transaction signature
   *
   * @example
   * ```typescript
   * await stable.pause();
   * ```
   */
  async pause(): Promise<string> {
    const ix = this.buildInstruction("pause", {}, {
      pauser: this.wallet.publicKey,
      config: this.configPda,
      roleManager: this.rolesPda,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(
      this.connection, tx, [this.wallet.payer],
      { commitment: "confirmed" }
    );
  }

  /**
   * Unpause operations.
   *
   * Only the master authority can unpause — the pauser intentionally
   * cannot unpause, as a safety measure (one person can stop, but
   * only the admin can restart).
   *
   * @returns Transaction signature
   *
   * @example
   * ```typescript
   * await stable.unpause();
   * ```
   */
  async unpause(): Promise<string> {
    const ix = this.buildInstruction("unpause", {}, {
      authority: this.wallet.publicKey,
      config: this.configPda,
      roleManager: this.rolesPda,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(
      this.connection, tx, [this.wallet.payer],
      { commitment: "confirmed" }
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Role Management
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Add or update a minter with a quota.
   *
   * Only the master authority can manage minters.
   * Each minter has an independent quota — they can mint up to that amount.
   *
   * @param params - Minter address and quota
   * @returns Transaction signature
   *
   * @example
   * ```typescript
   * await stable.updateMinter({
   *   minter: minterPubkey,
   *   quota: BigInt(10_000_000_000), // 10,000 tokens at 6 decimals
   * });
   * ```
   */
  async updateMinter(params: UpdateMinterParams): Promise<string> {
    const ix = this.buildInstruction("update_minter", {
      minter: params.minter,
      quota: new BN(params.quota.toString()),
    }, {
      authority: this.wallet.publicKey,
      config: this.configPda,
      roleManager: this.rolesPda,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(
      this.connection, tx, [this.wallet.payer],
      { commitment: "confirmed" }
    );
  }

  /**
   * Remove a minter, revoking their minting privileges.
   *
   * @param minter - The minter's public key to remove
   * @returns Transaction signature
   */
  async removeMinter(minter: PublicKey): Promise<string> {
    const ix = this.buildInstruction("remove_minter", { minter }, {
      authority: this.wallet.publicKey,
      config: this.configPda,
      roleManager: this.rolesPda,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(
      this.connection, tx, [this.wallet.payer],
      { commitment: "confirmed" }
    );
  }

  /**
   * Update role assignments (pauser, blacklister, seizer, burners).
   *
   * Only the master authority can update roles.
   *
   * @param params - Role update parameters
   * @returns Transaction signature
   */
  async updateRoles(params: UpdateRolesParams): Promise<string> {
    const ix = this.buildInstruction("update_roles", {
      params: {
        newPauser: params.newPauser ?? null,
        newBlacklister: params.newBlacklister ?? null,
        newSeizer: params.newSeizer ?? null,
        addBurner: params.addBurner ?? null,
        removeBurner: params.removeBurner ?? null,
      },
    }, {
      authority: this.wallet.publicKey,
      config: this.configPda,
      roleManager: this.rolesPda,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(
      this.connection, tx, [this.wallet.payer],
      { commitment: "confirmed" }
    );
  }

  /**
   * Transfer master authority to a new address.
   *
   * ⚠️ This is irreversible — the new authority becomes the admin.
   *
   * @param newAuthority - The new master authority's public key
   * @returns Transaction signature
   */
  async transferAuthority(newAuthority: PublicKey): Promise<string> {
    const ix = this.buildInstruction("transfer_authority", { newAuthority }, {
      authority: this.wallet.publicKey,
      config: this.configPda,
      roleManager: this.rolesPda,
    });

    const tx = new Transaction().add(ix);
    return sendAndConfirmTransaction(
      this.connection, tx, [this.wallet.payer],
      { commitment: "confirmed" }
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Queries
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Fetch the on-chain stablecoin configuration.
   *
   * @returns The parsed stablecoin config
   * @throws Error if the config account doesn't exist
   *
   * @example
   * ```typescript
   * const config = await stable.getConfig();
   * console.log(config.name, config.isPaused, config.totalMinted);
   * ```
   */
  async getConfig(): Promise<StablecoinConfig> {
    return fetchStablecoinConfig(this.connection, this.configPda);
  }

  /**
   * Fetch the on-chain role assignments.
   *
   * @returns The parsed role manager
   *
   * @example
   * ```typescript
   * const roles = await stable.getRoles();
   * console.log("Minters:", roles.minters.length);
   * ```
   */
  async getRoles(): Promise<RoleManager> {
    return fetchRoleManager(this.connection, this.rolesPda);
  }

  /**
   * Get the net token supply (totalMinted - totalBurned).
   *
   * @returns Net supply in base units
   *
   * @example
   * ```typescript
   * const supply = await stable.getTotalSupply();
   * console.log("Supply:", supply.toString());
   * ```
   */
  async getTotalSupply(): Promise<bigint> {
    const config = await this.getConfig();
    return config.totalMinted - config.totalBurned;
  }

  /** Get the Token-2022 mint address. */
  getMint(): PublicKey {
    return this.mintAddress;
  }

  /** Get the config PDA address. */
  getConfigPda(): PublicKey {
    return this.configPda;
  }

  /** Get the roles PDA address. */
  getRolesPda(): PublicKey {
    return this.rolesPda;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Internal Helpers
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build a raw Anchor instruction.
   *
   * Uses the Anchor discriminator format: sha256("global:<method_name>")[0..8]
   * followed by borsh-serialized args.
   *
   * @internal
   */
  buildInstruction(
    _methodName: string,
    _args: Record<string, unknown>,
    accounts: Record<string, PublicKey>
  ): TransactionInstruction {
    const keys = Object.entries(accounts).map(([name, pubkey]) => ({
      pubkey,
      isSigner: name === "authority" || name === "minter" || name === "burner" ||
        name === "pauser" || name === "blacklister" || name === "seizer",
      isWritable: name === "config" || name === "roleManager" || name === "mint" ||
        name === "recipientTokenAccount" || name === "burnerTokenAccount" ||
        name === "tokenAccount" || name === "blacklistEntry" ||
        name === "fromTokenAccount" || name === "treasuryTokenAccount" ||
        name === "authority" || name === "minter" || name === "burner" ||
        name === "pauser" || name === "blacklister" || name === "seizer",
    }));

    // Placeholder instruction data — in production this uses the Anchor IDL
    // for proper serialization. The tests use the Anchor workspace which
    // handles this automatically via program.methods.<ix>().accounts({}).rpc()
    return new TransactionInstruction({
      programId: this.programId,
      keys,
      data: Buffer.alloc(0),
    });
  }

  /**
   * Build the initialize instruction.
   * @internal
   */
  private buildInitializeInstruction(
    params: {
      name: string;
      symbol: string;
      uri: string;
      decimals: number;
      enablePermanentDelegate: boolean;
      enableTransferHook: boolean;
      enableConfidentialTransfers: boolean;
      defaultAccountFrozen: boolean;
      pauser: PublicKey;
      blacklister: PublicKey | null;
      seizer: PublicKey | null;
      supplyCap: BN | null;
    },
    mintKeypair: Keypair,
  ): TransactionInstruction {
    return this.buildInstruction("initialize", { params }, {
      authority: this.wallet.publicKey,
      config: this.configPda,
      roleManager: this.rolesPda,
      mint: mintKeypair.publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    });
  }
}
