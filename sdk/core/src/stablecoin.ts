import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  Program,
  AnchorProvider,
  Wallet,
  setProvider,
} from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getMint,
  getAccount,
} from "@solana/spl-token";
import BN from "bn.js";

import { findConfigPda, findMinterPda } from "./pda";
import { ComplianceModule } from "./compliance";
import { MintersModule } from "./minters";
import { Presets } from "./presets";
import { NotCompliantPresetError } from "./errors";
import {
  InitializeParams,
  MintParams,
  BurnParams,
  UpdateRolesParams,
  StablecoinStatus,
  StablecoinConfigData,
  PRESET_SSS2,
} from "./types";

// IDL placeholders — replaced with generated IDLs after anchor build
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SSS_TOKEN_IDL = (() => {
  try {
    return require("./idl/sss_token.json");
  } catch {
    return null;
  }
})();

export interface SolanaStablecoinOptions {
  /** sss-token program ID (defaults to mainnet/devnet deploy address) */
  programId?: PublicKey;
  /** sss-transfer-hook program ID (for SSS-2 mints) */
  hookProgramId?: PublicKey;
}

export interface CreateConfig extends InitializeParams {
  /** Use a preset — Presets.SSS_1 or Presets.SSS_2 */
  preset?: typeof Presets.SSS_1 | typeof Presets.SSS_2;
  /** Authority keypair (pays for account creation) */
  authority: Keypair;
  /** Provide a specific mint keypair or one will be generated */
  mintKeypair?: Keypair;
}

const DEFAULT_PROGRAM_ID = new PublicKey(
  "AeCfxEUv75EWAGgjnhAZhViFbkfsP1imLsg4xb3xuntm"
);
const DEFAULT_HOOK_PROGRAM_ID = new PublicKey(
  "9bFjVjyZ3vVmNBFaVVKmjVrzcwwzRNuwWqYpqeM2pzF7"
);

export class SolanaStablecoin {
  private _compliance: ComplianceModule | null = null;
  private _minters: MintersModule | null = null;

  private constructor(
    readonly connection: Connection,
    readonly mint: PublicKey,
    private readonly _config: StablecoinConfigData,
    readonly program: Program,
    readonly hookProgramId: PublicKey,
    readonly configPda: PublicKey
  ) {}

  // ─── Factory methods ────────────────────────────────────────────────────────

