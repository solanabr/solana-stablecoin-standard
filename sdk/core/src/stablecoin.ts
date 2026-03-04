import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { AnchorProvider, BN, Program, Idl } from "@coral-xyz/anchor";
import { Wallet } from "@coral-xyz/anchor";
import {
  SSS_TOKEN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  Presets,
  CreateOptions,
  StablecoinConfigState,
  MintOptions,
  RoleType,
} from "./types";
import {
  getConfigAddress,
  getMinterAddress,
  getExtraAccountMetasAddress,
} from "./pda";
import { ComplianceModule } from "./compliance";

export class SolanaStablecoin {
  readonly connection: Connection;
  readonly program: Program;
  /** The mint public key. Use `mintAddress` to avoid collision with the `mint()` method. */
  readonly mintAddress: PublicKey;
  readonly config: PublicKey;
  private _state: StablecoinConfigState | null = null;

  private constructor(
    connection: Connection,
    program: Program,
    mintAddress: PublicKey,
    config: PublicKey
  ) {
    this.connection = connection;
    this.program = program;
    this.mintAddress = mintAddress;
    this.config = config;
  }

  /** Load an existing stablecoin by mint address */
  static async load(
    connection: Connection,
    authority: Keypair,
    mintAddress: PublicKey
  ): Promise<SolanaStablecoin> {
    const provider = new AnchorProvider(
      connection,
      new Wallet(authority),
      { commitment: "confirmed" }
    );
    // Load IDL from target — falls back to minimal type if not built yet
    let idl: Idl;
    try {
      idl = require("../../target/idl/sss_token.json");
    } catch {
      throw new Error(
        "IDL not found. Run `anchor build` first to generate the IDL."
      );
    }
    // Anchor 0.32: Program(idl, provider?) — program ID is read from idl.address
    const program = new Program(idl, provider);
    const [config] = getConfigAddress(mintAddress);
    return new SolanaStablecoin(connection, program, mintAddress, config);
  }

