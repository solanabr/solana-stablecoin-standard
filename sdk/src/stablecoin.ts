import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionSignature,
} from "@solana/web3.js";
import {
  Presets,
  InitializeParams,
  StablecoinConfig,
  STABLECOIN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "./types";
import { TokenOperations } from "./instructions/token-ops";
import { ComplianceModule } from "./instructions/compliance";
import { RoleManager } from "./instructions/roles";
import { findConfigPDA, findRolePDA } from "./utils/pda";

// Anchor 0.30 format IDL
import IDL_JSON from "./idl/solana_stablecoin.json";

/**
 * Main entry point for the Solana Stablecoin SDK.
 *
 * @example
 * ```typescript
 * const stable = await SolanaStablecoin.create(provider, {
 *   preset: Presets.SSS_1,
 *   name: "USD Stablecoin",
 *   symbol: "USDS",
 *   uri: "https://example.com/metadata.json",
 *   decimals: 6,
 * });
 *
 * await stable.mintTo(destinationATA, 1_000_000n);
 * ```
 */
export class SolanaStablecoin {
  public readonly provider: AnchorProvider;
  public readonly program: Program;
  public readonly mintAddress: PublicKey;
  public readonly configPDA: PublicKey;
  public readonly preset: Presets;

  public readonly tokens: TokenOperations;
  public readonly roles: RoleManager;
  public readonly compliance: ComplianceModule;

  private constructor(
    provider: AnchorProvider,
    program: Program,
    mintAddress: PublicKey,
    configPDA: PublicKey,
    preset: Presets
  ) {
    this.provider = provider;
    this.program = program;
    this.mintAddress = mintAddress;
    this.configPDA = configPDA;
    this.preset = preset;

    this.tokens = new TokenOperations(this);
    this.roles = new RoleManager(this);
    this.compliance = new ComplianceModule(this);
  }

  /** The mint public key (alias for mintAddress). */
  get mint(): PublicKey {
    return this.mintAddress;
  }

  /**
   * Create and initialize a new stablecoin on-chain.
   */
  static async create(
    provider: AnchorProvider,
    params: InitializeParams
  ): Promise<SolanaStablecoin> {
    const program = new Program(IDL_JSON as any, provider);

    const mintKeypair = Keypair.generate();
    const [configPDA] = findConfigPDA(mintKeypair.publicKey);
    const [authorityRolePDA] = findRolePDA(
      configPDA,
      provider.wallet.publicKey
    );

    let transferHookProgram = params.transferHookProgram;
    if (params.preset === Presets.SSS_2 && !transferHookProgram) {
      transferHookProgram = TRANSFER_HOOK_PROGRAM_ID;
    }

    const presetObj = (() => {
      switch (params.preset) {
        case Presets.SSS_1: return { sSS1: {} };
        case Presets.SSS_2: return { sSS2: {} };
        case Presets.Custom: return { custom: {} };
      }
    })();

    const initParams = {
      preset: presetObj,
      customFeatures: params.customFeatures
        ? {
            freezeAuthority: params.customFeatures.freezeAuthority,
            permanentDelegate: params.customFeatures.permanentDelegate,
            transferHook: params.customFeatures.transferHook,
            confidentialTransfers: params.customFeatures.confidentialTransfers,
          }
        : null,
      name: params.name,
      symbol: params.symbol,
      uri: params.uri,
      decimals: params.decimals,
      transferHookProgram: transferHookProgram || null,
      defaultAccountFrozen: params.defaultAccountFrozen ?? false,
    };

    await (program.methods as any)
      .initialize(initParams)
      .accounts({
        authority: provider.wallet.publicKey,
        config: configPDA,
        mint: mintKeypair.publicKey,
        authorityRole: authorityRolePDA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    const instance = new SolanaStablecoin(
      provider,
      program,
      mintKeypair.publicKey,
      configPDA,
      params.preset
    );

    // For SSS-2, automatically initialize the transfer hook's extra account
    // metas PDA so blacklist enforcement works on Token-2022 transfers.
    if (params.preset === Presets.SSS_2) {
      try {
        await instance.compliance.initializeTransferHook();
      } catch (err: any) {
        console.warn(
          `Warning: Transfer hook initialization failed (${err.message}). ` +
          `Call compliance.initializeTransferHook() after deploying the hook program.`
        );
      }
    }

    return instance;
  }

  /**
   * Load an existing stablecoin from its mint address.
   */
  static async load(
    provider: AnchorProvider,
    mint: PublicKey
  ): Promise<SolanaStablecoin> {
    const program = new Program(IDL_JSON as any, provider);

    const [configPDA] = findConfigPDA(mint);
    const configAccount = await (program.account as any).stablecoinConfig.fetch(configPDA);

    let preset: Presets;
    if ("sSS1" in configAccount.preset || "sss1" in configAccount.preset) {
      preset = Presets.SSS_1;
    } else if ("sSS2" in configAccount.preset || "sss2" in configAccount.preset) {
      preset = Presets.SSS_2;
    } else {
      preset = Presets.Custom;
    }

    return new SolanaStablecoin(provider, program, mint, configPDA, preset);
  }

  /**
   * Fetch the current on-chain configuration.
   */
  async getConfig(): Promise<StablecoinConfig> {
    const raw = await (this.program.account as any).stablecoinConfig.fetch(this.configPDA);

    let preset: Presets;
    if ("sSS1" in raw.preset || "sss1" in raw.preset) {
      preset = Presets.SSS_1;
    } else if ("sSS2" in raw.preset || "sss2" in raw.preset) {
      preset = Presets.SSS_2;
    } else {
      preset = Presets.Custom;
    }

    return {
      bump: raw.bump,
      mint: raw.mint,
      authority: raw.authority,
      preset,
      features: {
        freezeAuthority: raw.features.freezeAuthority,
        permanentDelegate: raw.features.permanentDelegate,
        transferHook: raw.features.transferHook,
        confidentialTransfers: raw.features.confidentialTransfers,
      },
      paused: raw.paused,
      defaultAccountFrozen: raw.defaultAccountFrozen,
      totalMinted: BigInt(raw.totalMinted.toString()),
      totalBurned: BigInt(raw.totalBurned.toString()),
      decimals: raw.decimals,
      name: Buffer.from(raw.name).toString("utf8").replace(/\0/g, ""),
      symbol: Buffer.from(raw.symbol).toString("utf8").replace(/\0/g, ""),
      transferHookProgram: raw.transferHookProgram,
      createdAt: BigInt(raw.createdAt.toString()),
      updatedAt: BigInt(raw.updatedAt.toString()),
    };
  }

  async circulatingSupply(): Promise<bigint> {
    const config = await this.getConfig();
    return config.totalMinted - config.totalBurned;
  }

  isComplianceEnabled(): boolean {
    return this.preset === Presets.SSS_2;
  }

  // ─── Convenience Methods ───────────────────────────────────────

  async mintTo(destination: PublicKey, amount: bigint): Promise<TransactionSignature> {
    return this.tokens.mint(destination, amount);
  }

  async burn(source: PublicKey, amount: bigint): Promise<TransactionSignature> {
    return this.tokens.burn(source, amount);
  }

  async pause(): Promise<TransactionSignature> {
    return this.tokens.pause();
  }

  async unpause(): Promise<TransactionSignature> {
    return this.tokens.unpause();
  }
}
