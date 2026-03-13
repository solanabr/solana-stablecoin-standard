import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionSignature,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializePermanentDelegateInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getMintLen,
  ExtensionType,
} from "@solana/spl-token";

import {
  StablecoinCreateParams,
  StablecoinInfo,
  MintParams,
  BurnParams,
  FreezeParams,
  ThawParams,
  MinterInfo,
  RoleInfo,
  SupplyInfo,
  ROLE_FLAGS,
} from "./types";
import { resolveConfig } from "./presets";
import { ComplianceModule } from "./compliance";

// Re-export IDL type placeholder — replaced at build time with generated IDL
// For now, we use `any` and rely on Anchor's program interface
type SssTokenIDL = any;

const STABLECOIN_SEED = Buffer.from("stablecoin");
const ROLES_SEED = Buffer.from("roles");
const MINTER_SEED = Buffer.from("minter");

/**
 * SolanaStablecoin — the main SDK entry point.
 *
 * Usage:
 * ```ts
 * const stable = await SolanaStablecoin.create(connection, {
 *   preset: Presets.SSS_2,
 *   name: "My Stablecoin",
 *   symbol: "MYUSD",
 *   decimals: 6,
 *   authority: adminKeypair,
 * });
 *
 * await stable.mint({ recipient, amount: 1_000_000, minter });
 * await stable.compliance.blacklistAdd(address, "OFAC match");
 * ```
 */
export class SolanaStablecoin {
  public readonly compliance: ComplianceModule;

  private constructor(
    public readonly program: Program,
    public readonly connection: Connection,
    public readonly mint: PublicKey,
    public readonly configAddress: PublicKey,
    private info: StablecoinInfo
  ) {
    this.compliance = new ComplianceModule(
      program,
      configAddress,
      mint,
      info.enableTransferHook || info.enablePermanentDelegate
    );
  }

  // ============ Factory ============

