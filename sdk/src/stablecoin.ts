import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { createHash } from "node:crypto";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import {
  Preset,
  BackingType,
  BankingRail,
  FiatCurrency,
  Roles,
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "./types";
import {
  deriveConfigPda,
  deriveRolesPda,
  deriveBlacklistPda,
  deriveMintRequestPda,
  deriveRedemptionPda,
} from "./pda";

// ============================================================================
// INTERFACES
// ============================================================================

export interface StablecoinConfig {
  authority: PublicKey;
  mint: PublicKey;
  preset: Preset;
  name: string;
  symbol: string;
  decimals: number;
  isPaused: boolean;
  supplyCap: bigint;
  totalMinted: bigint;
  totalBurned: bigint;
  backingType: BackingType;
  bankingRail: BankingRail;
  reserveAccount: PublicKey | null;
  oracle: PublicKey | null;
}

export interface InitializeParams {
  name: string;
  symbol: string;
  decimals: number;
  preset: Preset;
  supplyCap: bigint;
  uri: string;
  hookProgramId?: PublicKey;
  backingType: BackingType;
  bankingRail: BankingRail;
  oracle?: PublicKey;
}

export interface MintFromBankParams {
  amount: bigint;
  fiatAmount: bigint;
  fiatCurrency: FiatCurrency;
  referenceId: Uint8Array; // 32 bytes
}

export interface RedeemToBankParams {
  amount: bigint;
  bankAccountHash: Uint8Array; // 32 bytes
}

export interface RemainingAccountMeta {
  pubkey: PublicKey;
  isWritable?: boolean;
  isSigner?: boolean;
}

// ============================================================================
// PRESET CONFIGURATIONS
// ============================================================================

export const Presets = {
  /**
   * SSS-1: Minimal Stablecoin
   * - Mint authority + freeze authority + metadata
   * - What's needed on every stablecoin, nothing more
   */
  SSS_1: (params: Partial<InitializeParams>): InitializeParams => ({
    name: params.name || "Minimal Stablecoin",
    symbol: params.symbol || "MSTB",
    decimals: params.decimals ?? 6,
    preset: Preset.SSS1,
    supplyCap: params.supplyCap ?? BigInt(1_000_000_000_000_000), // 1B tokens
    uri: params.uri || "",
    backingType: params.backingType ?? BackingType.Fiat,
    bankingRail: params.bankingRail ?? BankingRail.None,
    oracle: params.oracle,
  }),

  /**
   * SSS-2: Compliant Stablecoin
   * - SSS-1 + permanent delegate + transfer hook + blacklist enforcement
   * - For regulated stablecoins (USDC/USDT-class)
   */
  SSS_2: (params: Partial<InitializeParams>): InitializeParams => ({
    name: params.name || "Compliant Stablecoin",
    symbol: params.symbol || "CSTB",
    decimals: params.decimals ?? 6,
    preset: Preset.SSS2,
    supplyCap: params.supplyCap ?? BigInt(1_000_000_000_000_000),
    uri: params.uri || "",
    hookProgramId: params.hookProgramId ?? SSS_TRANSFER_HOOK_PROGRAM_ID,
    backingType: params.backingType ?? BackingType.Fiat,
    bankingRail: params.bankingRail ?? BankingRail.Swift,
    oracle: params.oracle,
  }),

  /**
   * SSS-3: Private Stablecoin
   * - SSS-2 + confidential transfers
   * - Experimental - for privacy-preserving stablecoins
   */
  SSS_3: (params: Partial<InitializeParams>): InitializeParams => ({
    name: params.name || "Private Stablecoin",
    symbol: params.symbol || "PSTB",
    decimals: params.decimals ?? 6,
    preset: Preset.SSS3,
    supplyCap: params.supplyCap ?? BigInt(1_000_000_000_000_000),
    uri: params.uri || "",
    hookProgramId: params.hookProgramId ?? SSS_TRANSFER_HOOK_PROGRAM_ID,
    backingType: params.backingType ?? BackingType.Fiat,
    bankingRail: params.bankingRail ?? BankingRail.Swift,
    oracle: params.oracle,
  }),
};

// ============================================================================
// MAIN SDK CLASS
// ============================================================================

export class SolanaStablecoin {
  readonly connection: Connection;
  readonly mintAddress: PublicKey;
  readonly config: PublicKey;
  readonly configBump: number;
  private _configData: StablecoinConfig | null = null;

  private constructor(
    connection: Connection,
    mint: PublicKey,
    config: PublicKey,
    configBump: number
  ) {
    this.connection = connection;
    this.mintAddress = mint;
    this.config = config;
    this.configBump = configBump;
  }

  // ==========================================================================
  // FACTORY METHODS
  // ==========================================================================

  /**
   * Create a new stablecoin with the specified parameters.
   * Requires a Keypair authority (CLI / server-side use).
   * For browser/wallet-adapter use, call buildCreateTransaction() instead.
   */
  static async create(
    connection: Connection,
    params: InitializeParams,
    authority: Keypair,
    mintKeypair?: Keypair
  ): Promise<{ stablecoin: SolanaStablecoin; tx: string }> {
    const mint = mintKeypair || Keypair.generate();
    const [config, configBump] = deriveConfigPda(mint.publicKey);

    // Build initialize instruction
    const ix = this.buildInitializeInstruction(
      authority.publicKey,
      mint.publicKey,
      config,
      params
    );

    const tx = new Transaction().add(ix);
    const sig = await connection.sendTransaction(tx, [authority, mint]);
    await connection.confirmTransaction(sig);

    const stablecoin = new SolanaStablecoin(
      connection,
      mint.publicKey,
      config,
      configBump
    );

    return { stablecoin, tx: sig };
  }

  /**
   * Build an unsigned initialize Transaction for wallet-adapter signing.
   *
   * The wallet public key becomes the on-chain authority — no Keypair needed.
   * All roles (MINTER, BURNER, PAUSER, FREEZER, BLACKLISTER, SEIZER) are
   * granted to the authority in the same transaction so the stablecoin is
   * immediately operational after a single wallet signature.
   *
   * The returned mintKeypair must partialSign the tx before wallet signs:
   *
   *   const { tx, mintKeypair } = SolanaStablecoin.buildCreateTransaction(...)
   *   tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
   *   tx.feePayer = walletPublicKey;
   *   tx.partialSign(mintKeypair);
   *   const signed = await wallet.signTransaction(tx);
   *   await connection.sendRawTransaction(signed.serialize());
   */
  static buildCreateTransaction(
    params: InitializeParams,
    authorityPubkey: PublicKey,
    mintKeypair?: Keypair
  ): { tx: Transaction; mintKeypair: Keypair; mintAddress: PublicKey } {
    const mint = mintKeypair ?? Keypair.generate();
    const [config] = deriveConfigPda(mint.publicKey);

    // 1. Initialize instruction
    const initIx = this.buildInitializeInstruction(
      authorityPubkey,
      mint.publicKey,
      config,
      params
    );

    // 2. Grant all roles to the authority in the same tx so it's operational
    //    immediately — no second transaction needed.
    const [authorityRoles] = deriveRolesPda(config, authorityPubkey);
    const roleKeys = Object.keys(Roles) as Array<keyof typeof Roles>;
    const roleIxs = roleKeys.map((roleKey) =>
      this.buildUpdateRolesInstructionStatic(
        authorityPubkey,
        config,
        authorityRoles,
        authorityPubkey,
        Roles[roleKey],
        true
      )
    );

    const tx = new Transaction().add(initIx, ...roleIxs);

    return {
      tx,
      mintKeypair: mint,
      mintAddress: mint.publicKey,
    };
  }

  /**
   * Build a transaction that grants ALL roles to a target address.
   * Useful for setting up a new operator wallet after initial creation.
   */
  static buildGrantAllRolesTransaction(
    config: PublicKey,
    authorityPubkey: PublicKey,
    targetPubkey: PublicKey
  ): Transaction {
    const [targetRoles] = deriveRolesPda(config, targetPubkey);
    const roleKeys = Object.keys(Roles) as Array<keyof typeof Roles>;
    const ixs = roleKeys.map((roleKey) =>
      this.buildUpdateRolesInstructionStatic(
        authorityPubkey,
        config,
        targetRoles,
        targetPubkey,
        Roles[roleKey],
        true
      )
    );
    return new Transaction().add(...ixs);
  }

  // Static version of buildUpdateRolesInstruction for use in static methods
  private static buildUpdateRolesInstructionStatic(
    authority: PublicKey,
    config: PublicKey,
    targetRoles: PublicKey,
    target: PublicKey,
    role: number,
    active: boolean
  ): TransactionInstruction {
    const data = this.encodeInstruction("update_roles", [
      this.encodePubkey(target),
      this.encodeU8(role),
      this.encodeBool(active),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: target, isSigner: false, isWritable: false },
        { pubkey: targetRoles, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  /**
   * Load an existing stablecoin by mint address
   */
  static async load(
    connection: Connection,
    mint: PublicKey
  ): Promise<SolanaStablecoin> {
    const [config, configBump] = deriveConfigPda(mint);

    const stablecoin = new SolanaStablecoin(
      connection,
      mint,
      config,
      configBump
    );

    // Verify the config exists
    await stablecoin.getConfig();

    return stablecoin;
  }

  // ==========================================================================
  // READ METHODS
  // ==========================================================================

  /**
   * Get the stablecoin configuration
   */
  async getConfig(): Promise<StablecoinConfig> {
    if (this._configData) return this._configData;

    const accountInfo = await this.connection.getAccountInfo(this.config);
    if (!accountInfo) {
      throw new Error("Stablecoin config not found");
    }

    this._configData = this.parseConfigAccount(accountInfo.data);
    return this._configData;
  }

  /**
   * Get total supply (minted - burned)
   */
  async getTotalSupply(): Promise<bigint> {
    const config = await this.getConfig();
    return config.totalMinted - config.totalBurned;
  }

  /**
   * Check if an address is blacklisted
   */
  async isBlacklisted(address: PublicKey): Promise<boolean> {
    const [blacklistPda] = deriveBlacklistPda(this.config, address);
    const accountInfo = await this.connection.getAccountInfo(blacklistPda);
    return accountInfo !== null;
  }

  /**
   * Get token balance for an address
   */
  async getBalance(owner: PublicKey): Promise<bigint> {
    const ata = getAssociatedTokenAddressSync(
      this.mintAddress,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    try {
      const balance = await this.connection.getTokenAccountBalance(ata);
      return BigInt(balance.value.amount);
    } catch {
      return BigInt(0);
    }
  }

  // ==========================================================================
  // UNSIGNED TRANSACTION BUILDERS (for wallet-adapter / browser signing)
  // These return an unsigned Transaction ready for wallet.signTransaction()
  // ==========================================================================

  async buildMintTransaction(
    minter: PublicKey,
    recipient: PublicKey,
    amount: bigint
  ): Promise<Transaction> {
    const [roles] = deriveRolesPda(this.config, minter);
    const recipientAta = getAssociatedTokenAddressSync(
      this.mintAddress, recipient, false, TOKEN_2022_PROGRAM_ID
    );
    // Auto-create the recipient ATA if it doesn't exist (idempotent = safe if already exists)
    const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      minter,           // payer
      recipientAta,     // associated token account
      recipient,        // owner
      this.mintAddress, // mint
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const mintIx = this.buildMintInstruction(minter, this.mintAddress, this.config, roles, recipientAta, amount);
    return new Transaction().add(createAtaIx, mintIx);
  }

  async buildBurnTransaction(burner: PublicKey, amount: bigint): Promise<Transaction> {
    const [roles] = deriveRolesPda(this.config, burner);
    const burnerAta = getAssociatedTokenAddressSync(
      this.mintAddress, burner, false, TOKEN_2022_PROGRAM_ID
    );
    // Auto-create the burner ATA if it doesn't exist (idempotent = safe if already exists)
    const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      burner,           // payer
      burnerAta,        // associated token account
      burner,           // owner
      this.mintAddress, // mint
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const burnIx = this.buildBurnInstruction(burner, this.mintAddress, this.config, roles, burnerAta, amount);
    return new Transaction().add(createAtaIx, burnIx);
  }

  async buildFreezeTransaction(freezer: PublicKey, targetAccount: PublicKey): Promise<Transaction> {
    const [roles] = deriveRolesPda(this.config, freezer);
    const ix = this.buildFreezeInstruction(freezer, this.mintAddress, this.config, roles, targetAccount);
    return new Transaction().add(ix);
  }

  async buildThawTransaction(freezer: PublicKey, targetAccount: PublicKey): Promise<Transaction> {
    const [roles] = deriveRolesPda(this.config, freezer);
    const ix = this.buildThawInstruction(freezer, this.mintAddress, this.config, roles, targetAccount);
    return new Transaction().add(ix);
  }

  async buildPauseTransaction(pauser: PublicKey): Promise<Transaction> {
    const [roles] = deriveRolesPda(this.config, pauser);
    const ix = this.buildPauseInstruction(pauser, this.config, roles);
    return new Transaction().add(ix);
  }

  async buildUnpauseTransaction(pauser: PublicKey): Promise<Transaction> {
    const [roles] = deriveRolesPda(this.config, pauser);
    const ix = this.buildUnpauseInstruction(pauser, this.config, roles);
    return new Transaction().add(ix);
  }

  async buildBlacklistAddTransaction(blacklister: PublicKey, address: PublicKey): Promise<Transaction> {
    const [roles] = deriveRolesPda(this.config, blacklister);
    const [blacklistEntry] = deriveBlacklistPda(this.config, address);
    const ix = this.buildBlacklistAddInstruction(blacklister, this.config, roles, blacklistEntry, address);
    return new Transaction().add(ix);
  }

  async buildBlacklistRemoveTransaction(blacklister: PublicKey, address: PublicKey): Promise<Transaction> {
    const [roles] = deriveRolesPda(this.config, blacklister);
    const [blacklistEntry] = deriveBlacklistPda(this.config, address);
    const ix = this.buildBlacklistRemoveInstruction(blacklister, this.config, roles, blacklistEntry);
    return new Transaction().add(ix);
  }

  async buildSeizeTransaction(
    seizer: PublicKey,
    fromAccount: PublicKey,
    toAccount: PublicKey,
    amount: bigint,
    remainingAccounts: RemainingAccountMeta[] = []
  ): Promise<Transaction> {
    const [roles] = deriveRolesPda(this.config, seizer);
    const ix = this.buildSeizeInstruction(seizer, this.mintAddress, this.config, roles, fromAccount, toAccount, amount, remainingAccounts);
    return new Transaction().add(ix);
  }

  async buildMintRequestTransaction(
    minter: PublicKey,
    depositor: PublicKey,
    recipient: PublicKey,
    params: MintFromBankParams
  ): Promise<Transaction> {
    const [roles] = deriveRolesPda(this.config, minter);
    const [mintRequest] = deriveMintRequestPda(this.config, Buffer.from(params.referenceId));
    const ix = this.buildCreateMintRequestInstruction(minter, depositor, recipient, this.config, this.mintAddress, roles, mintRequest, params);
    return new Transaction().add(ix);
  }

  async buildRedemptionTransaction(redeemer: PublicKey, params: RedeemToBankParams): Promise<Transaction> {
    const redeemerAta = getAssociatedTokenAddressSync(
      this.mintAddress, redeemer, false, TOKEN_2022_PROGRAM_ID
    );
    const amountSeed = Buffer.alloc(8);
    amountSeed.writeBigUInt64LE(params.amount);
    const [redemptionRequest] = deriveRedemptionPda(this.config, redeemer, amountSeed);
    const ix = this.buildCreateRedemptionInstruction(redeemer, this.mintAddress, this.config, redeemerAta, redemptionRequest, params);
    return new Transaction().add(ix);
  }

  async buildGrantRoleTransaction(authority: PublicKey, target: PublicKey, role: keyof typeof Roles): Promise<Transaction> {
    const [targetRoles] = deriveRolesPda(this.config, target);
    const ix = SolanaStablecoin.buildUpdateRolesInstructionStatic(authority, this.config, targetRoles, target, Roles[role], true);
    return new Transaction().add(ix);
  }

  async buildRevokeRoleTransaction(authority: PublicKey, target: PublicKey, role: keyof typeof Roles): Promise<Transaction> {
    const [targetRoles] = deriveRolesPda(this.config, target);
    const ix = SolanaStablecoin.buildUpdateRolesInstructionStatic(authority, this.config, targetRoles, target, Roles[role], false);
    return new Transaction().add(ix);
  }

  // ==========================================================================
  // CORE OPERATIONS
  // ==========================================================================

  /**
   * Mint tokens to a recipient
   */
  async mint(
    recipient: PublicKey,
    amount: bigint,
    minter: Keypair
  ): Promise<string> {
    const [roles] = deriveRolesPda(this.config, minter.publicKey);
    const recipientAta = getAssociatedTokenAddressSync(
      this.mintAddress,
      recipient,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const ix = this.buildMintInstruction(
      minter.publicKey,
      this.mintAddress,
      this.config,
      roles,
      recipientAta,
      amount
    );

    const tx = new Transaction().add(ix);
    const sig = await this.connection.sendTransaction(tx, [minter]);
    await this.connection.confirmTransaction(sig);

    this._configData = null; // invalidate cache
    return sig;
  }

  /**
   * Burn tokens from own account
   */
  async burn(amount: bigint, burner: Keypair): Promise<string> {
    const [roles] = deriveRolesPda(this.config, burner.publicKey);
    const burnerAta = getAssociatedTokenAddressSync(
      this.mintAddress,
      burner.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const ix = this.buildBurnInstruction(
      burner.publicKey,
      this.mintAddress,
      this.config,
      roles,
      burnerAta,
      amount
    );

    const tx = new Transaction().add(ix);
    const sig = await this.connection.sendTransaction(tx, [burner]);
    await this.connection.confirmTransaction(sig);

    this._configData = null;
    return sig;
  }

  /**
   * Freeze a token account
   */
  async freeze(targetAccount: PublicKey, freezer: Keypair): Promise<string> {
    const [roles] = deriveRolesPda(this.config, freezer.publicKey);

    const ix = this.buildFreezeInstruction(
      freezer.publicKey,
      this.mintAddress,
      this.config,
      roles,
      targetAccount
    );

    const tx = new Transaction().add(ix);
    const sig = await this.connection.sendTransaction(tx, [freezer]);
    await this.connection.confirmTransaction(sig);

    return sig;
  }

  /**
   * Thaw a frozen token account
   */
  async thaw(targetAccount: PublicKey, freezer: Keypair): Promise<string> {
    const [roles] = deriveRolesPda(this.config, freezer.publicKey);

    const ix = this.buildThawInstruction(
      freezer.publicKey,
      this.mintAddress,
      this.config,
      roles,
      targetAccount
    );

    const tx = new Transaction().add(ix);
    const sig = await this.connection.sendTransaction(tx, [freezer]);
    await this.connection.confirmTransaction(sig);

    return sig;
  }

  /**
   * Pause all operations
   */
  async pause(pauser: Keypair): Promise<string> {
    const [roles] = deriveRolesPda(this.config, pauser.publicKey);

    const ix = this.buildPauseInstruction(
      pauser.publicKey,
      this.config,
      roles
    );

    const tx = new Transaction().add(ix);
    const sig = await this.connection.sendTransaction(tx, [pauser]);
    await this.connection.confirmTransaction(sig);

    this._configData = null;
    return sig;
  }

  /**
   * Unpause operations
   */
  async unpause(pauser: Keypair): Promise<string> {
    const [roles] = deriveRolesPda(this.config, pauser.publicKey);

    const ix = this.buildUnpauseInstruction(
      pauser.publicKey,
      this.config,
      roles
    );

    const tx = new Transaction().add(ix);
    const sig = await this.connection.sendTransaction(tx, [pauser]);
    await this.connection.confirmTransaction(sig);

    this._configData = null;
    return sig;
  }

  // ==========================================================================
  // COMPLIANCE MODULE (SSS-2+)
  // ==========================================================================

  compliance = {
    /**
     * Add address to blacklist
     */
    blacklistAdd: async (
      address: PublicKey,
      blacklister: Keypair
    ): Promise<string> => {
      const config = await this.getConfig();
      if (config.preset === Preset.SSS1) {
        throw new Error("Blacklist not available for SSS-1 preset");
      }

      const [roles] = deriveRolesPda(this.config, blacklister.publicKey);
      const [blacklistEntry] = deriveBlacklistPda(this.config, address);

      const ix = this.buildBlacklistAddInstruction(
        blacklister.publicKey,
        this.config,
        roles,
        blacklistEntry,
        address
      );

      const tx = new Transaction().add(ix);
      const sig = await this.connection.sendTransaction(tx, [blacklister]);
      await this.connection.confirmTransaction(sig);

      return sig;
    },

    /**
     * Remove address from blacklist
     */
    blacklistRemove: async (
      address: PublicKey,
      blacklister: Keypair
    ): Promise<string> => {
      const [roles] = deriveRolesPda(this.config, blacklister.publicKey);
      const [blacklistEntry] = deriveBlacklistPda(this.config, address);

      const ix = this.buildBlacklistRemoveInstruction(
        blacklister.publicKey,
        this.config,
        roles,
        blacklistEntry
      );

      const tx = new Transaction().add(ix);
      const sig = await this.connection.sendTransaction(tx, [blacklister]);
      await this.connection.confirmTransaction(sig);

      return sig;
    },

    /**
     * Seize tokens from a frozen account (via permanent delegate)
     */
    seize: async (
      fromAccount: PublicKey,
      toAccount: PublicKey,
      amount: bigint,
      seizer: Keypair,
      remainingAccounts: RemainingAccountMeta[] = []
    ): Promise<string> => {
      const config = await this.getConfig();
      if (config.preset === Preset.SSS1) {
        throw new Error("Seize not available for SSS-1 preset");
      }

      const [roles] = deriveRolesPda(this.config, seizer.publicKey);

      const ix = this.buildSeizeInstruction(
        seizer.publicKey,
        this.mintAddress,
        this.config,
        roles,
        fromAccount,
        toAccount,
        amount,
        remainingAccounts
      );

      const tx = new Transaction().add(ix);
      const sig = await this.connection.sendTransaction(tx, [seizer]);
      await this.connection.confirmTransaction(sig);

      this._configData = null;
      return sig;
    },
  };

  // ==========================================================================
  // BANKING MODULE
  // ==========================================================================

  banking = {
    /**
     * Create a mint request after bank deposit notification
     */
    createMintRequest: async (
      depositor: PublicKey,
      recipient: PublicKey,
      params: MintFromBankParams,
      minter: Keypair
    ): Promise<string> => {
      const [roles] = deriveRolesPda(this.config, minter.publicKey);
      const [mintRequest] = deriveMintRequestPda(
        this.config,
        Buffer.from(params.referenceId)
      );

      const ix = this.buildCreateMintRequestInstruction(
        minter.publicKey,
        depositor,
        recipient,
        this.config,
        this.mintAddress,
        roles,
        mintRequest,
        params
      );

      const tx = new Transaction().add(ix);
      const sig = await this.connection.sendTransaction(tx, [minter]);
      await this.connection.confirmTransaction(sig);

      return sig;
    },

    /**
     * Confirm bank deposit and mint tokens
     */
    confirmAndMint: async (
      referenceId: Uint8Array,
      minter: Keypair
    ): Promise<string> => {
      const [roles] = deriveRolesPda(this.config, minter.publicKey);
      const [mintRequest] = deriveMintRequestPda(
        this.config,
        Buffer.from(referenceId)
      );

      // Get mint request to find recipient
      const mintRequestInfo = await this.connection.getAccountInfo(mintRequest);
      if (!mintRequestInfo) throw new Error("Mint request not found");
      const recipient = this.parseMintRequestRecipient(mintRequestInfo.data);
      const recipientAta = getAssociatedTokenAddressSync(
        this.mintAddress,
        recipient,
        true,
        TOKEN_2022_PROGRAM_ID
      );

      const ix = this.buildConfirmAndMintInstruction(
        minter.publicKey,
        this.mintAddress,
        this.config,
        roles,
        mintRequest,
        recipientAta
      );

      const tx = new Transaction().add(ix);
      const sig = await this.connection.sendTransaction(tx, [minter]);
      await this.connection.confirmTransaction(sig);

      this._configData = null;
      return sig;
    },

    /**
     * Burn tokens and create redemption request
     */
    redeem: async (
      params: RedeemToBankParams,
      redeemer: Keypair
    ): Promise<string> => {
      const redeemerAta = getAssociatedTokenAddressSync(
        this.mintAddress,
        redeemer.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const amountSeed = Buffer.alloc(8);
      amountSeed.writeBigUInt64LE(params.amount);
      const [redemptionRequest] = deriveRedemptionPda(
        this.config,
        redeemer.publicKey,
        amountSeed
      );

      const ix = this.buildCreateRedemptionInstruction(
        redeemer.publicKey,
        this.mintAddress,
        this.config,
        redeemerAta,
        redemptionRequest,
        params
      );

      const tx = new Transaction().add(ix);
      const sig = await this.connection.sendTransaction(tx, [redeemer]);
      await this.connection.confirmTransaction(sig);

      this._configData = null;
      return sig;
    },
  };

  // ==========================================================================
  // ROLE MANAGEMENT
  // ==========================================================================

  roles = {
    /**
     * Grant a role to an address
     */
    grant: async (
      target: PublicKey,
      role: keyof typeof Roles,
      authority: Keypair
    ): Promise<string> => {
      const [targetRoles] = deriveRolesPda(this.config, target);

      const ix = this.buildUpdateRolesInstruction(
        authority.publicKey,
        this.config,
        targetRoles,
        target,
        Roles[role],
        true
      );

      const tx = new Transaction().add(ix);
      const sig = await this.connection.sendTransaction(tx, [authority]);
      await this.connection.confirmTransaction(sig);

      return sig;
    },

    /**
     * Revoke a role from an address
     */
    revoke: async (
      target: PublicKey,
      role: keyof typeof Roles,
      authority: Keypair
    ): Promise<string> => {
      const [targetRoles] = deriveRolesPda(this.config, target);

      const ix = this.buildUpdateRolesInstruction(
        authority.publicKey,
        this.config,
        targetRoles,
        target,
        Roles[role],
        false
      );

      const tx = new Transaction().add(ix);
      const sig = await this.connection.sendTransaction(tx, [authority]);
      await this.connection.confirmTransaction(sig);

      return sig;
    },

    /**
     * Set minter quota
     */
    setMinterQuota: async (
      minter: PublicKey,
      quota: bigint,
      authority: Keypair
    ): Promise<string> => {
      const [minterRoles] = deriveRolesPda(this.config, minter);

      const ix = this.buildUpdateMinterConfigInstruction(
        authority.publicKey,
        this.config,
        minterRoles,
        minter,
        quota
      );

      const tx = new Transaction().add(ix);
      const sig = await this.connection.sendTransaction(tx, [authority]);
      await this.connection.confirmTransaction(sig);

      return sig;
    },
  };

  // ==========================================================================
  // INSTRUCTION BUILDERS
  // ==========================================================================

  private static instructionDiscriminator(name: string): Buffer {
    return createHash("sha256")
      .update(`global:${name}`)
      .digest()
      .subarray(0, 8);
  }

  private static accountDiscriminator(name: string): Buffer {
    return createHash("sha256")
      .update(`account:${name}`)
      .digest()
      .subarray(0, 8);
  }

  private static encodeU8(value: number): Buffer {
    return Buffer.from([value & 0xff]);
  }

  private static encodeBool(value: boolean): Buffer {
    return Buffer.from([value ? 1 : 0]);
  }

  private static encodeU16(value: number): Buffer {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(value, 0);
    return buffer;
  }

  private static encodeU64(value: bigint): Buffer {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(BigInt(value), 0);
    return buffer;
  }

  private static encodeI64(value: bigint): Buffer {
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64LE(BigInt(value), 0);
    return buffer;
  }

  private static encodePubkey(value: PublicKey): Buffer {
    return value.toBuffer();
  }

  private static encodeOptionPubkey(value?: PublicKey | null): Buffer {
    if (!value) {
      return Buffer.from([0]);
    }
    return Buffer.concat([Buffer.from([1]), value.toBuffer()]);
  }

  private static encodeString(value: string): Buffer {
    const content = Buffer.from(value, "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32LE(content.length, 0);
    return Buffer.concat([len, content]);
  }

  private static ensureFixedBytes(value: Uint8Array, expected: number, field: string): Buffer {
    if (value.length !== expected) {
      throw new Error(`${field} must be ${expected} bytes, got ${value.length}`);
    }
    return Buffer.from(value);
  }

  private static encodeInitializeParams(params: InitializeParams): Buffer {
    return Buffer.concat([
      this.encodeString(params.name),
      this.encodeString(params.symbol),
      this.encodeU8(params.decimals),
      this.encodeU8(params.preset),
      this.encodeU64(params.supplyCap),
      this.encodeString(params.uri),
      this.encodeOptionPubkey(params.hookProgramId),
      this.encodeU8(params.backingType),
      this.encodeU8(params.bankingRail),
      this.encodeOptionPubkey(params.oracle),
    ]);
  }

  private static encodeMintFromBankParams(params: MintFromBankParams): Buffer {
    return Buffer.concat([
      this.encodeU64(params.amount),
      this.encodeU64(params.fiatAmount),
      this.encodeU8(params.fiatCurrency),
      this.ensureFixedBytes(params.referenceId, 32, "referenceId"),
    ]);
  }

  private static encodeRedeemToBankParams(params: RedeemToBankParams): Buffer {
    return Buffer.concat([
      this.encodeU64(params.amount),
      this.ensureFixedBytes(params.bankAccountHash, 32, "bankAccountHash"),
    ]);
  }

  private static encodeInstruction(
    method: string,
    args: Buffer[] = []
  ): Buffer {
    return Buffer.concat([
      this.instructionDiscriminator(method),
      ...args,
    ]);
  }

  private static buildInitializeInstruction(
    authority: PublicKey,
    mint: PublicKey,
    config: PublicKey,
    params: InitializeParams
  ): TransactionInstruction {
    const data = this.encodeInstruction("initialize", [
      this.encodeInitializeParams(params),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: mint, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  private buildMintInstruction(
    minter: PublicKey,
    mint: PublicKey,
    config: PublicKey,
    roles: PublicKey,
    recipientAta: PublicKey,
    amount: bigint
  ): TransactionInstruction {
    const data = SolanaStablecoin.encodeInstruction("mint_tokens", [
      SolanaStablecoin.encodeU64(amount),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: minter, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: recipientAta, isSigner: false, isWritable: true },
        { pubkey: roles, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  private buildBurnInstruction(
    burner: PublicKey,
    mint: PublicKey,
    config: PublicKey,
    roles: PublicKey,
    burnerAta: PublicKey,
    amount: bigint
  ): TransactionInstruction {
    const data = SolanaStablecoin.encodeInstruction("burn_tokens", [
      SolanaStablecoin.encodeU64(amount),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: burner, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: burnerAta, isSigner: false, isWritable: true },
        { pubkey: roles, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  private buildFreezeInstruction(
    freezer: PublicKey,
    mint: PublicKey,
    config: PublicKey,
    roles: PublicKey,
    targetAccount: PublicKey
  ): TransactionInstruction {
    const data = SolanaStablecoin.encodeInstruction("freeze_account");

    return new TransactionInstruction({
      keys: [
        { pubkey: freezer, isSigner: true, isWritable: false },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: targetAccount, isSigner: false, isWritable: true },
        { pubkey: roles, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  private buildThawInstruction(
    freezer: PublicKey,
    mint: PublicKey,
    config: PublicKey,
    roles: PublicKey,
    targetAccount: PublicKey
  ): TransactionInstruction {
    const data = SolanaStablecoin.encodeInstruction("thaw_account");

    return new TransactionInstruction({
      keys: [
        { pubkey: freezer, isSigner: true, isWritable: false },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: targetAccount, isSigner: false, isWritable: true },
        { pubkey: roles, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  private buildPauseInstruction(
    signer: PublicKey,
    config: PublicKey,
    roles: PublicKey
  ): TransactionInstruction {
    const data = SolanaStablecoin.encodeInstruction("pause");

    return new TransactionInstruction({
      keys: [
        { pubkey: signer, isSigner: true, isWritable: false },
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: roles, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  private buildUnpauseInstruction(
    signer: PublicKey,
    config: PublicKey,
    roles: PublicKey
  ): TransactionInstruction {
    const data = SolanaStablecoin.encodeInstruction("unpause");

    return new TransactionInstruction({
      keys: [
        { pubkey: signer, isSigner: true, isWritable: false },
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: roles, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  private buildBlacklistAddInstruction(
    blacklister: PublicKey,
    config: PublicKey,
    roles: PublicKey,
    blacklistEntry: PublicKey,
    address: PublicKey
  ): TransactionInstruction {
    const data = SolanaStablecoin.encodeInstruction("add_to_blacklist", [
      SolanaStablecoin.encodePubkey(address),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: blacklister, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: address, isSigner: false, isWritable: false },
        { pubkey: blacklistEntry, isSigner: false, isWritable: true },
        { pubkey: roles, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  private buildBlacklistRemoveInstruction(
    blacklister: PublicKey,
    config: PublicKey,
    roles: PublicKey,
    blacklistEntry: PublicKey
  ): TransactionInstruction {
    const data = SolanaStablecoin.encodeInstruction("remove_from_blacklist");

    return new TransactionInstruction({
      keys: [
        { pubkey: blacklister, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: blacklistEntry, isSigner: false, isWritable: true },
        { pubkey: roles, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  private buildSeizeInstruction(
    seizer: PublicKey,
    mint: PublicKey,
    config: PublicKey,
    roles: PublicKey,
    fromAccount: PublicKey,
    toAccount: PublicKey,
    amount: bigint,
    remainingAccounts: RemainingAccountMeta[] = []
  ): TransactionInstruction {
    const data = SolanaStablecoin.encodeInstruction("seize", [
      SolanaStablecoin.encodeU64(amount),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: seizer, isSigner: true, isWritable: false },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: fromAccount, isSigner: false, isWritable: true },
        { pubkey: toAccount, isSigner: false, isWritable: true },
        { pubkey: roles, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        ...remainingAccounts.map((account) => ({
          pubkey: account.pubkey,
          isSigner: Boolean(account.isSigner),
          isWritable: Boolean(account.isWritable),
        })),
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  private buildUpdateRolesInstruction(
    authority: PublicKey,
    config: PublicKey,
    targetRoles: PublicKey,
    target: PublicKey,
    role: number,
    active: boolean
  ): TransactionInstruction {
    const data = SolanaStablecoin.encodeInstruction("update_roles", [
      SolanaStablecoin.encodePubkey(target),
      SolanaStablecoin.encodeU8(role),
      SolanaStablecoin.encodeBool(active),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: target, isSigner: false, isWritable: false },
        { pubkey: targetRoles, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  private buildUpdateMinterConfigInstruction(
    authority: PublicKey,
    config: PublicKey,
    minterRoles: PublicKey,
    minter: PublicKey,
    quota: bigint
  ): TransactionInstruction {
    const data = SolanaStablecoin.encodeInstruction("update_minter_config", [
      SolanaStablecoin.encodePubkey(minter),
      SolanaStablecoin.encodeU64(quota),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: false },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: minterRoles, isSigner: false, isWritable: true },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  private buildCreateMintRequestInstruction(
    minter: PublicKey,
    depositor: PublicKey,
    recipient: PublicKey,
    config: PublicKey,
    mint: PublicKey,
    roles: PublicKey,
    mintRequest: PublicKey,
    params: MintFromBankParams
  ): TransactionInstruction {
    const data = SolanaStablecoin.encodeInstruction("create_mint_request", [
      SolanaStablecoin.encodeMintFromBankParams(params),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: minter, isSigner: true, isWritable: true },
        { pubkey: depositor, isSigner: false, isWritable: false },
        { pubkey: recipient, isSigner: false, isWritable: false },
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: roles, isSigner: false, isWritable: false },
        { pubkey: mintRequest, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  private buildConfirmAndMintInstruction(
    minter: PublicKey,
    mint: PublicKey,
    config: PublicKey,
    roles: PublicKey,
    mintRequest: PublicKey,
    recipientAta: PublicKey
  ): TransactionInstruction {
    const data = SolanaStablecoin.encodeInstruction("confirm_and_mint");

    return new TransactionInstruction({
      keys: [
        { pubkey: minter, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: roles, isSigner: false, isWritable: false },
        { pubkey: mintRequest, isSigner: false, isWritable: true },
        { pubkey: recipientAta, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  private buildCreateRedemptionInstruction(
    redeemer: PublicKey,
    mint: PublicKey,
    config: PublicKey,
    redeemerAta: PublicKey,
    redemptionRequest: PublicKey,
    params: RedeemToBankParams
  ): TransactionInstruction {
    const data = SolanaStablecoin.encodeInstruction("create_redemption", [
      SolanaStablecoin.encodeRedeemToBankParams(params),
    ]);

    return new TransactionInstruction({
      keys: [
        { pubkey: redeemer, isSigner: true, isWritable: true },
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: redeemerAta, isSigner: false, isWritable: true },
        { pubkey: redemptionRequest, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: SSS_TOKEN_PROGRAM_ID,
      data,
    });
  }

  private parseMintRequestRecipient(data: Buffer): PublicKey {
    const expectedDiscriminator = SolanaStablecoin.accountDiscriminator("MintRequest");
    if (data.length < 8 + 32 + 32 + 32) {
      throw new Error("Mint request account data is too short");
    }
    if (!data.subarray(0, 8).equals(expectedDiscriminator)) {
      throw new Error("Invalid MintRequest account discriminator");
    }
    const recipientOffset = 8 + 32 + 32;
    return new PublicKey(data.subarray(recipientOffset, recipientOffset + 32));
  }

  private readU8(data: Buffer, offset: number): { value: number; offset: number } {
    return { value: data.readUInt8(offset), offset: offset + 1 };
  }

  private readBool(data: Buffer, offset: number): { value: boolean; offset: number } {
    const raw = data.readUInt8(offset);
    return { value: raw === 1, offset: offset + 1 };
  }

  private readU64(data: Buffer, offset: number): { value: bigint; offset: number } {
    return { value: data.readBigUInt64LE(offset), offset: offset + 8 };
  }

  private readI64(data: Buffer, offset: number): { value: bigint; offset: number } {
    return { value: data.readBigInt64LE(offset), offset: offset + 8 };
  }

  private readPubkey(data: Buffer, offset: number): { value: PublicKey; offset: number } {
    return {
      value: new PublicKey(data.subarray(offset, offset + 32)),
      offset: offset + 32,
    };
  }

  private readOptionPubkey(data: Buffer, offset: number): { value: PublicKey | null; offset: number } {
    const flag = data.readUInt8(offset);
    if (flag === 0) {
      return { value: null, offset: offset + 1 };
    }
    const keyStart = offset + 1;
    return {
      value: new PublicKey(data.subarray(keyStart, keyStart + 32)),
      offset: keyStart + 32,
    };
  }

  private readString(data: Buffer, offset: number): { value: string; offset: number } {
    const length = data.readUInt32LE(offset);
    const start = offset + 4;
    const end = start + length;
    return {
      value: data.subarray(start, end).toString("utf8"),
      offset: end,
    };
  }

  private parseConfigAccount(data: Buffer): StablecoinConfig {
    const discriminator = SolanaStablecoin.accountDiscriminator("StablecoinConfig");
    if (data.length < 8) {
      throw new Error("Config account data too short");
    }
    if (!data.subarray(0, 8).equals(discriminator)) {
      throw new Error("Invalid StablecoinConfig account discriminator");
    }

    let offset = 8;
    const authority = this.readPubkey(data, offset);
    offset = authority.offset;

    const pendingAuthority = this.readOptionPubkey(data, offset);
    offset = pendingAuthority.offset;

    const mint = this.readPubkey(data, offset);
    offset = mint.offset;

    const preset = this.readU8(data, offset);
    offset = preset.offset;

    const name = this.readString(data, offset);
    offset = name.offset;

    const symbol = this.readString(data, offset);
    offset = symbol.offset;

    const decimals = this.readU8(data, offset);
    offset = decimals.offset;

    const isPaused = this.readBool(data, offset);
    offset = isPaused.offset;

    const supplyCap = this.readU64(data, offset);
    offset = supplyCap.offset;

    const totalMinted = this.readU64(data, offset);
    offset = totalMinted.offset;

    const totalBurned = this.readU64(data, offset);
    offset = totalBurned.offset;

    const backingType = this.readU8(data, offset);
    offset = backingType.offset;

    const bankingRail = this.readU8(data, offset);
    offset = bankingRail.offset;

    const reserveAccount = this.readOptionPubkey(data, offset);
    offset = reserveAccount.offset;

    const oracle = this.readOptionPubkey(data, offset);
    offset = oracle.offset;

    const createdAt = this.readI64(data, offset);
    offset = createdAt.offset;

    const lastUpdated = this.readI64(data, offset);
    offset = lastUpdated.offset;

    offset += 32;
    const bump = this.readU8(data, offset);
    void bump;

    return {
      authority: authority.value,
      mint: mint.value,
      preset: preset.value as Preset,
      name: name.value,
      symbol: symbol.value,
      decimals: decimals.value,
      isPaused: isPaused.value,
      supplyCap: supplyCap.value,
      totalMinted: totalMinted.value,
      totalBurned: totalBurned.value,
      backingType: backingType.value as BackingType,
      bankingRail: bankingRail.value as BankingRail,
      reserveAccount: reserveAccount.value,
      oracle: oracle.value,
    };
  }
}