  /** Create and initialize a new stablecoin */
  static async create(
    connection: Connection,
    options: CreateOptions
  ): Promise<SolanaStablecoin> {
    const {
      preset,
      name,
      symbol,
      uri = "",
      decimals = 6,
      authority,
    } = options;

    const provider = new AnchorProvider(
      connection,
      new Wallet(authority),
      { commitment: "confirmed" }
    );

    let idl: Idl;
    try {
      idl = require("../../target/idl/sss_token.json");
    } catch {
      throw new Error("IDL not found. Run `anchor build` first.");
    }

    // Anchor 0.32: Program(idl, provider?) — program ID is read from idl.address
    const program = new Program(idl, provider);

    // Determine SSS-2 flags from preset or explicit options
    // The `extensions` shorthand object takes lowest precedence; individual flags override it
    const isSSS2 = preset === Presets.SSS_2;
    const ext = options.extensions ?? {};
    const enablePermanentDelegate =
      options.enablePermanentDelegate ?? ext.permanentDelegate ?? isSSS2;
    const enableTransferHook =
      options.enableTransferHook ?? ext.transferHook ?? isSSS2;
    const defaultAccountFrozen =
      options.defaultAccountFrozen ?? ext.defaultAccountFrozen ?? isSSS2;
    const hookProgramId = enableTransferHook
      ? TRANSFER_HOOK_PROGRAM_ID
      : null;

    // Generate mint keypair
    const mintKeypair = Keypair.generate();
    const mintAddress = mintKeypair.publicKey;
    const [config] = getConfigAddress(mintAddress);

    // Call program initialize instruction
    await program.methods
      .initialize({
        name,
        symbol,
        uri,
        decimals,
        enablePermanentDelegate,
        enableTransferHook,
        defaultAccountFrozen,
        hookProgramId: hookProgramId ?? null,
      })
      .accounts({
        authority: authority.publicKey,
        config,
        mint: mintAddress,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([mintKeypair]) // mint keypair must sign account creation
      .rpc({ commitment: "confirmed" });

    const instance = new SolanaStablecoin(connection, program, mintAddress, config);

    // For SSS-2: initialize transfer hook extra accounts
    if (enableTransferHook) {
      await instance._initializeTransferHookExtraAccounts(authority);
    }

    return instance;
  }

  /** Fetch and cache current on-chain state */
  async refresh(): Promise<StablecoinConfigState> {
    const accountData = await (this.program.account as any)["stablecoinConfig"].fetch(this.config);
    this._state = {
      authority: accountData.authority,
      pendingAuthority: accountData.pendingAuthority,
      mint: accountData.mint,
      paused: accountData.paused,
      enablePermanentDelegate: accountData.enablePermanentDelegate,
      enableTransferHook: accountData.enableTransferHook,
      defaultAccountFrozen: accountData.defaultAccountFrozen,
      hookProgramId: accountData.hookProgramId,
      bump: accountData.bump,
    };
    return this._state;
  }

  get state(): StablecoinConfigState | null {
    return this._state;
  }

  /** Get the compliance module (SSS-2 only) */
  get compliance(): ComplianceModule {
    return new ComplianceModule(this);
  }

  /** Mint tokens to a recipient */
  async mint(options: MintOptions): Promise<string> {
    const { recipient, amount, minter } = options;
    const signerKey = minter?.publicKey ?? (this.program.provider as AnchorProvider).wallet.publicKey;

    const destinationAta = getAssociatedTokenAddressSync(
      this.mintAddress,
      recipient,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Create ATA if it doesn't exist
    const ataInfo = await this.connection.getAccountInfo(destinationAta);
    if (!ataInfo) {
      const createAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          signerKey,
          destinationAta,
          recipient,
          this.mintAddress,
          TOKEN_2022_PROGRAM_ID
        )
      );
      await sendAndConfirmTransaction(
        this.connection,
        createAtaTx,
        [minter ?? (this.program.provider as AnchorProvider).wallet as any],
        { commitment: "confirmed" }
      );
    }

    const [minterRole] = getMinterAddress(this.mintAddress, signerKey);
    const minterRoleInfo = await this.connection.getAccountInfo(minterRole);

    return await this.program.methods
      .mintTo(new BN(amount.toString()))
      .accounts({
        authority: signerKey,
        config: this.config,
        mint: this.mintAddress,
        // Pass null as undefined to satisfy Anchor's account resolution
        ...(minterRoleInfo ? { minterRole } : {}),
        destination: destinationAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });
  }

  /** Burn tokens */
  async burn(from: PublicKey, amount: bigint): Promise<string> {
    const authorityKey = (this.program.provider as AnchorProvider).wallet.publicKey;
    return await this.program.methods
      .burn(new BN(amount.toString()))
      .accounts({
        authority: authorityKey,
        config: this.config,
        mint: this.mintAddress,
        from,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });
  }

  /** Freeze a token account */
  async freezeAccount(tokenAccount: PublicKey): Promise<string> {
    const authorityKey = (this.program.provider as AnchorProvider).wallet.publicKey;
    return await this.program.methods
      .freezeAccount()
      .accounts({
        authority: authorityKey,
        config: this.config,
        mint: this.mintAddress,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });
  }

  /** Thaw a frozen token account */
  async thawAccount(tokenAccount: PublicKey): Promise<string> {
    const authorityKey = (this.program.provider as AnchorProvider).wallet.publicKey;
    return await this.program.methods
      .thawAccount()
      .accounts({
        authority: authorityKey,
        config: this.config,
        mint: this.mintAddress,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed" });
  }

  /** Pause all transfers */
  async pause(): Promise<string> {
    const authorityKey = (this.program.provider as AnchorProvider).wallet.publicKey;
    return await this.program.methods
      .pause()
      .accounts({ authority: authorityKey, config: this.config })
      .rpc({ commitment: "confirmed" });
  }

  /** Unpause */
  async unpause(): Promise<string> {
    const authorityKey = (this.program.provider as AnchorProvider).wallet.publicKey;
    return await this.program.methods
      .unpause()
      .accounts({ authority: authorityKey, config: this.config })
      .rpc({ commitment: "confirmed" });
  }

  /** Add a minter with optional quota (0 = unlimited) */
  async addMinter(minter: PublicKey, quota: bigint = 0n): Promise<string> {
    const authorityKey = (this.program.provider as AnchorProvider).wallet.publicKey;
    const [minterRole] = getMinterAddress(this.mintAddress, minter);
    return await this.program.methods
      .addMinter(new BN(quota.toString()))
      .accounts({
        authority: authorityKey,
        config: this.config,
        mint: this.mintAddress,
        minterRole,
        minter,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });
  }

  /** Remove a minter */
  async removeMinter(minter: PublicKey): Promise<string> {
    const authorityKey = (this.program.provider as AnchorProvider).wallet.publicKey;
    const [minterRole] = getMinterAddress(this.mintAddress, minter);
    return await this.program.methods
      .removeMinter()
      .accounts({
        authority: authorityKey,
        config: this.config,
        mint: this.mintAddress,
        minterRole,
      })
      .rpc({ commitment: "confirmed" });
  }

  /** Add a compliance role (blacklister, pauser, seizer, burner, freezer) */
  async addRole(role: RoleType, address: PublicKey): Promise<string> {
    const authorityKey = (this.program.provider as AnchorProvider).wallet.publicKey;
    return await this.program.methods
      .addRole(role, address)
      .accounts({
        authority: authorityKey,
        config: this.config,
        mint: this.mintAddress,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });
  }

  /** Nominate a new authority (two-step transfer) */
  async nominateAuthority(newAuthority: PublicKey): Promise<string> {
    const authorityKey = (this.program.provider as AnchorProvider).wallet.publicKey;
    return await this.program.methods
      .nominateAuthority(newAuthority)
      .accounts({
        authority: authorityKey,
        config: this.config,
      })
      .rpc({ commitment: "confirmed" });
  }

  /** Accept authority (called by the new authority) */
  async acceptAuthority(): Promise<string> {
    const authorityKey = (this.program.provider as AnchorProvider).wallet.publicKey;
    return await this.program.methods
      .acceptAuthority()
      .accounts({
        newAuthority: authorityKey,
        config: this.config,
      })
      .rpc({ commitment: "confirmed" });
  }

  /** Get total supply */
  async getTotalSupply(): Promise<bigint> {
    const mintInfo = await getMint(
      this.connection,
      this.mintAddress,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    return mintInfo.supply;
  }

  /** Get token balance for a wallet */
  async getBalance(wallet: PublicKey): Promise<bigint> {
    const ata = getAssociatedTokenAddressSync(
      this.mintAddress,
      wallet,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    try {
      const account = await getAccount(
        this.connection,
        ata,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      return account.amount;
    } catch {
      return 0n;
    }
  }

  /** Get the ATA for a wallet */
  getTokenAccount(wallet: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(
      this.mintAddress,
      wallet,
      false,
      TOKEN_2022_PROGRAM_ID
    );
  }

  /** List all minter roles for this mint by fetching program accounts */
  async listMinters(): Promise<Array<{ minter: PublicKey; quota: BN; minted: BN; active: boolean }>> {
    const accounts = await (this.program.account as any)["minterRole"].all([
      {
        memcmp: {
          offset: 8 + 32, // discriminator + minter pubkey offset; mint is second field
          bytes: this.mintAddress.toBase58(),
        },
      },
    ]);
    return accounts.map((a: any) => ({
      minter: a.account.minter,
      quota: a.account.quota,
      minted: a.account.minted,
      active: a.account.active,
    }));
  }

  /** List all token holders with optional minimum balance filter */
  async listHolders(minBalance = 0n): Promise<Array<{ address: PublicKey; amount: bigint }>> {
    const tokenAccounts = await this.connection.getTokenAccountsByOwner(
      // We fetch by mint instead — use getProgramAccounts
      SystemProgram.programId, // placeholder, overridden below
      { mint: this.mintAddress, programId: TOKEN_2022_PROGRAM_ID }
    ).catch(() => ({ value: [] }));

    // Use getProgramAccounts to find all token accounts for this mint
    const raw = await this.connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
      filters: [
        { dataSize: 165 },
        {
          memcmp: {
            offset: 0,
            bytes: this.mintAddress.toBase58(),
          },
        },
      ],
    });

    const holders: Array<{ address: PublicKey; amount: bigint }> = [];
    for (const acct of raw) {
      try {
        const tokenAcct = await getAccount(
          this.connection,
          acct.pubkey,
          "confirmed",
          TOKEN_2022_PROGRAM_ID
        );
        if (tokenAcct.amount >= minBalance) {
          holders.push({ address: tokenAcct.owner, amount: tokenAcct.amount });
        }
      } catch {
        // skip invalid accounts
      }
    }
    return holders;
  }

  private async _initializeTransferHookExtraAccounts(
    authority: Keypair
  ): Promise<void> {
    let hookIdl: Idl;
    try {
      hookIdl = require("../../target/idl/transfer_hook.json");
    } catch {
      console.warn("Transfer hook IDL not found, skipping extra accounts init");
      return;
    }

    const provider = new AnchorProvider(
      this.connection,
      new Wallet(authority),
      { commitment: "confirmed" }
    );
    // Anchor 0.32: Program(idl, provider?) — program ID is read from idl.address
    const hookProgram = new Program(hookIdl, provider);
    const [extraAccountMetas] = getExtraAccountMetasAddress(this.mintAddress);

    await hookProgram.methods
      .initializeExtraAccountMetaList(SSS_TOKEN_PROGRAM_ID)
      .accounts({
        payer: authority.publicKey,
        extraAccountMetaList: extraAccountMetas,
        mint: this.mintAddress,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc({ commitment: "confirmed" });
  }
}
