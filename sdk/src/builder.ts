import { BN, Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  addExtraAccountMetasForExecute,
} from "@solana/spl-token";

import { SSS_CORE_PROGRAM_ID, SSS_HOOK_PROGRAM_ID } from "./constants";
import {
  findConfigPda,
  findMintAuthorityPda,
  findMinterStatePda,
  findBlacklistEntryPda,
  findAllowlistEntryPda,
} from "./pda";
import { RoleType, InitializeParams } from "./types";

import { SssCore } from "./idl/sss_core";
import sssCoreIdl from "./idl/sss_core";

import { SssHook } from "./idl/sss_hook";
import sssHookIdl from "./idl/sss_hook";

/**
 * Converts a RoleType enum value to the Anchor-compatible object format.
 */
function roleTypeToAnchor(role: RoleType): Record<string, Record<string, never>> {
  switch (role) {
    case RoleType.MasterMinter:
      return { masterMinter: {} };
    case RoleType.Pauser:
      return { pauser: {} };
    case RoleType.Blacklister:
      return { blacklister: {} };
    default: {
      const _exhaustiveCheck: never = role;
      throw new Error(`Unknown role type: ${String(_exhaustiveCheck)}`);
    }
  }
}

/**
 * TransactionBuilder — compose multiple SSS instructions into a single atomic
 * transaction, reducing round-trips and enabling batched operations.
 *
 * Usage:
 * ```ts
 * const builder = new TransactionBuilder(connection, wallet);
 *
 * const txSig = await builder
 *   .configureMinter(mint, minterWallet, new BN(1_000_000))
 *   .mint(mint, destinationAta, new BN(500_000))
 *   .execute();
 * ```
 *
 * Each chained method appends an instruction. Call `.build()` to get the
 * unsigned Transaction, or `.execute()` to sign, send, and confirm.
 */
export class TransactionBuilder {
  private readonly connection: Connection;
  private readonly wallet: Wallet;
  private readonly programId: PublicKey;
  private readonly hookProgramId: PublicKey;
  private readonly provider: AnchorProvider;
  private _program?: Program<SssCore>;
  private _hookProgram?: Program<SssHook>;
  private instructions: TransactionInstruction[] = [];
  private extraSigners: Keypair[] = [];

  constructor(
    connection: Connection,
    wallet: Wallet,
    programId: PublicKey = SSS_CORE_PROGRAM_ID,
    hookProgramId: PublicKey = SSS_HOOK_PROGRAM_ID,
  ) {
    this.connection = connection;
    this.wallet = wallet;
    this.programId = programId;
    this.hookProgramId = hookProgramId;
    this.provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
  }

  private getProgram(): Program<SssCore> {
    if (!this._program) {
      this._program = new Program<SssCore>(sssCoreIdl as SssCore, this.provider);
    }
    return this._program;
  }

  private getHookProgram(): Program<SssHook> {
    if (!this._hookProgram) {
      this._hookProgram = new Program<SssHook>(sssHookIdl as SssHook, this.provider);
    }
    return this._hookProgram;
  }

  /** Reset the builder, clearing all accumulated instructions. */
  clear(): this {
    this.instructions = [];
    this.extraSigners = [];
    this._pendingIxs = [];
    return this;
  }

  /** Get the number of instructions currently queued. */
  get length(): number {
    return this.instructions.length + this._pendingIxs.length;
  }

  // ---------------------------------------------------------------------------
  // Instruction methods — each appends an IX and returns `this` for chaining
  // ---------------------------------------------------------------------------

