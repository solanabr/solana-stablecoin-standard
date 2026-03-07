import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  AccountMeta,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { AnchorProvider, Program, Idl, BN, Wallet } from "@coral-xyz/anchor";

import rawIdl from "./idl/sss.json";
import { Compliance } from "./compliance";
import {
  PROGRAM_ID,
  getConfigPda,
  getMintAuthorityPda,
  getFreezeAuthorityPda,
  getPauseAuthorityPda,
  getSeizerAuthorityPda,
  getMasterRolePda,
  getMinterAccountPda,
  getBurnerRolePda,
  getPauserRolePda,
  getEventAuthorityPda,
  getRoleAccountPda,
  MINTER_ROLE,
  BURNER_ROLE,
  PAUSER_ROLE,
  BLACKLISTER_ROLE,
  SEIZER_ROLE,
} from "./pda";
import { Preset, PRESET_CONFIGS } from "./presets";
import type {
  CreateParams,
  CustomCreateParams,
  MintParams,
  BurnParams,
  UpdateMinterParams,
  UpdateRoleEntry,
  StablecoinConfigData,
} from "./types";

const IDL = rawIdl as unknown as Idl;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SssProgram = Program<any>;

function toRoleBuffer(role: UpdateRoleEntry["role"]): Buffer {
  switch (role) {
    case "minter":
      return MINTER_ROLE;
    case "burner":
      return BURNER_ROLE;
    case "pauser":
      return PAUSER_ROLE;
    case "blacklister":
      return BLACKLISTER_ROLE;
    case "seizer":
      return SEIZER_ROLE;
    case "master":
      return Buffer.from("master");
  }
}

function toBN(value: bigint | number): BN {
  return new BN(value.toString());
}

