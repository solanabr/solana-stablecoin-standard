import {
  Connection,
  Keypair,
  PublicKey,
  Signer,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

import { Preset, StablecoinConfig, resolvePreset } from "./presets";
import {
  findStatePDA,
  findMintAuthorityPDA,
  findFreezeAuthorityPDA,
  findPermanentDelegatePDA,
  findMinterInfoPDA,
  findBlacklistEntryPDA,
  SSS_TOKEN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  createMintWithExtensions,
  getOrCreateTokenAccount,
} from "./utils";

export { Preset, Presets } from "./presets";
export type { StablecoinConfig };

// ─── Create Options ───────────────────────────────────────────────────────────

export interface CreateOptions {
  /** High-level preset — SSS_1 or SSS_2 */
  preset?: Preset;
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;
  authority: Keypair;
  /** Optional: override individual extension flags (ignored when preset is provided without custom) */
  extensions?: {
    permanentDelegate?: boolean;
    transferHook?: boolean;
    defaultAccountFrozen?: boolean;
  };
  connection: Connection;
  /** Provide an existing mint keypair, otherwise one is generated */
  mintKeypair?: Keypair;
}

// ─── Mint Options ─────────────────────────────────────────────────────────────

export interface MintOptions {
  recipient: PublicKey;
  amount: number | bigint;
  minter: Keypair;
}

// ─── Compliance Module ────────────────────────────────────────────────────────

export class ComplianceModule {
  constructor(
    private readonly sdk: SolanaStablecoin,
    private readonly program: Program
  ) {}

  private assertEnabled() {
    if (!this.sdk.config.enablePermanentDelegate) {
      throw new Error(
        "SSS-2 compliance is not enabled on this stablecoin. " +
          "Initialize with preset: Preset.SSS_2 to enable compliance features."
      );
    }
  }

  async blacklistAdd(address: PublicKey, reason: string): Promise<string> {
    this.assertEnabled();
    const [blacklistEntry] = findBlacklistEntryPDA(this.sdk.statePDA, address);
    return this.program.methods
      .addToBlacklist(reason)
      .accounts({
        authority: this.sdk.authority.publicKey,
        state: this.sdk.statePDA,
        target: address,
        blacklistEntry,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([this.sdk.authority])
      .rpc();
  }

  async blacklistRemove(address: PublicKey, reason: string): Promise<string> {
    this.assertEnabled();
    const [blacklistEntry] = findBlacklistEntryPDA(this.sdk.statePDA, address);
    return this.program.methods
      .removeFromBlacklist(reason)
      .accounts({
        authority: this.sdk.authority.publicKey,
        state: this.sdk.statePDA,
        target: address,
        blacklistEntry,
      })
      .signers([this.sdk.authority])
      .rpc();
  }

  async isBlacklisted(address: PublicKey): Promise<boolean> {
    this.assertEnabled();
    const [blacklistEntry] = findBlacklistEntryPDA(this.sdk.statePDA, address);
    const info = await this.sdk.connection.getAccountInfo(blacklistEntry);
    return info !== null && info.lamports > 0;
  }

  async seize(frozenAccount: PublicKey, treasury: PublicKey): Promise<string> {
    this.assertEnabled();
    const [blacklistEntry] = findBlacklistEntryPDA(this.sdk.statePDA, frozenAccount);
    const [permanentDelegate] = findPermanentDelegatePDA(this.sdk.statePDA);

    const fromAta = await getOrCreateTokenAccount(
      this.sdk.connection,
      this.sdk.authority,
      this.sdk.mint,
      frozenAccount
    );
    const toAta = await getOrCreateTokenAccount(
      this.sdk.connection,
      this.sdk.authority,
      this.sdk.mint,
      treasury
    );

    return this.program.methods
      .seize()
      .accounts({
        authority: this.sdk.authority.publicKey,
        state: this.sdk.statePDA,
        mint: this.sdk.mint,
        targetWallet: frozenAccount,
        blacklistEntry,
        fromTokenAccount: fromAta,
        treasuryTokenAccount: toAta,
        permanentDelegate,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([this.sdk.authority])
      .rpc();
  }
}

// ─── Main SDK class ───────────────────────────────────────────────────────────

export class SolanaStablecoin {
  readonly connection: Connection;
  readonly mint: PublicKey;
  readonly statePDA: PublicKey;
  readonly authority: Keypair;
  readonly config: StablecoinConfig;
  readonly compliance: ComplianceModule;

  private readonly program: Program;

  private constructor(
    connection: Connection,
    mint: PublicKey,
    statePDA: PublicKey,
    authority: Keypair,
    config: StablecoinConfig,
    program: Program
  ) {
    this.connection = connection;
    this.mint = mint;
    this.statePDA = statePDA;
    this.authority = authority;
    this.config = config;
    this.program = program;
    this.compliance = new ComplianceModule(this, program);
  }

  /**
   * Create and initialize a new stablecoin.
   *
   * @example
   * // SSS-1 — minimal
   * const stable = await SolanaStablecoin.create({
   *   preset: Preset.SSS_1,
   *   name: "My Stablecoin", symbol: "MYUSD",
   *   authority: adminKeypair, connection,
   * });
   *
   * // SSS-2 — compliant
   * const stable = await SolanaStablecoin.create({
   *   preset: Preset.SSS_2,
   *   name: "My Stablecoin", symbol: "MYUSD",
   *   authority: adminKeypair, connection,
   * });
   *
   * // Custom
   * const stable = await SolanaStablecoin.create({
   *   name: "Custom", symbol: "CUSD",
   *   extensions: { permanentDelegate: true, transferHook: false },
   *   authority: adminKeypair, connection,
   * });
   */
  static async create(options: CreateOptions): Promise<SolanaStablecoin> {
    const {
      preset,
      name,
      symbol,
      uri = "",
      decimals = 6,
      authority,
      extensions = {},
      connection,
    } = options;

    // Resolve config from preset or custom extensions
    const presetConfig = preset
      ? resolvePreset(preset, {
          enablePermanentDelegate: extensions.permanentDelegate,
          enableTransferHook: extensions.transferHook,
          defaultAccountFrozen: extensions.defaultAccountFrozen,
        })
      : {
          enablePermanentDelegate: extensions.permanentDelegate ?? false,
          enableTransferHook: extensions.transferHook ?? false,
          defaultAccountFrozen: extensions.defaultAccountFrozen ?? false,
        };

    const config: StablecoinConfig = {
      name,
      symbol,
      uri,
      decimals,
      enablePermanentDelegate: presetConfig.enablePermanentDelegate ?? false,
      enableTransferHook: presetConfig.enableTransferHook ?? false,
      defaultAccountFrozen: presetConfig.defaultAccountFrozen ?? false,
      transferHookProgramId: presetConfig.enableTransferHook ? TRANSFER_HOOK_PROGRAM_ID : undefined,
    } as StablecoinConfig;

    const mintKeypair = options.mintKeypair ?? Keypair.generate();
    const [statePDA] = findStatePDA(mintKeypair.publicKey);
    const [mintAuthority] = findMintAuthorityPDA(statePDA);
    const [freezeAuthority] = findFreezeAuthorityPDA(statePDA);
    const [permanentDelegate] = findPermanentDelegatePDA(statePDA);

    // Step 1: Create the Token-2022 mint with correct extensions
    await createMintWithExtensions({
      connection,
      payer: authority,
      mintKeypair,
      decimals,
      mintAuthority,
      freezeAuthority,
      enablePermanentDelegate: config.enablePermanentDelegate,
      permanentDelegateKey: config.enablePermanentDelegate ? permanentDelegate : undefined,
      enableTransferHook: config.enableTransferHook,
      transferHookProgramId: config.transferHookProgramId,
      defaultAccountFrozen: config.defaultAccountFrozen,
      metadataPointerAuthority: authority.publicKey,
    });

    // Step 2: Load the Anchor program
    const provider = new AnchorProvider(connection, new anchor.Wallet(authority), {});
    // IDL would be imported from build artifacts in practice
    const idl = await Program.fetchIdl(SSS_TOKEN_PROGRAM_ID, provider);
    if (!idl) throw new Error("SSS-token IDL not found on-chain");
    const program = new Program(idl, provider);

    // Step 3: Initialize state PDA
    await program.methods
      .initialize({
        name,
        symbol,
        uri,
        decimals,
        enablePermanentDelegate: config.enablePermanentDelegate,
        enableTransferHook: config.enableTransferHook,
        defaultAccountFrozen: config.defaultAccountFrozen,
        transferHookProgramId: config.transferHookProgramId ?? null,
      })
      .accounts({
        masterAuthority: authority.publicKey,
        state: statePDA,
        mint: mintKeypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([authority, mintKeypair])
      .rpc();

    return new SolanaStablecoin(
      connection,
      mintKeypair.publicKey,
      statePDA,
      authority,
      config,
      program
    );
  }

  /**
   * Load an existing stablecoin by mint address.
   */
  static async load(
    connection: Connection,
    mint: PublicKey,
    authority: Keypair
  ): Promise<SolanaStablecoin> {
    const [statePDA] = findStatePDA(mint);
    const provider = new AnchorProvider(connection, new anchor.Wallet(authority), {});
    const idl = await Program.fetchIdl(SSS_TOKEN_PROGRAM_ID, provider);
    if (!idl) throw new Error("SSS-token IDL not found on-chain");
    const program = new Program(idl, provider);

    const state = await (program.account as any).stablecoinState.fetch(statePDA);

    const config: StablecoinConfig = {
      name: state.name,
      symbol: state.symbol,
      uri: state.uri,
      decimals: state.decimals,
      enablePermanentDelegate: state.permanentDelegateEnabled,
      enableTransferHook: state.transferHookEnabled,
      defaultAccountFrozen: state.defaultAccountFrozen,
      transferHookProgramId: state.transferHookProgramId ?? undefined,
    };

    return new SolanaStablecoin(connection, mint, statePDA, authority, config, program);
  }

  // ─── Core Operations ────────────────────────────────────────────────────────

  /**
   * Mint tokens to a recipient.
   * Requires the minter to be registered via `addMinter()` and have sufficient quota.
   */
  async mintTokens(options: MintOptions): Promise<string> {
    const { recipient, amount, minter } = options;
    const [minterInfoPDA] = findMinterInfoPDA(this.statePDA, minter.publicKey);
    const recipientAta = await getOrCreateTokenAccount(
      this.connection,
      this.authority,
      this.mint,
      recipient
    );
    const [mintAuthority] = findMintAuthorityPDA(this.statePDA);

    return this.program.methods
      .mint(new BN(amount.toString()))
      .accounts({
        minter: minter.publicKey,
        state: this.statePDA,
        mint: this.mint,
        minterInfo: minterInfoPDA,
        recipientTokenAccount: recipientAta,
        mintAuthority,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
  }

  async burn(from: PublicKey, amount: number | bigint): Promise<string> {
    const fromAta = await getOrCreateTokenAccount(
      this.connection,
      this.authority,
      this.mint,
      from
    );

    return this.program.methods
      .burn(new BN(amount.toString()))
      .accounts({
        authority: this.authority.publicKey,
        state: this.statePDA,
        mint: this.mint,
        fromTokenAccount: fromAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([this.authority])
      .rpc();
  }

  async freeze(account: PublicKey): Promise<string> {
    const [freezeAuthority] = findFreezeAuthorityPDA(this.statePDA);
    const ata = await getOrCreateTokenAccount(
      this.connection,
      this.authority,
      this.mint,
      account
    );

    return this.program.methods
      .freezeAccount()
      .accounts({
        authority: this.authority.publicKey,
        state: this.statePDA,
        mint: this.mint,
        tokenAccount: ata,
        freezeAuthority,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([this.authority])
      .rpc();
  }

  async thaw(account: PublicKey): Promise<string> {
    const [freezeAuthority] = findFreezeAuthorityPDA(this.statePDA);
    const ata = await getOrCreateTokenAccount(
      this.connection,
      this.authority,
      this.mint,
      account
    );

    return this.program.methods
      .thawAccount()
      .accounts({
        authority: this.authority.publicKey,
        state: this.statePDA,
        mint: this.mint,
        tokenAccount: ata,
        freezeAuthority,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([this.authority])
      .rpc();
  }

  async pause(): Promise<string> {
    return this.program.methods
      .pause()
      .accounts({ authority: this.authority.publicKey, state: this.statePDA })
      .signers([this.authority])
      .rpc();
  }

  async unpause(): Promise<string> {
    return this.program.methods
      .unpause()
      .accounts({ authority: this.authority.publicKey, state: this.statePDA })
      .signers([this.authority])
      .rpc();
  }

  async addMinter(minter: PublicKey, quota: number | bigint = 0): Promise<string> {
    const [minterInfo] = findMinterInfoPDA(this.statePDA, minter);
    
    return this.program.methods
      .addMinter(new BN(quota.toString()))
      .accounts({
        authority: this.authority.publicKey,
        state: this.statePDA,
        minter,
        minterInfo,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([this.authority])
      .rpc();
  }

  async removeMinter(minter: PublicKey): Promise<string> {
    const [minterInfo] = findMinterInfoPDA(this.statePDA, minter);
    
    return this.program.methods
      .removeMinter()
      .accounts({
        authority: this.authority.publicKey,
        state: this.statePDA,
        minter,
        minterInfo,
      })
      .signers([this.authority])
      .rpc();
  }

  async updateRoles(roles: {
    pauser?: PublicKey | null;
    burner?: PublicKey | null;
    blacklister?: PublicKey | null;
    seizer?: PublicKey | null;
  }): Promise<string> {
    return this.program.methods
      .updateRoles({
        pauser: roles.pauser === null ? PublicKey.default : roles.pauser ?? null,
        burner: roles.burner === null ? PublicKey.default : roles.burner ?? null,
        blacklister: roles.blacklister === null ? PublicKey.default : roles.blacklister ?? null,
        seizer: roles.seizer === null ? PublicKey.default : roles.seizer ?? null,
      })
      .accounts({
        authority: this.authority.publicKey,
        state: this.statePDA,
      })
      .signers([this.authority])
      .rpc();
  }

  async proposeAuthority(newAuthority: PublicKey): Promise<string> {
    return this.program.methods
      .proposeAuthority()
      .accounts({
        currentAuthority: this.authority.publicKey,
        proposedAuthority: newAuthority,
        state: this.statePDA,
      })
      .signers([this.authority])
      .rpc();
  }

  async acceptAuthority(newAuthorityKeypair: Keypair): Promise<string> {
    return this.program.methods
      .acceptAuthority()
      .accounts({
        newAuthority: newAuthorityKeypair.publicKey,
        state: this.statePDA,
      })
      .signers([newAuthorityKeypair])
      .rpc();
  }

  // ─── Read-only helpers ───────────────────────────────────────────────────────

  async getState(): Promise<any> {
    return (this.program.account as any).stablecoinState.fetch(this.statePDA);
  }

  async getTotalSupply(): Promise<bigint> {
    const state = await this.getState();
    return BigInt(state.totalMinted.toString()) - BigInt(state.totalBurned.toString());
  }

  async getMintInfo(): Promise<any> {
    const { getMint } = await import("@solana/spl-token");
    const { TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
    return getMint(this.connection, this.mint, undefined, TOKEN_2022_PROGRAM_ID);
  }

  /**
   * List all minter accounts for this stablecoin.
   * Returns an array of { address, quota, mintedThisEpoch, active }.
   */
  async listMinters(): Promise<Array<{
    address: PublicKey;
    quota: bigint;
    mintedThisEpoch: bigint;
    active: boolean;
  }>> {
    const accounts = await (this.program.account as any).minterInfo.all([
      { memcmp: { offset: 8, bytes: this.statePDA.toBase58() } },
    ]);
    return accounts.map((a: any) => ({
      address: a.account.minter,
      quota: BigInt(a.account.quota.toString()),
      mintedThisEpoch: BigInt(a.account.mintedThisEpoch.toString()),
      active: a.account.active,
    }));
  }

  /**
   * Get all token holders for this stablecoin mint.
   * Returns an array of { owner, balance }.
   * Optionally filter by minimum balance.
   */
  async getHolders(minBalance: bigint = 0n): Promise<Array<{
    owner: PublicKey;
    balance: bigint;
  }>> {
    const { TOKEN_2022_PROGRAM_ID } = await import("@solana/spl-token");
    const accounts = await this.connection.getParsedProgramAccounts(
      TOKEN_2022_PROGRAM_ID,
      {
        filters: [
          { dataSize: 165 }, // Token account size
          { memcmp: { offset: 0, bytes: this.mint.toBase58() } },
        ],
      }
    );

    const holders: Array<{ owner: PublicKey; balance: bigint }> = [];
    for (const account of accounts) {
      const parsed = (account.account.data as any)?.parsed?.info;
      if (!parsed) continue;
      const balance = BigInt(parsed.tokenAmount?.amount ?? "0");
      if (balance >= minBalance) {
        holders.push({
          owner: new PublicKey(parsed.owner),
          balance,
        });
      }
    }

    return holders.sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
  }
}