  /**
   * Create a new stablecoin mint and initialize it with the given params.
   * Uses a preset (SSS-1 or SSS-2) or custom configuration.
   */
  static async create(
    connection: Connection,
    config: CreateConfig,
    options: SolanaStablecoinOptions = {}
  ): Promise<SolanaStablecoin> {
    const programId = options.programId ?? DEFAULT_PROGRAM_ID;
    const hookProgramId = options.hookProgramId ?? DEFAULT_HOOK_PROGRAM_ID;

    const provider = new AnchorProvider(
      connection,
      new Wallet(config.authority),
      { commitment: "confirmed" }
    );
    setProvider(provider);
    const idl = { ...SSS_TOKEN_IDL, address: programId.toBase58() };
    const program = new Program(idl, provider);

    const mintKeypair = config.mintKeypair ?? Keypair.generate();

    // Merge preset with explicit params
    const presetConfig = config.preset ?? Presets.SSS_1;
    const enablePermanentDelegate =
      config.enablePermanentDelegate ?? presetConfig.enablePermanentDelegate;
    const enableTransferHook =
      config.enableTransferHook ?? presetConfig.enableTransferHook;

    const params = {
      name: config.name,
      symbol: config.symbol,
      uri: config.uri ?? "",
      decimals: config.decimals ?? 6,
      enablePermanentDelegate,
      enableTransferHook,
      defaultAccountFrozen: config.defaultAccountFrozen ?? false,
      transferHookProgramId: enableTransferHook ? hookProgramId : null,
      burner: config.burner ?? null,
      pauser: config.pauser ?? null,
      blacklister: config.blacklister ?? null,
      seizer: config.seizer ?? null,
    };

    const [configPda] = findConfigPda(mintKeypair.publicKey, programId);

    await program.methods
      .initialize(params)
      .accounts({
        authority: config.authority.publicKey,
        mint: mintKeypair.publicKey,
        config: configPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([config.authority, mintKeypair])
      .rpc();

    const configData = await (program.account as any).stablecoinConfig.fetch(configPda) as StablecoinConfigData;

    return new SolanaStablecoin(
      connection,
      mintKeypair.publicKey,
      configData,
      program,
      hookProgramId,
      configPda
    );
  }

  /**
   * Load an existing stablecoin instance by mint address.
   */
  static async load(
    connection: Connection,
    mint: PublicKey,
    authority: Keypair,
    options: SolanaStablecoinOptions = {}
  ): Promise<SolanaStablecoin> {
    const programId = options.programId ?? DEFAULT_PROGRAM_ID;
    const hookProgramId = options.hookProgramId ?? DEFAULT_HOOK_PROGRAM_ID;

    const provider = new AnchorProvider(
      connection,
      new Wallet(authority),
      { commitment: "confirmed" }
    );
    const idl = { ...SSS_TOKEN_IDL, address: programId.toBase58() };
    const program = new Program(idl, provider);
    const [configPda] = findConfigPda(mint, programId);
    const configData = await (program.account as any).stablecoinConfig.fetch(configPda) as StablecoinConfigData;

    return new SolanaStablecoin(
      connection,
      mint,
      configData,
      program,
      hookProgramId,
      configPda
    );
  }

  // ─── Lazy-initialized modules ───────────────────────────────────────────────

  /**
   * Compliance module (SSS-2 only).
   * Throws NotCompliantPresetError if this is an SSS-1 mint.
   */
  get compliance(): ComplianceModule {
    if (this._config.preset !== PRESET_SSS2) {
      throw new NotCompliantPresetError();
    }
    if (!this._compliance) {
      this._compliance = new ComplianceModule(
        this.program,
        this.mint,
        this.configPda,
        TOKEN_2022_PROGRAM_ID
      );
    }
    return this._compliance;
  }

  get minters(): MintersModule {
    if (!this._minters) {
      this._minters = new MintersModule(
        this.program,
        this.mint,
        this.configPda
      );
    }
    return this._minters;
  }

  // ─── Core operations ────────────────────────────────────────────────────────

  async mintTokens(params: MintParams, minter: Keypair): Promise<string> {
    const amount = new BN(params.amount.toString());
    const [minterInfoPda] = findMinterPda(
      this.mint,
      minter.publicKey,
      this.program.programId
    );
    const recipientAta = getAssociatedTokenAddressSync(
      this.mint,
      params.recipient,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    return this.program.methods
      .mintTokens(amount)
      .accounts({
        minter: minter.publicKey,
        config: this.configPda,
        minterInfo: minterInfoPda,
        mint: this.mint,
        recipientTokenAccount: recipientAta,
        recipient: params.recipient,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([minter])
      .rpc();
  }

  async burn(params: BurnParams, burner: Keypair): Promise<string> {
    const amount = new BN(params.amount.toString());

    // tokenAccountOwner must also sign
    const ownerKeypair = Keypair.fromSecretKey(new Uint8Array(0)); // placeholder
    return this.program.methods
      .burnTokens(amount)
      .accounts({
        burner: burner.publicKey,
        config: this.configPda,
        mint: this.mint,
        tokenAccount: params.tokenAccount,
        tokenAccountOwner: params.tokenAccountOwner,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([burner])
      .rpc();
  }

  async freeze(tokenAccount: PublicKey, authority: Keypair): Promise<string> {
    return this.program.methods
      .freezeTokenAccount()
      .accounts({
        authority: authority.publicKey,
        config: this.configPda,
        mint: this.mint,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();
  }

  async thaw(tokenAccount: PublicKey, authority: Keypair): Promise<string> {
    return this.program.methods
      .thawTokenAccount()
      .accounts({
        authority: authority.publicKey,
        config: this.configPda,
        mint: this.mint,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();
  }

  async pause(authority: Keypair): Promise<string> {
    return this.program.methods
      .pause()
      .accounts({
        authority: authority.publicKey,
        config: this.configPda,
      })
      .signers([authority])
      .rpc();
  }

  async unpause(authority: Keypair): Promise<string> {
    return this.program.methods
      .unpause()
      .accounts({
        authority: authority.publicKey,
        config: this.configPda,
      })
      .signers([authority])
      .rpc();
  }

  async updateRoles(
    params: UpdateRolesParams,
    authority: Keypair
  ): Promise<string> {
    return this.program.methods
      .updateRoles({
        burner: params.burner ?? null,
        pauser: params.pauser ?? null,
        blacklister: params.blacklister ?? null,
        seizer: params.seizer ?? null,
      })
      .accounts({
        authority: authority.publicKey,
        config: this.configPda,
      })
      .signers([authority])
      .rpc();
  }

  async transferAuthority(
    newAuthority: PublicKey,
    currentAuthority: Keypair
  ): Promise<string> {
    return this.program.methods
      .transferAuthority(newAuthority)
      .accounts({
        authority: currentAuthority.publicKey,
        config: this.configPda,
      })
      .signers([currentAuthority])
      .rpc();
  }

  // ─── Queries ─────────────────────────────────────────────────────────────────

  async getConfig(): Promise<StablecoinConfigData> {
    return (this.program.account as any).stablecoinConfig.fetch(
      this.configPda
    ) as Promise<StablecoinConfigData>;
  }

  async getTotalSupply(): Promise<bigint> {
    const mintInfo = await getMint(
      this.connection,
      this.mint,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    return mintInfo.supply;
  }

  async getStatus(): Promise<StablecoinStatus> {
    const [config, supply] = await Promise.all([
      this.getConfig(),
      this.getTotalSupply(),
    ]);
    const presetName =
      config.preset === PRESET_SSS2
        ? ("SSS-2" as const)
        : ("SSS-1" as const);
    return {
      mint: this.mint.toBase58(),
      name: config.name,
      symbol: config.symbol,
      decimals: config.decimals,
      paused: config.paused,
      preset: presetName,
      supply,
      authority: config.authority.toBase58(),
    };
  }
}