function buildProvider(
  connection: Connection,
  keypair: Keypair,
): AnchorProvider {
  return new AnchorProvider(connection, new Wallet(keypair), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

function buildProgram(provider: AnchorProvider): SssProgram {
  return new Program(IDL, provider);
}

/**
 * TypeScript SDK for the Solana Stablecoin Standard (SSS) program.
 *
 * @example
 * ```ts
 * import { SolanaStablecoin, Presets } from "@stbr/sss-token";
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
 * ```
 */
export class SolanaStablecoin {
  /** The on-chain mint public key. */
  readonly mintAddress: PublicKey;
  readonly config: StablecoinConfigData;
  readonly compliance: Compliance;

  private constructor(
    private readonly program: SssProgram,
    mintAddress: PublicKey,
    config: StablecoinConfigData,
  ) {
    this.mintAddress = mintAddress;
    this.config = config;
    this.compliance = new Compliance(program, mintAddress, () => this.config);
  }

  // ---------------------------------------------------------------------------
  // Static factories
  // ---------------------------------------------------------------------------

  /**
   * Initialize a new stablecoin on-chain and return the SDK instance.
   *
   * @param connection - Solana RPC connection.
   * @param params - Preset or custom creation parameters (must include `authority` Keypair).
   * @returns A fully loaded SolanaStablecoin instance.
   */
  static async create(
    connection: Connection,
    params: CreateParams,
  ): Promise<SolanaStablecoin> {
    const authority = params.authority;
    const provider = buildProvider(connection, authority);
    const program = buildProgram(provider);

    const mintKeypair = params.mintKeypair ?? Keypair.generate();
    const mintPk = mintKeypair.publicKey;

    // Resolve name / symbol / decimals / uri / extensions from preset or custom params
    let name: string;
    let symbol: string;
    let decimals: number;
    let uri: string;
    let standardArg: Record<string, Record<string, never>>;
    let enablePermanentDelegate: boolean;
    let enableTransferHook: boolean;
    let defaultAccountFrozen: boolean;

    if (params.preset !== undefined) {
      const preset = PRESET_CONFIGS[params.preset as Preset];
      name = params.name ?? preset.name;
      symbol = params.symbol ?? preset.symbol;
      decimals = params.decimals ?? preset.decimals;
      uri = params.uri ?? preset.uri;
      enablePermanentDelegate = preset.extensions.permanentDelegate;
      enableTransferHook = preset.extensions.transferHook;
      defaultAccountFrozen = preset.extensions.defaultAccountFrozen;
      standardArg =
        preset.standard === "sss2" ? { sss2: {} } : { sss1: {} };
    } else {
      const custom = params as CustomCreateParams;
      name = custom.name;
      symbol = custom.symbol;
      decimals = custom.decimals;
      uri = custom.uri ?? "https://example.com/metadata.json";
      const ext = custom.extensions ?? {};
      enablePermanentDelegate = ext.permanentDelegate ?? false;
      enableTransferHook = ext.transferHook ?? false;
      defaultAccountFrozen = ext.defaultAccountFrozen ?? false;
      const isSss2 =
        enablePermanentDelegate || enableTransferHook || defaultAccountFrozen;
      standardArg = isSss2 ? { sss2: {} } : { sss1: {} };
    }

    const masterKey = authority.publicKey;
    const minterKey = params.minter ?? authority.publicKey;
    const initialAllowance = params.initialAllowance ?? BigInt(1_000_000_000_000);

    const [configPda] = getConfigPda(PROGRAM_ID, mintPk);
    const [mintAuthority] = getMintAuthorityPda(PROGRAM_ID, mintPk);
    const [freezeAuthority] = getFreezeAuthorityPda(PROGRAM_ID, mintPk);
    const [pauseAuthority] = getPauseAuthorityPda(PROGRAM_ID, mintPk);
    const [seizerAuthority] = getSeizerAuthorityPda(PROGRAM_ID, mintPk);
    const [masterRole] = getMasterRolePda(PROGRAM_ID, mintPk, masterKey);
    const [minterAccount] = getMinterAccountPda(PROGRAM_ID, mintPk, minterKey);

    await program.methods
      .initialize(
        standardArg,
        name,
        symbol,
        uri,
        decimals,
        masterKey,
        minterKey,
        toBN(initialAllowance),
        enablePermanentDelegate,
        enableTransferHook,
        defaultAccountFrozen,
      )
      .accountsStrict({
        admin: authority.publicKey,
        mint: mintPk,
        config: configPda,
        mintAuthority,
        freezeAuthority,
        pauseAuthority,
        seizerAuthority,
        masterRole,
        minterAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        eventAuthority: getEventAuthorityPda(PROGRAM_ID),
        program: PROGRAM_ID,
      })
      .signers([mintKeypair])
      .rpc();

    return SolanaStablecoin.load(connection, mintPk, authority);
  }

  /**
   * Load an existing stablecoin from an on-chain mint address.
   *
   * @param connection - Solana RPC connection.
   * @param mintAddress - The mint public key of the stablecoin.
   * @param signer - Optional signer keypair for write operations. Defaults to a read-only dummy.
   * @returns A SolanaStablecoin instance with cached config.
   */
  static async load(
    connection: Connection,
    mintAddress: PublicKey,
    signer?: Keypair,
  ): Promise<SolanaStablecoin> {
    const keypair = signer ?? Keypair.generate();
    const provider = buildProvider(connection, keypair);
    const program = buildProgram(provider);

    const [configPda] = getConfigPda(PROGRAM_ID, mintAddress);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawConfig = await (program.account as any).stablecoinConfig.fetch(configPda);

    const config: StablecoinConfigData = {
      bump: rawConfig.bump as number,
      standard: rawConfig.standard as StablecoinConfigData["standard"],
      name: rawConfig.name as string,
      symbol: rawConfig.symbol as string,
      uri: rawConfig.uri as string,
      decimals: rawConfig.decimals as number,
      enablePermanentDelegate: rawConfig.enablePermanentDelegate as boolean,
      enableTransferHook: rawConfig.enableTransferHook as boolean,
      defaultAccountFrozen: rawConfig.defaultAccountFrozen as boolean,
    };

    return new SolanaStablecoin(program, mintAddress, config);
  }

  // ---------------------------------------------------------------------------
  // Read-only helpers
  // ---------------------------------------------------------------------------

  /** Return the current total supply (in base units). */
  async getTotalSupply(): Promise<bigint> {
    const supplyInfo = await this.program.provider.connection.getTokenSupply(
      this.mintAddress,
    );
    return BigInt(supplyInfo.value.amount);
  }

  /** Derive the associated token account for a wallet (Token-2022). */
  getAssociatedTokenAddress(owner: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(
      this.mintAddress,
      owner,
      true,
      TOKEN_2022_PROGRAM_ID,
    );
  }

  // ---------------------------------------------------------------------------
  // Write operations
  // ---------------------------------------------------------------------------

  /**
   * Mint tokens to a recipient's associated token account.
   * The minter keypair (or provider wallet) must hold a MinterAccount PDA.
   */
  async mint(params: MintParams): Promise<string> {
    const minterKeypair = params.minter;
    const minterKey = minterKeypair
      ? minterKeypair.publicKey
      : this.program.provider.publicKey!;

    const toAta = getAssociatedTokenAddressSync(
      this.mintAddress,
      params.recipient,
      true,
      TOKEN_2022_PROGRAM_ID,
    );

    const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      minterKey,
      toAta,
      params.recipient,
      this.mintAddress,
      TOKEN_2022_PROGRAM_ID,
    );

    const [minterAccount] = getMinterAccountPda(PROGRAM_ID, this.mintAddress, minterKey);
    const [mintAuthority] = getMintAuthorityPda(PROGRAM_ID, this.mintAddress);

    const extraSigners = minterKeypair ? [minterKeypair] : [];

    const sig = await this.program.methods
      .mintTokens(toBN(params.amount))
      .accountsStrict({
        minter: minterKey,
        mint: this.mintAddress,
        to: toAta,
        minterAccount,
        mintAuthority,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        eventAuthority: getEventAuthorityPda(PROGRAM_ID),
        program: PROGRAM_ID,
      })
      .preInstructions([createAtaIx])
      .signers(extraSigners)
      .rpc();

    return sig;
  }

  /**
   * Burn tokens from a token account.
   * The burner keypair (or provider wallet) must hold a burner RoleAccount PDA.
   */
  async burn(params: BurnParams): Promise<string> {
    const burnerKeypair = params.burner;
    const burnerKey = burnerKeypair
      ? burnerKeypair.publicKey
      : this.program.provider.publicKey!;

    const [burnerRole] = getBurnerRolePda(PROGRAM_ID, this.mintAddress, burnerKey);

    const extraSigners = burnerKeypair ? [burnerKeypair] : [];

    const sig = await this.program.methods
      .burnTokens(toBN(params.amount))
      .accountsStrict({
        burner: burnerKey,
        mint: this.mintAddress,
        from: params.from,
        burnerRole,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        eventAuthority: getEventAuthorityPda(PROGRAM_ID),
        program: PROGRAM_ID,
      })
      .signers(extraSigners)
      .rpc();

    return sig;
  }

  /**
   * Freeze a token account.
   * The provider wallet must hold the master role.
   * @param accountAta - The token account (ATA) to freeze.
   * @param master - Keypair with the master role. Defaults to the provider wallet.
   */
  async freeze(accountAta: PublicKey, master?: Keypair): Promise<string> {
    const masterKey = master
      ? master.publicKey
      : this.program.provider.publicKey!;

    const [masterRole] = getMasterRolePda(PROGRAM_ID, this.mintAddress, masterKey);
    const [freezeAuthority] = getFreezeAuthorityPda(PROGRAM_ID, this.mintAddress);

    const extraSigners = master ? [master] : [];

    const sig = await this.program.methods
      .freezeAccount()
      .accountsStrict({
        master: masterKey,
        mint: this.mintAddress,
        ataToFreeze: accountAta,
        masterRole,
        freezeAuthority,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        eventAuthority: getEventAuthorityPda(PROGRAM_ID),
        program: PROGRAM_ID,
      })
      .signers(extraSigners)
      .rpc();

    return sig;
  }

  /**
   * Thaw (unfreeze) a token account.
   * The provider wallet must hold the master role.
   * @param accountAta - The token account (ATA) to thaw.
   * @param master - Keypair with the master role. Defaults to the provider wallet.
   */
  async thaw(accountAta: PublicKey, master?: Keypair): Promise<string> {
    const masterKey = master
      ? master.publicKey
      : this.program.provider.publicKey!;

    const [masterRole] = getMasterRolePda(PROGRAM_ID, this.mintAddress, masterKey);
    const [freezeAuthority] = getFreezeAuthorityPda(PROGRAM_ID, this.mintAddress);

    const extraSigners = master ? [master] : [];

    const sig = await this.program.methods
      .thawAccount()
      .accountsStrict({
        master: masterKey,
        mint: this.mintAddress,
        ataToThaw: accountAta,
        masterRole,
        freezeAuthority,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        eventAuthority: getEventAuthorityPda(PROGRAM_ID),
        program: PROGRAM_ID,
      })
      .signers(extraSigners)
      .rpc();

    return sig;
  }

  /**
   * Pause all token transfers (SSS-2 mints with PausableConfig extension).
   * @param pauser - Keypair with the pauser role. Defaults to the provider wallet.
   */
  async pause(pauser?: Keypair): Promise<string> {
    const pauserKey = pauser
      ? pauser.publicKey
      : this.program.provider.publicKey!;

    const [pauserRole] = getPauserRolePda(PROGRAM_ID, this.mintAddress, pauserKey);
    const [pauseAuthority] = getPauseAuthorityPda(PROGRAM_ID, this.mintAddress);

    const extraSigners = pauser ? [pauser] : [];

    const sig = await this.program.methods
      .pause()
      .accountsStrict({
        pauser: pauserKey,
        mint: this.mintAddress,
        pauserRole,
        pauseAuthority,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        eventAuthority: getEventAuthorityPda(PROGRAM_ID),
        program: PROGRAM_ID,
      })
      .signers(extraSigners)
      .rpc();

    return sig;
  }

  /**
   * Unpause token transfers.
   * @param pauser - Keypair with the pauser role. Defaults to the provider wallet.
   */
  async unpause(pauser?: Keypair): Promise<string> {
    const pauserKey = pauser
      ? pauser.publicKey
      : this.program.provider.publicKey!;

    const [pauserRole] = getPauserRolePda(PROGRAM_ID, this.mintAddress, pauserKey);
    const [pauseAuthority] = getPauseAuthorityPda(PROGRAM_ID, this.mintAddress);

    const extraSigners = pauser ? [pauser] : [];

    const sig = await this.program.methods
      .unpause()
      .accountsStrict({
        pauser: pauserKey,
        mint: this.mintAddress,
        pauserRole,
        pauseAuthority,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        eventAuthority: getEventAuthorityPda(PROGRAM_ID),
        program: PROGRAM_ID,
      })
      .signers(extraSigners)
      .rpc();

    return sig;
  }

  /**
   * Add or remove a minter's allowance.
   * The provider wallet (or `master` param) must hold the master role.
   */
  async updateMinter(params: UpdateMinterParams): Promise<string> {
    const masterKeypair = params.master;
    const masterKey = masterKeypair
      ? masterKeypair.publicKey
      : this.program.provider.publicKey!;

    const [masterRole] = getMasterRolePda(PROGRAM_ID, this.mintAddress, masterKey);
    const [updateMinterPda] = getMinterAccountPda(
      PROGRAM_ID,
      this.mintAddress,
      params.minter,
    );

    const allowance =
      params.operation === "add"
        ? toBN(params.allowance ?? 1_000_000_000_000)
        : new BN(0);

    const extraSigners = masterKeypair ? [masterKeypair] : [];

    const sig = await this.program.methods
      .updateMinter(params.operation, params.minter, allowance)
      .accountsStrict({
        master: masterKey,
        mint: this.mintAddress,
        masterRole,
        updateMinter: updateMinterPda,
        systemProgram: SystemProgram.programId,
        eventAuthority: getEventAuthorityPda(PROGRAM_ID),
        program: PROGRAM_ID,
      })
      .signers(extraSigners)
      .rpc();

    return sig;
  }

  /**
   * Update one or more role assignments in a single transaction.
   * Each entry specifies the role name, old holder (optional, will close PDA),
   * and new holder. The provider wallet (or `master` param) must hold the master role.
   *
   * Remaining accounts order: [oldPDA (if present), newPDA] for each entry.
   */
  async updateRoles(
    roles: UpdateRoleEntry[],
    master?: Keypair,
  ): Promise<string> {
    const masterKey = master
      ? master.publicKey
      : this.program.provider.publicKey!;

    const [masterRole] = getMasterRolePda(PROGRAM_ID, this.mintAddress, masterKey);

    const remainingAccounts: AccountMeta[] = [];
    for (const entry of roles) {
      const roleBuf = toRoleBuffer(entry.role);
      if (entry.oldKey) {
        const [oldPda] = getRoleAccountPda(
          PROGRAM_ID,
          this.mintAddress,
          roleBuf,
          entry.oldKey,
        );
        remainingAccounts.push({ pubkey: oldPda, isSigner: false, isWritable: true });
      }
      const [newPda] = getRoleAccountPda(
        PROGRAM_ID,
        this.mintAddress,
        roleBuf,
        entry.newKey,
      );
      remainingAccounts.push({ pubkey: newPda, isSigner: false, isWritable: true });
    }

    const roleArgs = roles.map((e) => ({
      role: e.role,
      oldKey: e.oldKey ?? null,
      newKey: e.newKey,
      allowance: toBN(e.allowance ?? 0),
    }));

    const extraSigners = master ? [master] : [];

    const sig = await this.program.methods
      .updateRoles(roleArgs)
      .accountsStrict({
        master: masterKey,
        mint: this.mintAddress,
        masterRole,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        eventAuthority: getEventAuthorityPda(PROGRAM_ID),
        program: PROGRAM_ID,
      })
      .remainingAccounts(remainingAccounts)
      .signers(extraSigners)
      .rpc();

    return sig;
  }

  /**
   * Transfer the master authority to a new public key.
   * The current master role PDA is closed and a new one is created.
   * @param newMaster - The new master's public key.
   * @param master - Current master keypair. Defaults to the provider wallet.
   */
  async transferAuthority(newMaster: PublicKey, master?: Keypair): Promise<string> {
    const masterKey = master
      ? master.publicKey
      : this.program.provider.publicKey!;

    const [masterRole] = getMasterRolePda(PROGRAM_ID, this.mintAddress, masterKey);
    const [newMasterRole] = getMasterRolePda(PROGRAM_ID, this.mintAddress, newMaster);

    const extraSigners = master ? [master] : [];

    const sig = await this.program.methods
      .transferAuthority(newMaster)
      .accountsStrict({
        master: masterKey,
        mint: this.mintAddress,
        masterRole,
        newMasterRole,
        systemProgram: SystemProgram.programId,
        eventAuthority: getEventAuthorityPda(PROGRAM_ID),
        program: PROGRAM_ID,
      })
      .signers(extraSigners)
      .rpc();

    return sig;
  }

  /** Refresh the cached on-chain config. Returns the updated config. */
  async refresh(): Promise<StablecoinConfigData> {
    const [configPda] = getConfigPda(PROGRAM_ID, this.mintAddress);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawConfig = await (this.program.account as any).stablecoinConfig.fetch(configPda);

    const updated: StablecoinConfigData = {
      bump: rawConfig.bump as number,
      standard: rawConfig.standard as StablecoinConfigData["standard"],
      name: rawConfig.name as string,
      symbol: rawConfig.symbol as string,
      uri: rawConfig.uri as string,
      decimals: rawConfig.decimals as number,
      enablePermanentDelegate: rawConfig.enablePermanentDelegate as boolean,
      enableTransferHook: rawConfig.enableTransferHook as boolean,
      defaultAccountFrozen: rawConfig.defaultAccountFrozen as boolean,
    };

    // Mutate to keep compliance reference consistent
    Object.assign(this.config, updated);
    return updated;
  }
}
