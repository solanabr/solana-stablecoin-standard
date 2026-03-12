import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import type { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";

import type { CreateOptions, StablecoinConfig, StablecoinStateAccount, MinterRecord, RoleKind } from "./types";
import { Preset } from "./types";
import { buildConfig, sss1Preset, sss2Preset } from "./presets";
import { findStablecoinStatePda, findMinterRecordPda, findBlacklistEntryPda } from "./pda";
import { SSS_CORE_PROGRAM_ID, SSS_TRANSFER_HOOK_PROGRAM_ID } from "./constants";
import { ComplianceModule } from "./compliance";

export interface SolanaStablecoinLoadOptions {
  program: Program<any>;
  mint: PublicKey;
}

/**
 * Main SDK entry point.
 *
 * Usage:
 *   const stable = await SolanaStablecoin.create(provider, { preset: Preset.SSS_2, name: "MyUSD", symbol: "MUSD" });
 *   await stable.mint({ recipient, amount: 1_000_000n });
 *   await stable.compliance.blacklistAdd(address, "Sanctions match");
 */
export class SolanaStablecoin {
  readonly program: Program<any>;
  readonly mint: PublicKey;
  readonly statePda: PublicKey;
  readonly compliance: ComplianceModule;

  /** Escape hatch to avoid TS2589 with deeply-nested Anchor method generics. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get m(): any { return this.program.methods; }

  constructor(program: Program<any>, mint: PublicKey) {
    this.program = program;
    this.mint = mint;
    const [statePda] = findStablecoinStatePda(mint);
    this.statePda = statePda;
    this.compliance = new ComplianceModule(program, mint, statePda);
  }

  /**
   * Create a new stablecoin with the specified preset or custom config.
   */
  static async create(
    provider: AnchorProvider,
    program: Program<any>,
    options: CreateOptions & { mintKeypair?: Keypair }
  ): Promise<SolanaStablecoin> {
    const mintKeypair = options.mintKeypair ?? Keypair.generate();

    let config: StablecoinConfig;
    if (options.preset) {
      config = buildConfig(options.preset, options.name, options.symbol, {
        uri: options.uri ?? "",
        decimals: options.decimals,
      });
    } else {
      const ext = options.extensions ?? {};
      config = {
        name: options.name,
        symbol: options.symbol,
        uri: options.uri ?? "",
        decimals: options.decimals ?? 6,
        enablePermanentDelegate: ext.permanentDelegate ?? false,
        enableTransferHook: ext.transferHook ?? false,
        defaultAccountFrozen: ext.defaultAccountFrozen ?? false,
      };
    }

    const [statePda] = findStablecoinStatePda(mintKeypair.publicKey);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = await (program.methods as any)
      .initialize(config)
      .accounts({
        authority: provider.wallet.publicKey,
        mint: mintKeypair.publicKey,
        stablecoinState: statePda,
        transferHookProgram: config.enableTransferHook
          ? SSS_TRANSFER_HOOK_PROGRAM_ID
          : null,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: new PublicKey("SysvarRent111111111111111111111111111111111"),
      })
      .signers([mintKeypair])
      .rpc();

    return new SolanaStablecoin(program, mintKeypair.publicKey);
  }

  /**
   * Load an existing stablecoin by mint address.
   */
  static load(program: Program<any>, mint: PublicKey): SolanaStablecoin {
    return new SolanaStablecoin(program, mint);
  }

  /**
   * Fetch the on-chain stablecoin state.
   */
  async getState(): Promise<StablecoinStateAccount> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await (this.program.account as any)["stablecoinState"].fetch(this.statePda);
    return raw as StablecoinStateAccount;
  }

  /**
   * Get current total supply from the mint.
   */
  async getTotalSupply(): Promise<bigint> {
    const mintInfo = await this.program.provider.connection.getTokenSupply(this.mint);
    return BigInt(mintInfo.value.amount);
  }

  /**
   * Mint tokens to a recipient. The caller must be an active minter.
   */
  async mintTokens(
    minter: { publicKey: PublicKey },
    recipient: PublicKey,
    amount: bigint
  ): Promise<string> {
    const [minterRecord] = findMinterRecordPda(this.mint, minter.publicKey);
    const recipientAta = getAssociatedTokenAddressSync(
      this.mint,
      recipient,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    return this.m
      .mintTokens(new BN(amount.toString()))
      .accounts({
        minter: minter.publicKey,
        stablecoinState: this.statePda,
        minterRecord,
        mint: this.mint,
        recipientTokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Burn tokens from an account (burner must own the account or have burn role).
   */
  async burnTokens(
    burner: { publicKey: PublicKey },
    tokenAccount: PublicKey,
    amount: bigint
  ): Promise<string> {
    return this.m
      .burnTokens(new BN(amount.toString()))
      .accounts({
        burner: burner.publicKey,
        stablecoinState: this.statePda,
        mint: this.mint,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Freeze a token account. Requires freeze authority (stored in stablecoin state).
   */
  async freezeAccount(caller: { publicKey: PublicKey }, targetAccount: PublicKey): Promise<string> {
    return this.m
      .freezeAccount()
      .accounts({
        caller: caller.publicKey,
        stablecoinState: this.statePda,
        mint: this.mint,
        targetAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Thaw a previously frozen token account.
   */
  async thawAccount(caller: { publicKey: PublicKey }, targetAccount: PublicKey): Promise<string> {
    return this.m
      .thawAccount()
      .accounts({
        caller: caller.publicKey,
        stablecoinState: this.statePda,
        mint: this.mint,
        targetAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Pause all mint/burn operations.
   */
  async pause(caller: { publicKey: PublicKey }): Promise<string> {
    return this.m
      .pause()
      .accounts({
        caller: caller.publicKey,
        stablecoinState: this.statePda,
      })
      .rpc();
  }

  /**
   * Unpause operations.
   */
  async unpause(caller: { publicKey: PublicKey }): Promise<string> {
    return this.m
      .unpause()
      .accounts({
        caller: caller.publicKey,
        stablecoinState: this.statePda,
      })
      .rpc();
  }

  /**
   * Grant or update a minter record (authority only).
   */
  async updateMinter(
    authority: { publicKey: PublicKey },
    minter: PublicKey,
    options: { cap?: bigint; active: boolean }
  ): Promise<string> {
    const [minterRecord] = findMinterRecordPda(this.mint, minter);
    return this.m
      .updateMinter(
        options.cap !== undefined ? new BN(options.cap.toString()) : null,
        options.active
      )
      .accounts({
        authority: authority.publicKey,
        stablecoinState: this.statePda,
        minter,
        minterRecord,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Fetch a minter record.
   */
  async getMinterRecord(minter: PublicKey): Promise<MinterRecord | null> {
    const [pda] = findMinterRecordPda(this.mint, minter);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await (this.program.account as any)["minterRecord"].fetch(pda);
      return raw as MinterRecord;
    } catch {
      return null;
    }
  }

  /**
   * Update a role (burner/pauser/blacklister/seizer).
   */
  async updateRole(
    authority: { publicKey: PublicKey },
    role: RoleKind,
    holder: PublicKey,
    active: boolean
  ): Promise<string> {
    return this.m
      .updateRole({ [role.toLowerCase()]: {} }, holder, active)
      .accounts({
        authority: authority.publicKey,
        stablecoinState: this.statePda,
      })
      .rpc();
  }
}