  /**
   * Create and initialize a new stablecoin.
   */
  static async create(
    connection: Connection,
    params: StablecoinCreateParams,
    programId?: PublicKey
  ): Promise<SolanaStablecoin> {
    const provider = new AnchorProvider(
      connection,
      new Wallet(params.authority),
      { commitment: "confirmed" }
    );

    // Load IDL dynamically from on-chain or use bundled
    const pid =
      programId ??
      new PublicKey("4G5DbG9WojH11bcpHQS4wvWKT7YDdnZzaYoGjLU9NYtF");
    const idl = await Program.fetchIdl(pid, provider);
    if (!idl) throw new Error("Could not fetch IDL for program " + pid);

    const program = new Program(idl, provider);

    const resolved = resolveConfig(params);
    const decimals = params.decimals ?? 6;

    // Create the Token-2022 mint with appropriate extensions
    const mintKeypair = Keypair.generate();
    const extensions: ExtensionType[] = [];

    if (resolved.enablePermanentDelegate) {
      extensions.push(ExtensionType.PermanentDelegate);
    }
    if (resolved.enableTransferHook) {
      extensions.push(ExtensionType.TransferHook);
    }

    const mintLen = getMintLen(extensions);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    const [configPDA] = PublicKey.findProgramAddressSync(
      [STABLECOIN_SEED, mintKeypair.publicKey.toBuffer()],
      pid
    );

    const [authorityRoles] = PublicKey.findProgramAddressSync(
      [ROLES_SEED, configPDA.toBuffer(), params.authority.publicKey.toBuffer()],
      pid
    );

    // Build mint creation transaction with extensions
    const tx = new (await import("@solana/web3.js")).Transaction();

    tx.add(
      SystemProgram.createAccount({
        fromPubkey: params.authority.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      })
    );

    if (resolved.enablePermanentDelegate) {
      tx.add(
        createInitializePermanentDelegateInstruction(
          mintKeypair.publicKey,
          configPDA,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }

    tx.add(
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        configPDA, // mint authority = stablecoin config PDA
        configPDA, // freeze authority = stablecoin config PDA
        TOKEN_2022_PROGRAM_ID
      )
    );

    await provider.sendAndConfirm(tx, [params.authority, mintKeypair]);

    // Initialize stablecoin config via program
    await program.methods
      .initialize({
        name: params.name,
        symbol: params.symbol,
        uri: params.uri ?? "",
        decimals,
        enablePermanentDelegate: resolved.enablePermanentDelegate,
        enableTransferHook: resolved.enableTransferHook,
        defaultAccountFrozen: resolved.defaultAccountFrozen,
      })
      .accounts({
        authority: params.authority.publicKey,
        stablecoinConfig: configPDA,
        mint: mintKeypair.publicKey,
        authorityRoles,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([params.authority])
      .rpc();

    const info: StablecoinInfo = {
      address: configPDA,
      mint: mintKeypair.publicKey,
      authority: params.authority.publicKey,
      name: params.name,
      symbol: params.symbol,
      uri: params.uri ?? "",
      decimals,
      enablePermanentDelegate: resolved.enablePermanentDelegate,
      enableTransferHook: resolved.enableTransferHook,
      defaultAccountFrozen: resolved.defaultAccountFrozen,
      paused: false,
      totalMinted: BigInt(0),
      totalBurned: BigInt(0),
    };

    return new SolanaStablecoin(
      program,
      connection,
      mintKeypair.publicKey,
      configPDA,
      info
    );
  }

  /**
   * Load an existing stablecoin by its mint address.
   */
  static async load(
    connection: Connection,
    mint: PublicKey,
    authority: Keypair,
    programId?: PublicKey
  ): Promise<SolanaStablecoin> {
    const provider = new AnchorProvider(
      connection,
      new Wallet(authority),
      { commitment: "confirmed" }
    );

    const pid =
      programId ??
      new PublicKey("4G5DbG9WojH11bcpHQS4wvWKT7YDdnZzaYoGjLU9NYtF");
    const idl = await Program.fetchIdl(pid, provider);
    if (!idl) throw new Error("Could not fetch IDL for program " + pid);

    const program = new Program(idl, provider);

    const [configPDA] = PublicKey.findProgramAddressSync(
      [STABLECOIN_SEED, mint.toBuffer()],
      pid
    );

    const configData = await program.account.stablecoinConfig.fetch(configPDA);
    const info: StablecoinInfo = {
      address: configPDA,
      mint,
      authority: configData.authority,
      name: configData.name,
      symbol: configData.symbol,
      uri: configData.uri,
      decimals: configData.decimals,
      enablePermanentDelegate: configData.enablePermanentDelegate,
      enableTransferHook: configData.enableTransferHook,
      defaultAccountFrozen: configData.defaultAccountFrozen,
      paused: configData.paused,
      totalMinted: BigInt(configData.totalMinted.toString()),
      totalBurned: BigInt(configData.totalBurned.toString()),
    };

    return new SolanaStablecoin(program, connection, mint, configPDA, info);
  }

  // ============ Core Operations ============

  /**
   * Mint tokens to a recipient.
   */
  async mint(params: MintParams): Promise<TransactionSignature> {
    const amount = new BN(params.amount.toString());
    const [minterRoles] = PublicKey.findProgramAddressSync(
      [
        ROLES_SEED,
        this.configAddress.toBuffer(),
        params.minter.publicKey.toBuffer(),
      ],
      this.program.programId
    );
    const [minterConfig] = PublicKey.findProgramAddressSync(
      [
        MINTER_SEED,
        this.configAddress.toBuffer(),
        params.minter.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    const recipientAta = getAssociatedTokenAddressSync(
      this.mint,
      params.recipient,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    return this.program.methods
      .mint(amount)
      .accounts({
        minter: params.minter.publicKey,
        stablecoinConfig: this.configAddress,
        minterRoles,
        minterConfig,
        mint: this.mint,
        recipientTokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([params.minter])
      .rpc();
  }

  /**
   * Burn tokens.
   */
  async burn(params: BurnParams): Promise<TransactionSignature> {
    const amount = new BN(params.amount.toString());
    const [burnerRoles] = PublicKey.findProgramAddressSync(
      [
        ROLES_SEED,
        this.configAddress.toBuffer(),
        params.burner.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    const tokenAccount =
      params.tokenAccount ??
      getAssociatedTokenAddressSync(
        this.mint,
        params.burner.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

    return this.program.methods
      .burn(amount)
      .accounts({
        burner: params.burner.publicKey,
        stablecoinConfig: this.configAddress,
        burnerRoles,
        mint: this.mint,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([params.burner])
      .rpc();
  }

  /**
   * Freeze a token account.
   */
  async freezeAccount(params: FreezeParams): Promise<TransactionSignature> {
    const [freezerRoles] = PublicKey.findProgramAddressSync(
      [
        ROLES_SEED,
        this.configAddress.toBuffer(),
        params.freezer.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    return this.program.methods
      .freezeAccount()
      .accounts({
        freezer: params.freezer.publicKey,
        stablecoinConfig: this.configAddress,
        freezerRoles,
        mint: this.mint,
        targetTokenAccount: params.tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([params.freezer])
      .rpc();
  }

  /**
   * Thaw (unfreeze) a token account.
   */
  async thawAccount(params: ThawParams): Promise<TransactionSignature> {
    const [freezerRoles] = PublicKey.findProgramAddressSync(
      [
        ROLES_SEED,
        this.configAddress.toBuffer(),
        params.freezer.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    return this.program.methods
      .thawAccount()
      .accounts({
        freezer: params.freezer.publicKey,
        stablecoinConfig: this.configAddress,
        freezerRoles,
        mint: this.mint,
        targetTokenAccount: params.tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([params.freezer])
      .rpc();
  }

  /**
   * Pause all mint/burn operations.
   */
  async pause(pauser: Keypair): Promise<TransactionSignature> {
    const [pauserRoles] = PublicKey.findProgramAddressSync(
      [
        ROLES_SEED,
        this.configAddress.toBuffer(),
        pauser.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    return this.program.methods
      .pause()
      .accounts({
        pauser: pauser.publicKey,
        stablecoinConfig: this.configAddress,
        pauserRoles,
      })
      .signers([pauser])
      .rpc();
  }

  /**
   * Unpause operations.
   */
  async unpause(pauser: Keypair): Promise<TransactionSignature> {
    const [pauserRoles] = PublicKey.findProgramAddressSync(
      [
        ROLES_SEED,
        this.configAddress.toBuffer(),
        pauser.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    return this.program.methods
      .unpause()
      .accounts({
        pauser: pauser.publicKey,
        stablecoinConfig: this.configAddress,
        pauserRoles,
      })
      .signers([pauser])
      .rpc();
  }

  // ============ Role Management ============

  /**
   * Grant or revoke a role for an account.
   */
  async updateRoles(
    target: PublicKey,
    roleFlag: number,
    grant: boolean,
    authority: Keypair
  ): Promise<TransactionSignature> {
    const [targetRoles] = PublicKey.findProgramAddressSync(
      [ROLES_SEED, this.configAddress.toBuffer(), target.toBuffer()],
      this.program.programId
    );

    return this.program.methods
      .updateRoles(target, roleFlag, grant)
      .accounts({
        authority: authority.publicKey,
        stablecoinConfig: this.configAddress,
        targetRoles,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();
  }

  /**
   * Add or update a minter with quota.
   */
  async updateMinter(
    minterKey: PublicKey,
    quota: number | bigint,
    active: boolean,
    authority: Keypair
  ): Promise<TransactionSignature> {
    const [minterConfig] = PublicKey.findProgramAddressSync(
      [MINTER_SEED, this.configAddress.toBuffer(), minterKey.toBuffer()],
      this.program.programId
    );

    return this.program.methods
      .updateMinter(minterKey, new BN(quota.toString()), active)
      .accounts({
        authority: authority.publicKey,
        stablecoinConfig: this.configAddress,
        minterConfig,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();
  }

  /**
   * Transfer master authority.
   */
  async transferAuthority(
    newAuthority: PublicKey,
    currentAuthority: Keypair
  ): Promise<TransactionSignature> {
    return this.program.methods
      .transferAuthority(newAuthority)
      .accounts({
        authority: currentAuthority.publicKey,
        stablecoinConfig: this.configAddress,
      })
      .signers([currentAuthority])
      .rpc();
  }

  // ============ View Functions ============

  /**
   * Get current total supply (minted - burned on-chain supply).
   */
  async getTotalSupply(): Promise<SupplyInfo> {
    const configData = await this.program.account.stablecoinConfig.fetch(
      this.configAddress
    );
    const totalMinted = BigInt(configData.totalMinted.toString());
    const totalBurned = BigInt(configData.totalBurned.toString());

    return {
      currentSupply: totalMinted - totalBurned,
      totalMinted,
      totalBurned,
    };
  }

  /**
   * Get stablecoin configuration info.
   */
  async getInfo(): Promise<StablecoinInfo> {
    const configData = await this.program.account.stablecoinConfig.fetch(
      this.configAddress
    );
    this.info = {
      address: this.configAddress,
      mint: this.mint,
      authority: configData.authority,
      name: configData.name,
      symbol: configData.symbol,
      uri: configData.uri,
      decimals: configData.decimals,
      enablePermanentDelegate: configData.enablePermanentDelegate,
      enableTransferHook: configData.enableTransferHook,
      defaultAccountFrozen: configData.defaultAccountFrozen,
      paused: configData.paused,
      totalMinted: BigInt(configData.totalMinted.toString()),
      totalBurned: BigInt(configData.totalBurned.toString()),
    };
    return this.info;
  }

  /**
   * Get roles for a given holder.
   */
  async getRoles(holder: PublicKey): Promise<RoleInfo | null> {
    const [rolesPDA] = PublicKey.findProgramAddressSync(
      [ROLES_SEED, this.configAddress.toBuffer(), holder.toBuffer()],
      this.program.programId
    );

    try {
      const data = await this.program.account.roleAccount.fetch(rolesPDA);
      return {
        holder: data.holder,
        roles: data.roles,
        isMinter: (data.roles & ROLE_FLAGS.MINTER) !== 0,
        isBurner: (data.roles & ROLE_FLAGS.BURNER) !== 0,
        isPauser: (data.roles & ROLE_FLAGS.PAUSER) !== 0,
        isBlacklister: (data.roles & ROLE_FLAGS.BLACKLISTER) !== 0,
        isSeizer: (data.roles & ROLE_FLAGS.SEIZER) !== 0,
        isFreezer: (data.roles & ROLE_FLAGS.FREEZER) !== 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get minter info.
   */
  async getMinter(minterKey: PublicKey): Promise<MinterInfo | null> {
    const [minterPDA] = PublicKey.findProgramAddressSync(
      [MINTER_SEED, this.configAddress.toBuffer(), minterKey.toBuffer()],
      this.program.programId
    );

    try {
      const data = await this.program.account.minterConfig.fetch(minterPDA);
      return {
        address: data.minter,
        quota: BigInt(data.quota.toString()),
        minted: BigInt(data.minted.toString()),
        active: data.active,
      };
    } catch {
      return null;
    }
  }
}