  /** Append an initialize instruction. Returns the mint keypair via callback. */
  initializeWithMint(
    params: InitializeParams,
    onMintKeypair: (mint: Keypair) => void,
    hookProgram?: PublicKey,
  ): this {
    const program = this.getProgram();
    const mintKeypair = Keypair.generate();
    onMintKeypair(mintKeypair);

    const mint = mintKeypair.publicKey;
    const [config] = findConfigPda(mint, this.programId);
    const [mintAuthority] = findMintAuthorityPda(mint, this.programId);

    const remainingAccounts = hookProgram
      ? [{ pubkey: hookProgram, isSigner: false, isWritable: false }]
      : [];

    // We need to build the instruction synchronously for chaining,
    // but Anchor's .instruction() is async. Store a promise to resolve later.
    this._addAsyncIx(
      program.methods
        .initialize({
          preset: params.preset,
          name: params.name,
          symbol: params.symbol,
          uri: params.uri,
          decimals: params.decimals,
        })
        .accountsPartial({
          authority: this.wallet.publicKey,
          mint,
          config,
          mintAuthority,
          hookProgram: hookProgram ?? null,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(remainingAccounts)
        .instruction()
    );

    this.extraSigners.push(mintKeypair);
    return this;
  }

  /** Append a configureMinter instruction. */
  configureMinter(mint: PublicKey, minterWallet: PublicKey, quota: BN): this {
    const program = this.getProgram();
    const [config] = findConfigPda(mint, this.programId);
    const [minterState] = findMinterStatePda(config, minterWallet, this.programId);

    this._addAsyncIx(
      program.methods
        .configureMinter(minterWallet, quota)
        .accountsPartial({
          masterMinter: this.wallet.publicKey,
          config,
          minterState,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );
    return this;
  }

  /** Append a removeMinter instruction. */
  removeMinter(mint: PublicKey, minterWallet: PublicKey): this {
    const program = this.getProgram();
    const [config] = findConfigPda(mint, this.programId);
    const [minterState] = findMinterStatePda(config, minterWallet, this.programId);

    this._addAsyncIx(
      program.methods
        .removeMinter()
        .accountsPartial({
          masterMinter: this.wallet.publicKey,
          config,
          minterState,
        })
        .instruction()
    );
    return this;
  }

  /** Append a mint instruction. */
  mint(mint: PublicKey, destination: PublicKey, amount: BN): this {
    const program = this.getProgram();
    const [config] = findConfigPda(mint, this.programId);
    const [minterState] = findMinterStatePda(
      config,
      this.wallet.publicKey,
      this.programId,
    );
    const [mintAuthority] = findMintAuthorityPda(mint, this.programId);

    this._addAsyncIx(
      program.methods
        .mintTokens(amount)
        .accountsPartial({
          minter: this.wallet.publicKey,
          config,
          minterState,
          mint,
          destination,
          mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .instruction()
    );
    return this;
  }

  /** Append a burn instruction. */
  burn(mint: PublicKey, amount: BN): this {
    const program = this.getProgram();
    const [config] = findConfigPda(mint, this.programId);
    const tokenAccount = getAssociatedTokenAddressSync(
      mint,
      this.wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    this._addAsyncIx(
      program.methods
        .burnTokens(amount)
        .accountsPartial({
          burner: this.wallet.publicKey,
          config,
          mint,
          tokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .instruction()
    );
    return this;
  }

  /** Append a pause instruction. */
  pause(mint: PublicKey): this {
    const program = this.getProgram();
    const [config] = findConfigPda(mint, this.programId);

    this._addAsyncIx(
      program.methods
        .pause()
        .accountsPartial({ pauser: this.wallet.publicKey, config })
        .instruction()
    );
    return this;
  }

  /** Append an unpause instruction. */
  unpause(mint: PublicKey): this {
    const program = this.getProgram();
    const [config] = findConfigPda(mint, this.programId);

    this._addAsyncIx(
      program.methods
        .unpause()
        .accountsPartial({ pauser: this.wallet.publicKey, config })
        .instruction()
    );
    return this;
  }

  /** Append a freezeAccount instruction. */
  freezeAccount(mint: PublicKey, targetTokenAccount: PublicKey): this {
    const program = this.getProgram();
    const [config] = findConfigPda(mint, this.programId);
    const [mintAuthority] = findMintAuthorityPda(mint, this.programId);

    this._addAsyncIx(
      program.methods
        .freezeAccount()
        .accountsPartial({
          signer: this.wallet.publicKey,
          config,
          mint,
          targetTokenAccount,
          mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .instruction()
    );
    return this;
  }

  /** Append a thawAccount instruction. */
  thawAccount(mint: PublicKey, targetTokenAccount: PublicKey): this {
    const program = this.getProgram();
    const [config] = findConfigPda(mint, this.programId);
    const [mintAuthority] = findMintAuthorityPda(mint, this.programId);

    this._addAsyncIx(
      program.methods
        .thawAccount()
        .accountsPartial({
          signer: this.wallet.publicKey,
          config,
          mint,
          targetTokenAccount,
          mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .instruction()
    );
    return this;
  }

  /** Append an updateRole instruction. */
  updateRole(mint: PublicKey, role: RoleType, newAddress: PublicKey): this {
    const program = this.getProgram();
    const [config] = findConfigPda(mint, this.programId);

    this._addAsyncIx(
      program.methods
        .updateRole(roleTypeToAnchor(role) as never, newAddress)
        .accountsPartial({ authority: this.wallet.publicKey, config })
        .instruction()
    );
    return this;
  }

  /** Append a transferAuthority instruction. */
  transferAuthority(mint: PublicKey, newAuthority: PublicKey): this {
    const program = this.getProgram();
    const [config] = findConfigPda(mint, this.programId);

    this._addAsyncIx(
      program.methods
        .transferAuthority(newAuthority)
        .accountsPartial({ authority: this.wallet.publicKey, config })
        .instruction()
    );
    return this;
  }

  /** Append an acceptAuthority instruction. */
  acceptAuthority(mint: PublicKey): this {
    const program = this.getProgram();
    const [config] = findConfigPda(mint, this.programId);

    this._addAsyncIx(
      program.methods
        .acceptAuthority()
        .accountsPartial({ newAuthority: this.wallet.publicKey, config })
        .instruction()
    );
    return this;
  }

  // ---------------------------------------------------------------------------
  // SSS-2 Compliance methods
  // ---------------------------------------------------------------------------

  /**
   * Append an addToBlacklist instruction (SSS-2 hook program).
   *
   * Adds a wallet to the blacklist for a given stablecoin mint. Only callable
   * by the blacklister role. Creates the BlacklistEntry PDA if it does not yet
   * exist.
   *
   * @param mint    The stablecoin mint address.
   * @param wallet  The wallet address to blacklist.
   * @param reason  Human-readable reason (max 200 characters).
   */
  addToBlacklist(mint: PublicKey, wallet: PublicKey, reason: string): this {
    const hookProgram = this.getHookProgram();
    const [stablecoinConfig] = findConfigPda(mint, this.programId);
    const [blacklistEntry] = findBlacklistEntryPda(
      mint,
      wallet,
      this.hookProgramId,
    );

    this._addAsyncIx(
      hookProgram.methods
        .addToBlacklist(wallet, reason)
        .accountsPartial({
          blacklister: this.wallet.publicKey,
          mint,
          stablecoinConfig,
          blacklistEntry,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );
    return this;
  }

  /**
   * Append a removeFromBlacklist instruction (SSS-2 hook program).
   *
   * Removes a wallet from the blacklist for a given stablecoin mint. Only
   * callable by the blacklister role.
   *
   * @param mint    The stablecoin mint address.
   * @param wallet  The wallet address to remove from the blacklist.
   */
  removeFromBlacklist(mint: PublicKey, wallet: PublicKey): this {
    const hookProgram = this.getHookProgram();
    const [stablecoinConfig] = findConfigPda(mint, this.programId);
    const [blacklistEntry] = findBlacklistEntryPda(
      mint,
      wallet,
      this.hookProgramId,
    );

    this._addAsyncIx(
      hookProgram.methods
        .removeFromBlacklist()
        .accountsPartial({
          blacklister: this.wallet.publicKey,
          mint,
          stablecoinConfig,
          blacklistEntry,
        })
        .instruction()
    );
    return this;
  }

  /**
   * Append a seize instruction (SSS-2 core program).
   *
   * Seizes tokens from a source account using the permanent delegate. The
   * transfer hook extra accounts are resolved automatically by reading the
   * on-chain ExtraAccountMetaList, or can be supplied directly via the
   * optional `remainingAccounts` parameter.
   *
   * @param mint                     The stablecoin mint address.
   * @param sourceTokenAccount       The account to seize tokens from.
   * @param destinationTokenAccount  The account that receives the seized tokens.
   * @param amount                   Amount to seize (in base units).
   * @param remainingAccounts        Optional pre-resolved transfer hook extra
   *                                 accounts. If omitted, they are resolved
   *                                 automatically from the on-chain meta list.
   */
  seize(
    mint: PublicKey,
    sourceTokenAccount: PublicKey,
    destinationTokenAccount: PublicKey,
    amount: BN,
    remainingAccounts?: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[],
  ): this {
    const program = this.getProgram();
    const [config] = findConfigPda(mint, this.programId);
    const [mintAuthority] = findMintAuthorityPda(mint, this.programId);

    // Build the async instruction, resolving hook extra accounts if needed
    const ixPromise = (async (): Promise<TransactionInstruction> => {
      let hookRemainingAccounts = remainingAccounts;

      if (!hookRemainingAccounts) {
        // Build a placeholder transfer instruction to resolve hook extra accounts.
        // addExtraAccountMetasForExecute reads the on-chain ExtraAccountMetaList
        // and appends the resolved accounts to the instruction's keys.
        const transferIx = new TransactionInstruction({
          programId: TOKEN_2022_PROGRAM_ID,
          keys: [
            { pubkey: sourceTokenAccount, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: destinationTokenAccount, isSigner: false, isWritable: true },
            { pubkey: mintAuthority, isSigner: false, isWritable: false },
          ],
          data: Buffer.alloc(0),
        });

        await addExtraAccountMetasForExecute(
          this.connection,
          transferIx,
          this.hookProgramId,
          sourceTokenAccount,
          mint,
          destinationTokenAccount,
          mintAuthority,
          BigInt(amount.toString()),
        );

        // Extract hook remaining accounts (everything after the 4 base accounts)
        hookRemainingAccounts = transferIx.keys.slice(4).map(k => ({
          pubkey: k.pubkey,
          isSigner: false,
          isWritable: k.isWritable,
        }));
      }

      return program.methods
        .seize(amount)
        .accountsPartial({
          authority: this.wallet.publicKey,
          config,
          mint,
          sourceTokenAccount,
          destinationTokenAccount,
          mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts(hookRemainingAccounts)
        .instruction();
    })();

    this._addAsyncIx(ixPromise);
    return this;
  }

  // ---------------------------------------------------------------------------
  // SSS-3 Confidential transfer methods
  // ---------------------------------------------------------------------------

  /**
   * Append an approveConfidential instruction (SSS-3 core program).
   *
   * Approves a wallet's token account for confidential transfers by creating
   * an AllowlistEntry PDA and CPI-ing to Token-2022's `approve_account`.
   * Only callable by the authority role on presets >= SSS-3.
   *
   * @param mint          The stablecoin mint address.
   * @param wallet        The wallet to approve for confidential transfers.
   * @param tokenAccount  The wallet's Token-2022 token account (must already
   *                      be configured for confidential transfers).
   */
  approveConfidential(
    mint: PublicKey,
    wallet: PublicKey,
    tokenAccount: PublicKey,
  ): this {
    const program = this.getProgram();
    const [config] = findConfigPda(mint, this.programId);
    const [mintAuthority] = findMintAuthorityPda(mint, this.programId);
    const [allowlistEntry] = findAllowlistEntryPda(mint, wallet, this.programId);

    this._addAsyncIx(
      program.methods
        .approveConfidential(wallet)
        .accountsPartial({
          authority: this.wallet.publicKey,
          config,
          mint,
          tokenAccount,
          allowlistEntry,
          mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction()
    );
    return this;
  }

  /**
   * Append a revokeConfidential instruction (SSS-3 core program).
   *
   * Revokes a wallet's confidential transfer approval by marking the
   * AllowlistEntry as revoked. Only callable by the authority role.
   *
   * @param mint    The stablecoin mint address.
   * @param wallet  The wallet whose approval to revoke.
   */
  revokeConfidential(mint: PublicKey, wallet: PublicKey): this {
    const program = this.getProgram();
    const [config] = findConfigPda(mint, this.programId);
    const [allowlistEntry] = findAllowlistEntryPda(mint, wallet, this.programId);

    this._addAsyncIx(
      program.methods
        .revokeConfidential()
        .accountsPartial({
          authority: this.wallet.publicKey,
          config,
          mint,
          allowlistEntry,
        })
        .instruction()
    );
    return this;
  }

  // ---------------------------------------------------------------------------
  // Build / Execute
  // ---------------------------------------------------------------------------

  /**
   * Resolve all pending instructions and return an unsigned Transaction.
   * The caller is responsible for signing and sending.
   */
  async build(): Promise<Transaction> {
    if (this.instructions.length === 0 && this._pendingIxs.length === 0) {
      throw new Error("TransactionBuilder: no instructions added");
    }

    // Resolve any async instruction promises
    const resolved = await Promise.all(this._pendingIxs);
    const allIxs = [...this.instructions, ...resolved];

    const tx = new Transaction();
    const { blockhash } = await this.connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.wallet.publicKey;

    for (const ix of allIxs) {
      tx.add(ix);
    }

    return tx;
  }

  /**
   * Build, sign, send, and confirm the transaction.
   * Returns the transaction signature on success.
   */
  async execute(): Promise<TransactionSignature> {
    const tx = await this.build();

    // Sign with extra signers (e.g., mint keypair from initialize)
    if (this.extraSigners.length > 0) {
      tx.partialSign(...this.extraSigners);
    }

    // Sign with wallet
    const signed = await this.wallet.signTransaction(tx);

    const sig = await this.connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    await this.connection.confirmTransaction(sig, "confirmed");

    // Reset after successful execution
    this.clear();
    this._pendingIxs = [];

    return sig;
  }

  // ---------------------------------------------------------------------------
  // Internal: async instruction accumulation
  // ---------------------------------------------------------------------------

  private _pendingIxs: Promise<TransactionInstruction>[] = [];

  private _addAsyncIx(ixPromise: Promise<TransactionInstruction>): void {
    this._pendingIxs.push(ixPromise);
  }
}
