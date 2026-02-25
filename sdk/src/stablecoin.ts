import {
  type Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
// @coral-xyz/anchor is a CommonJS module. Named ESM imports may not resolve in
// Node ≥23. Use a default import and split into:
//   - `import type` for type-annotation positions (zero runtime cost)
//   - destructured Ctor aliases for constructor-call positions
import type { Program, AnchorProvider } from "@coral-xyz/anchor";
import anchorPkg from "@coral-xyz/anchor";
type AnchorMod = typeof import("@coral-xyz/anchor");
const {
  Program: ProgramCtor,
  AnchorProvider: ProviderCtor,
  Wallet,
  BN,
} = anchorPkg as unknown as AnchorMod;
import { createRequire } from "module";
import type { SssToken } from "./idl_types.js";
import type { CreateConfig, StablecoinInfo, MintParams, BurnParams, MinterInfoEntry } from "./types.js";
import {
  deriveStablecoinConfig,
  deriveRoleManager,
  deriveMinterInfo,
  deriveExtraAccountMetaList,
} from "./pda.js";
import {
  SSS_TOKEN_PROGRAM_ID,
  HOOK_PROGRAM_ID,
  SSS_2,
} from "./presets.js";
import { ComplianceModule } from "./compliance.js";

// Load the IDL JSON using require (compatible with NodeNext module resolution)
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const IDL = require("../../target/idl/sss_token.json") as any;

/**
 * SolanaStablecoin is the primary entry point for interacting with
 * a stablecoin deployed via the SSS Token program.
 *
 * Usage:
 *   // Create a new stablecoin
 *   const coin = await SolanaStablecoin.create(connection, authority, mint, {
 *     name: "USDB",
 *     symbol: "USDB",
 *     preset: "sss-2",
 *   });
 *
 *   // Load an existing stablecoin
 *   const coin = await SolanaStablecoin.load(connection, mintPublicKey);
 */
export class SolanaStablecoin {
  private readonly _program: Program<SssToken>;
  private readonly _connection: Connection;
  private readonly _mint: PublicKey;
  private readonly _configPda: PublicKey;
  private readonly _enablePermanentDelegate: boolean;
  private _complianceModule: ComplianceModule | null = null;

  private constructor(
    program: Program<SssToken>,
    connection: Connection,
    mint: PublicKey,
    configPda: PublicKey,
    enablePermanentDelegate: boolean
  ) {
    this._program = program;
    this._connection = connection;
    this._mint = mint;
    this._configPda = configPda;
    this._enablePermanentDelegate = enablePermanentDelegate;
  }

  // ---------------------------------------------------------------------------
  // Factory methods
  // ---------------------------------------------------------------------------

  /**
   * Create and deploy a new stablecoin on-chain.
   *
   * Calls the `initialize` instruction, which creates the Token-2022 mint,
   * StablecoinConfig PDA, and RoleManager PDA in a single transaction.
   *
   * For SSS-2 tokens, the hook program and ExtraAccountMetaList PDA are
   * passed as remaining accounts so the program can register the hook.
   *
   * @param connection - Solana RPC connection
   * @param authority - Keypair that becomes the master authority
   * @param mint - Fresh Keypair for the new mint
   * @param config - Token configuration
   * @returns Initialized SolanaStablecoin instance
   */
  static async create(
    connection: Connection,
    authority: Keypair,
    mint: Keypair,
    config: CreateConfig
  ): Promise<SolanaStablecoin> {
    const preset = config.preset ?? "sss-1";
    const presetConfig = preset === "sss-2" ? SSS_2 : {
      enablePermanentDelegate: false,
      enableTransferHook: false,
      enableDefaultFrozen: false,
      transferHookProgramId: null as PublicKey | null,
    };

    const hookProgramId =
      config.transferHookProgramId ??
      (preset === "sss-2" ? HOOK_PROGRAM_ID : null);

    const params = {
      name: config.name,
      symbol: config.symbol,
      uri: config.uri ?? "",
      decimals: config.decimals ?? 6,
      enablePermanentDelegate: presetConfig.enablePermanentDelegate,
      enableTransferHook: presetConfig.enableTransferHook,
      enableDefaultFrozen: presetConfig.enableDefaultFrozen,
      transferHookProgramId: hookProgramId,
    };

    const provider = new ProviderCtor(connection, new Wallet(authority), {
      commitment: "confirmed",
    });
    const program = new ProgramCtor<SssToken>(IDL, provider);

    const [configPda] = await deriveStablecoinConfig(mint.publicKey);
    const [roleManagerPda] = await deriveRoleManager(configPda);

    const methodBuilder = program.methods.initialize(params).accountsPartial({
      authority: authority.publicKey,
      mint: mint.publicKey,
      stablecoinConfig: configPda,
      roleManager: roleManagerPda,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    });

    // For SSS-2, pass hook program + extra account meta PDA as remaining accounts
    if (preset === "sss-2" && hookProgramId) {
      const [extraAccountMetaListPda] = await deriveExtraAccountMetaList(
        mint.publicKey
      );
      methodBuilder.remainingAccounts([
        { pubkey: hookProgramId, isWritable: false, isSigner: false },
        {
          pubkey: extraAccountMetaListPda,
          isWritable: true,
          isSigner: false,
        },
      ]);
    }

    await methodBuilder.signers([authority, mint]).rpc({ commitment: "confirmed" });

    return new SolanaStablecoin(
      program,
      connection,
      mint.publicKey,
      configPda,
      presetConfig.enablePermanentDelegate
    );
  }

  /**
   * Load an existing stablecoin by its mint address.
   *
   * Fetches the StablecoinConfig PDA to confirm the mint exists and is
   * managed by the SSS Token program.
   *
   * @param connection - Solana RPC connection
   * @param mint - Public key of the existing mint
   * @returns Loaded SolanaStablecoin instance
   */
  static async load(
    connection: Connection,
    mint: PublicKey
  ): Promise<SolanaStablecoin> {
    const provider = new ProviderCtor(
      connection,
      // Provide a dummy wallet for read-only operations
      new Wallet(Keypair.generate()),
      { commitment: "confirmed" }
    );
    const program = new ProgramCtor<SssToken>(IDL, provider);

    const [configPda] = await deriveStablecoinConfig(mint);

    // Fetch the config account to confirm existence and read preset flags
    const cfg = await program.account.stablecoinConfig.fetchNullable(configPda);
    if (!cfg) {
      throw new Error(
        `StablecoinConfig PDA not found for mint ${mint.toBase58()}. ` +
          "Is this a valid SSS Token mint?"
      );
    }

    return new SolanaStablecoin(
      program,
      connection,
      mint,
      configPda,
      cfg.enablePermanentDelegate
    );
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  /** The mint public key */
  get mintAddress(): PublicKey {
    return this._mint;
  }

  /** The StablecoinConfig PDA address */
  get configAddress(): PublicKey {
    return this._configPda;
  }

  /**
   * Fetch live StablecoinConfig data from chain.
   *
   * @returns StablecoinInfo snapshot
   */
  async getInfo(): Promise<StablecoinInfo> {
    const cfg = await this._program.account.stablecoinConfig.fetch(
      this._configPda
    );

    return {
      mint: cfg.mint,
      config: this._configPda,
      authority: cfg.authority,
      name: cfg.name,
      symbol: cfg.symbol,
      uri: cfg.uri,
      decimals: cfg.decimals,
      paused: cfg.paused,
      enablePermanentDelegate: cfg.enablePermanentDelegate,
      enableTransferHook: cfg.enableTransferHook,
      enableDefaultFrozen: cfg.enableDefaultFrozen,
      totalMinted: BigInt(cfg.totalMinted.toString()),
      totalBurned: BigInt(cfg.totalBurned.toString()),
    };
  }

  // ---------------------------------------------------------------------------
  // Core operations
  // ---------------------------------------------------------------------------

  /**
   * Add a minter with a minting quota.
   *
   * Creates a MinterInfo PDA that tracks minted amounts vs the quota.
   * Only the master authority may call this.
   *
   * @param authority - Keypair of the master authority
   * @param minter - Address to grant minting rights
   * @param quota - Maximum tokens the minter may mint (0 = unlimited)
   * @returns Transaction signature
   */
  async addMinter(
    authority: Keypair,
    minter: PublicKey,
    quota: bigint
  ): Promise<string> {
    const program = this.programWithSigner(authority);
    const [roleManagerPda] = await deriveRoleManager(this._configPda);
    const [minterInfoPda] = await deriveMinterInfo(this._configPda, minter);

    return program.methods
      .addMinter(minter, new BN(quota.toString()))
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig: this._configPda,
        roleManager: roleManagerPda,
        minterInfo: minterInfoPda,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });
  }

  /**
   * Mint tokens to a recipient's associated token account.
   *
   * The caller must hold the Minter role. If the minter has a quota set,
   * it will be enforced by the program.
   *
   * NOTE: For SSS-2 tokens with defaultFrozen enabled, all new token accounts
   * start frozen. The recipient's ATA must be thawed before tokens can be
   * transferred out. This method mints successfully but does NOT auto-thaw.
   * Call thawAccount() separately if needed.
   *
   * @param minter - Keypair with Minter role
   * @param recipient - Wallet address of the recipient
   * @param amount - Number of raw token units to mint
   * @returns Transaction signature
   */
  async mintTokens(
    minter: Keypair,
    recipient: PublicKey,
    amount: bigint
  ): Promise<string> {
    const program = this.programWithSigner(minter);
    const [roleManagerPda] = await deriveRoleManager(this._configPda);
    const [minterInfoPda] = await deriveMinterInfo(
      this._configPda,
      minter.publicKey
    );

    const recipientTokenAccount = getAssociatedTokenAddressSync(
      this._mint,
      recipient,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    return program.methods
      .mintTokens(new BN(amount.toString()))
      .accountsPartial({
        minter: minter.publicKey,
        stablecoinConfig: this._configPda,
        roleManager: roleManagerPda,
        minterInfo: minterInfoPda,
        mint: this._mint,
        recipientTokenAccount,
        recipient,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([minter])
      .rpc({ commitment: "confirmed" });
  }

  /**
   * Burn tokens from the caller's own token account.
   *
   * The caller must hold the Burner role.
   *
   * @param burner - Keypair with Burner role
   * @param amount - Number of raw token units to burn
   * @returns Transaction signature
   */
  async burnTokens(burner: Keypair, amount: bigint): Promise<string> {
    const program = this.programWithSigner(burner);
    const [roleManagerPda] = await deriveRoleManager(this._configPda);

    const burnerTokenAccount = getAssociatedTokenAddressSync(
      this._mint,
      burner.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    return program.methods
      .burnTokens(new BN(amount.toString()))
      .accountsPartial({
        burner: burner.publicKey,
        stablecoinConfig: this._configPda,
        roleManager: roleManagerPda,
        mint: this._mint,
        burnerTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([burner])
      .rpc({ commitment: "confirmed" });
  }

  /**
   * Freeze a specific token account.
   *
   * Blocks all transfers from or to the account.
   * Caller must be master authority or hold the Pauser role.
   *
   * @param authority - Keypair with authority or Pauser role
   * @param tokenAccount - The token account to freeze
   * @returns Transaction signature
   */
  async freezeAccount(
    authority: Keypair,
    tokenAccount: PublicKey
  ): Promise<string> {
    const program = this.programWithSigner(authority);
    const [roleManagerPda] = await deriveRoleManager(this._configPda);

    return program.methods
      .freezeAccount()
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig: this._configPda,
        roleManager: roleManagerPda,
        mint: this._mint,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });
  }

  /**
   * Thaw (unfreeze) a previously frozen token account.
   *
   * Caller must be master authority or hold the Pauser role.
   *
   * @param authority - Keypair with authority or Pauser role
   * @param tokenAccount - The token account to thaw
   * @returns Transaction signature
   */
  async thawAccount(
    authority: Keypair,
    tokenAccount: PublicKey
  ): Promise<string> {
    const program = this.programWithSigner(authority);
    const [roleManagerPda] = await deriveRoleManager(this._configPda);

    return program.methods
      .thawAccount()
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig: this._configPda,
        roleManager: roleManagerPda,
        mint: this._mint,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });
  }

  /**
   * Globally pause all mint, burn, and transfer operations.
   *
   * Caller must be master authority or hold the Pauser role.
   *
   * @param authority - Keypair with authority or Pauser role
   * @returns Transaction signature
   */
  async pause(authority: Keypair): Promise<string> {
    const program = this.programWithSigner(authority);
    const [roleManagerPda] = await deriveRoleManager(this._configPda);

    return program.methods
      .pause()
      .accountsPartial({
        pauser: authority.publicKey,
        stablecoinConfig: this._configPda,
        roleManager: roleManagerPda,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });
  }

  /**
   * Resume normal operations after a global pause.
   *
   * Caller must be master authority or hold the Pauser role.
   *
   * @param authority - Keypair with authority or Pauser role
   * @returns Transaction signature
   */
  async unpause(authority: Keypair): Promise<string> {
    const program = this.programWithSigner(authority);
    const [roleManagerPda] = await deriveRoleManager(this._configPda);

    return program.methods
      .unpause()
      .accountsPartial({
        pauser: authority.publicKey,
        stablecoinConfig: this._configPda,
        roleManager: roleManagerPda,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });
  }

  /**
   * Transfer master authority to a new address.
   *
   * This is irreversible without the new authority's cooperation.
   * Only the current master authority may call this.
   *
   * @param authority - Current master authority Keypair
   * @param newAuthority - New authority's public key
   * @returns Transaction signature
   */
  async transferAuthority(
    authority: Keypair,
    newAuthority: PublicKey
  ): Promise<string> {
    const program = this.programWithSigner(authority);

    return program.methods
      .transferAuthority(newAuthority)
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig: this._configPda,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });
  }

  async mint(params: MintParams): Promise<string> {
    return this.mintTokens(params.minter, params.recipient, params.amount);
  }

  async burn(params: BurnParams): Promise<string> {
    return this.burnTokens(params.burner, params.amount);
  }

  async getTotalSupply(): Promise<bigint> {
    const info = await this.getInfo();
    return info.totalMinted - info.totalBurned;
  }

  // ---------------------------------------------------------------------------
  // Minter management
  // ---------------------------------------------------------------------------

  /**
   * Fetch all registered minters with their quota and minted amounts.
   */
  async getMinters(): Promise<MinterInfoEntry[]> {
    const [roleManagerPda] = await deriveRoleManager(this._configPda);
    const roles = await this._program.account.roleManager.fetch(roleManagerPda);
    const entries: MinterInfoEntry[] = [];

    for (const minterPk of roles.minters) {
      const [minterInfoPda] = await deriveMinterInfo(this._configPda, minterPk);
      try {
        const info = await this._program.account.minterInfo.fetch(minterInfoPda);
        entries.push({
          address: minterPk,
          quota: BigInt(info.quota.toString()),
          minted: BigInt(info.minted.toString()),
        });
      } catch {
        entries.push({ address: minterPk, quota: 0n, minted: 0n });
      }
    }
    return entries;
  }

  /**
   * Remove a minter from the role list.
   *
   * @param authority - Master authority Keypair
   * @param minter - Public key of the minter to remove
   * @returns Transaction signature
   */
  async removeMinter(authority: Keypair, minter: PublicKey): Promise<string> {
    const program = this.programWithSigner(authority);
    const [roleManagerPda] = await deriveRoleManager(this._configPda);

    return program.methods
      .removeRole({ minter: {} }, minter)
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig: this._configPda,
        roleManager: roleManagerPda,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });
  }

  // ---------------------------------------------------------------------------
  // SSS-2 Compliance
  // ---------------------------------------------------------------------------

  /**
   * Returns the ComplianceModule for SSS-2 operations (blacklist + seize).
   *
   * Calling any method on this module for an SSS-1 token will throw an error.
   * You can check `(await coin.getInfo()).enablePermanentDelegate` to
   * determine the preset before calling compliance methods.
   */
  get compliance(): ComplianceModule {
    if (!this._complianceModule) {
      this._complianceModule = new ComplianceModule(
        this._program,
        this._connection,
        this._mint,
        this._enablePermanentDelegate
      );
    }
    return this._complianceModule;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a new Program instance bound to the given signer's wallet.
   */
  private programWithSigner(signer: Keypair): Program<SssToken> {
    const provider = new ProviderCtor(
      this._connection,
      new Wallet(signer),
      { commitment: "confirmed" }
    );
    return new ProgramCtor<SssToken>(IDL, provider);
  }
}

// Re-export program IDs for consumers who need the raw keys
export { SSS_TOKEN_PROGRAM_ID, HOOK_PROGRAM_ID };
