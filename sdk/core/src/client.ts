import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

import { buildPresetConfig, PRESET_ALLOWLIST } from "./presets";
import { ComplianceApi } from "./compliance";
import { RolesApi } from "./roles";
import {
  getConfigAddress,
  getRoleAddress,
  getQuotaAddress,
  getOracleConfigAddress,
  ROLE_MINTER,
  ROLE_FREEZER,
} from "./pda";
import type {
  CreateStablecoinParams,
  MintParams,
  BurnParams,
  StablecoinConfig,
  StablecoinStatus,
  OracleConfigParams,
} from "./types";

export class SolanaStablecoin {
  readonly config: StablecoinConfig;
  readonly program: Program;
  readonly mint: PublicKey;
  readonly configAddress: PublicKey;
  readonly configBump: number;
  readonly compliance: ComplianceApi;
  readonly roles: RolesApi;

  private constructor(
    program: Program,
    config: StablecoinConfig,
    mint: PublicKey,
    configAddress: PublicKey,
    configBump: number,
  ) {
    this.program = program;
    this.config = config;
    this.mint = mint;
    this.configAddress = configAddress;
    this.configBump = configBump;
    this.compliance = new ComplianceApi(program, mint, configAddress);
    this.roles = new RolesApi(program, configAddress);
  }

  /** Create and initialize a new stablecoin on-chain */
  static async create(
    program: Program,
    params: CreateStablecoinParams,
  ): Promise<{ stablecoin: SolanaStablecoin; txSignature: string; mintKeypair: Keypair }> {
    const config = buildPresetConfig(params);
    const mintKeypair = Keypair.generate();
    const mintKey = mintKeypair.publicKey;
    const [configAddress, configBump] = getConfigAddress(
      program.programId,
      mintKey,
    );

    const authority = (program.provider as AnchorProvider).publicKey;

    const complianceEnabled =
      config.extensions.permanentDelegate &&
      config.extensions.transferHook;

    const preset = config.preset;
    const enableAllowlist = params.enableAllowlist ?? (preset ? PRESET_ALLOWLIST[preset] : false);
    const supplyCap = params.supplyCap ? params.supplyCap.toNumber() : null;

    const input = {
      name: config.name,
      symbol: config.symbol,
      uri: config.uri ?? "",
      decimals: config.decimals,
      complianceEnabled,
      enableAllowlist,
      supplyCap: supplyCap !== null ? new BN(supplyCap) : null,
    };

    const txSignature = await program.methods
      .initialize(input)
      .accountsPartial({
        authority,
        mint: mintKey,
        config: configAddress,
        transferHookProgram: null,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    const stablecoin = new SolanaStablecoin(
      program,
      config,
      mintKey,
      configAddress,
      configBump,
    );

    return { stablecoin, txSignature, mintKeypair };
  }

  /** Load an existing stablecoin from on-chain state */
  static async load(
    program: Program,
    mint: PublicKey,
  ): Promise<SolanaStablecoin> {
    const [configAddress, configBump] = getConfigAddress(
      program.programId,
      mint,
    );

    const configAccount = await program.account.stablecoinConfig.fetch(
      configAddress,
    );

    const config: StablecoinConfig = {
      name: "",
      symbol: "",
      decimals: 6,
      extensions: {
        permanentDelegate: configAccount.complianceEnabled,
        transferHook: configAccount.complianceEnabled,
        defaultAccountFrozen: configAccount.complianceEnabled,
        confidentialTransfers: false,
      },
    };

    return new SolanaStablecoin(
      program,
      config,
      mint,
      configAddress,
      configBump,
    );
  }

  /** Refresh on-chain state */
  async refresh(): Promise<StablecoinStatus> {
    const account = await this.program.account.stablecoinConfig.fetch(
      this.configAddress,
    );

    const pendingAuth = account.pendingAuthority as PublicKey;
    return {
      mint: account.mint,
      authority: account.authority,
      pendingAuthority: pendingAuth.equals(PublicKey.default) ? null : pendingAuth,
      paused: account.paused,
      complianceEnabled: account.complianceEnabled,
      totalMinted: account.totalMinted,
      totalBurned: account.totalBurned,
      supplyCap: account.supplyCap ?? new BN(0),
      enableAllowlist: account.enableAllowlist ?? false,
    };
  }

  /** Mint tokens (caller must have minter role + quota) */
  async mint(params: MintParams): Promise<string> {
    const minter = (this.program.provider as AnchorProvider).publicKey;
    const [minterRole] = getRoleAddress(
      this.program.programId,
      ROLE_MINTER,
      this.configAddress,
      minter,
    );
    const [minterQuota] = getQuotaAddress(
      this.program.programId,
      this.configAddress,
      minter,
    );

    return this.program.methods
      .mintTokens(params.amount)
      .accountsPartial({
        minter,
        config: this.configAddress,
        minterRole,
        minterQuota,
        mint: this.mint,
        recipientTokenAccount: params.recipient,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /** Burn tokens from caller's account */
  async burn(params: BurnParams): Promise<string> {
    const burner = (this.program.provider as AnchorProvider).publicKey;

    return this.program.methods
      .burnTokens(params.amount)
      .accountsPartial({
        burner,
        config: this.configAddress,
        mint: this.mint,
        burnerTokenAccount: burner,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /** Freeze a token account */
  async freezeAccount(targetTokenAccount: PublicKey): Promise<string> {
    const freezer = (this.program.provider as AnchorProvider).publicKey;
    const [freezerRole] = getRoleAddress(
      this.program.programId,
      ROLE_FREEZER,
      this.configAddress,
      freezer,
    );

    return this.program.methods
      .freezeAccount()
      .accountsPartial({
        freezer,
        config: this.configAddress,
        freezerRole,
        mint: this.mint,
        targetTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /** Thaw a frozen token account */
  async thawAccount(targetTokenAccount: PublicKey): Promise<string> {
    const freezer = (this.program.provider as AnchorProvider).publicKey;
    const [freezerRole] = getRoleAddress(
      this.program.programId,
      ROLE_FREEZER,
      this.configAddress,
      freezer,
    );

    return this.program.methods
      .thawAccount()
      .accountsPartial({
        freezer,
        config: this.configAddress,
        freezerRole,
        mint: this.mint,
        targetTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /** Pause the stablecoin (authority only) */
  async pause(): Promise<string> {
    const authority = (this.program.provider as AnchorProvider).publicKey;

    return this.program.methods
      .pause()
      .accountsPartial({
        authority,
        config: this.configAddress,
      })
      .rpc();
  }

  /** Unpause the stablecoin (authority only) */
  async unpause(): Promise<string> {
    const authority = (this.program.provider as AnchorProvider).publicKey;

    return this.program.methods
      .unpause()
      .accountsPartial({
        authority,
        config: this.configAddress,
      })
      .rpc();
  }

  /** Step 1: Propose a new authority (two-step transfer for safety) */
  async proposeAuthority(newAuthority: PublicKey): Promise<string> {
    const authority = (this.program.provider as AnchorProvider).publicKey;

    return this.program.methods
      .proposeAuthority(newAuthority)
      .accountsPartial({
        authority,
        config: this.configAddress,
      })
      .rpc();
  }

  /** Step 2: Accept authority transfer (must be called by the proposed authority) */
  async acceptAuthority(): Promise<string> {
    const newAuthority = (this.program.provider as AnchorProvider).publicKey;

    return this.program.methods
      .acceptAuthority()
      .accountsPartial({
        newAuthority,
        config: this.configAddress,
      })
      .rpc();
  }

  /** Cancel a pending authority transfer */
  async cancelAuthorityTransfer(): Promise<string> {
    const authority = (this.program.provider as AnchorProvider).publicKey;

    return this.program.methods
      .cancelAuthorityTransfer()
      .accountsPartial({
        authority,
        config: this.configAddress,
      })
      .rpc();
  }

  /** Single-step immediate authority transfer */
  async transferAuthority(newAuthority: PublicKey): Promise<string> {
    const authority = (this.program.provider as AnchorProvider).publicKey;

    return this.program.methods
      .transferAuthority(newAuthority)
      .accountsPartial({
        authority,
        config: this.configAddress,
      })
      .rpc();
  }

  /** Set or update the supply cap (0 = unlimited) */
  async setSupplyCap(cap: BN): Promise<string> {
    const authority = (this.program.provider as AnchorProvider).publicKey;

    return this.program.methods
      .setSupplyCap(cap)
      .accountsPartial({
        authority,
        config: this.configAddress,
      })
      .rpc();
  }

  /** Configure oracle price feed */
  async configureOracle(params: OracleConfigParams): Promise<string> {
    const authority = (this.program.provider as AnchorProvider).publicKey;
    const [oracleConfig] = getOracleConfigAddress(
      this.program.programId,
      this.configAddress,
    );

    return this.program.methods
      .configureOracle({
        priceFeed: params.priceFeed,
        maxDeviationBps: params.maxDeviationBps,
        maxStalenessSecs: params.maxStalenessSecs,
        enabled: params.enabled,
      })
      .accountsPartial({
        authority,
        config: this.configAddress,
        oracleConfig,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /** Update a token metadata field (authority only) */
  async setMetadata(field: string, value: string): Promise<string> {
    const authority = (this.program.provider as AnchorProvider).publicKey;

    return this.program.methods
      .setMetadata({ field, value })
      .accountsPartial({
        authority,
        config: this.configAddress,
        mint: this.mint,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /** Get total supply (total_minted - total_burned) */
  async getTotalSupply(): Promise<BN> {
    const status = await this.refresh();
    return status.totalMinted.sub(status.totalBurned);
  }

  /** Get on-chain status */
  async getStatus(): Promise<StablecoinStatus> {
    return this.refresh();
  }
}
