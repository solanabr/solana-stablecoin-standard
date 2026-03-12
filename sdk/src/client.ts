import * as anchor from "@coral-xyz/anchor";
import { BN, Program, AnchorProvider, Idl, Wallet, EventParser } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  ConfirmedSignatureInfo,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

import { SSS_CORE_PROGRAM_ID } from "./constants";
import {
  findConfigPda,
  findMintAuthorityPda,
  findMinterStatePda,
} from "./pda";
import {
  StablecoinConfig,
  MinterState,
  InitializeParams,
  InitializeResult,
  RoleType,
} from "./types";
import { validateInitializeParams } from "./validation";

import { SssCore } from "./idl/sss_core";
import sssCoreIdl from "./idl/sss_core";

/**
 * Converts a RoleType enum value to the Anchor-compatible object format
 * that matches the on-chain enum variant representation.
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
 * StablecoinClient — the primary SDK client for SSS-1 and SSS-2 stablecoins.
 *
 * Provides typed methods for every instruction in the sss-core program:
 * initialize, configureMinter, removeMinter, mintTokens, burnTokens,
 * freezeAccount, thawAccount, pause, unpause, updateRole, transferAuthority,
 * acceptAuthority, seize, and account-fetch helpers.
 */
export class StablecoinClient {
  protected readonly connection: Connection;
  protected readonly wallet: Wallet;
  protected readonly programId: PublicKey;
  protected readonly provider: AnchorProvider;
  private _program?: Program<SssCore>;

  constructor(
    connection: Connection,
    wallet: Wallet,
    programId: PublicKey = SSS_CORE_PROGRAM_ID
  ) {
    this.connection = connection;
    this.wallet = wallet;
    this.programId = programId;
    this.provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
  }

  /**
   * Returns a cached Anchor Program instance for the sss-core program.
   */
  protected getProgram(): Program<SssCore> {
    if (!this._program) {
      this._program = new Program<SssCore>(sssCoreIdl as SssCore, this.provider);
    }
    return this._program;
  }

  /**
   * Initialize a new stablecoin mint and config.
   *
   * Creates a fresh mint keypair, derives all required PDAs, and sends the
   * initialize instruction. For SSS-2 (preset === 2) you must also provide
   * `hookProgram` so the on-chain program can validate the hook is set.
   *
   * @param params     Initialization parameters (preset, name, symbol, uri, decimals).
   * @param hookProgram  Optional hook program ID — required for SSS-2.
   * @returns          The new mint address, config PDA, and transaction signature.
   */
  async initialize(
    params: InitializeParams,
    hookProgram?: PublicKey
  ): Promise<InitializeResult> {
    // Validate params at the SDK boundary
    validateInitializeParams(params as unknown as Record<string, unknown>);

    try {
      const program = this.getProgram();
      const mintKeypair = Keypair.generate();
      const mint = mintKeypair.publicKey;

      const [config] = findConfigPda(mint, this.programId);
      const [mintAuthority] = findMintAuthorityPda(mint, this.programId);

      const remainingAccounts = hookProgram
        ? [{ pubkey: hookProgram, isSigner: false, isWritable: false }]
        : [];

      const txSig = await program.methods
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
        .signers([mintKeypair])
        .remainingAccounts(remainingAccounts)
        .rpc();

      return { mint, config, txSig };
    } catch (err) {
      throw new Error(
        `Failed to initialize stablecoin: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Configure (create or update) a minter's quota.
   *
   * Only callable by the master minter role.
   *
   * @param mint          The stablecoin mint address.
   * @param minterWallet  The minter's wallet public key.
   * @param quota         Maximum tokens (in base units) the minter may mint.
   * @returns             Transaction signature.
   */
  async configureMinter(
    mint: PublicKey,
    minterWallet: PublicKey,
    quota: BN
  ): Promise<string> {
    try {
      const program = this.getProgram();
      const [config] = findConfigPda(mint, this.programId);
      const [minterState] = findMinterStatePda(config, minterWallet, this.programId);

      return await program.methods
        .configureMinter(minterWallet, quota)
        .accountsPartial({
          masterMinter: this.wallet.publicKey,
          config,
          minterState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to configure minter: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Disable an existing minter. The account is preserved for the audit trail.
   *
   * Only callable by the master minter role.
   *
   * @param mint          The stablecoin mint address.
   * @param minterWallet  The minter's wallet public key.
   * @returns             Transaction signature.
   */
  async removeMinter(mint: PublicKey, minterWallet: PublicKey): Promise<string> {
    try {
      const program = this.getProgram();
      const [config] = findConfigPda(mint, this.programId);
      const [minterState] = findMinterStatePda(config, minterWallet, this.programId);

      return await program.methods
        .removeMinter()
        .accountsPartial({
          masterMinter: this.wallet.publicKey,
          config,
          minterState,
        })
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to remove minter: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Mint tokens to a destination token account.
   *
   * The signer must be a configured, enabled minter with sufficient quota.
   *
   * @param mint         The stablecoin mint address.
   * @param destination  Destination Token-2022 token account.
   * @param amount       Amount to mint (in base units).
   * @returns            Transaction signature.
   */
  async mint(
    mint: PublicKey,
    destination: PublicKey,
    amount: BN
  ): Promise<string> {
    try {
      const program = this.getProgram();
      const [config] = findConfigPda(mint, this.programId);
      const [minterState] = findMinterStatePda(
        config,
        this.wallet.publicKey,
        this.programId
      );
      const [mintAuthority] = findMintAuthorityPda(mint, this.programId);

      return await program.methods
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
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to mint tokens: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Burn tokens from the signer's own token account (ATA).
   *
   * @param mint    The stablecoin mint address.
   * @param amount  Amount to burn (in base units).
   * @returns       Transaction signature.
   */
  async burn(mint: PublicKey, amount: BN): Promise<string> {
    try {
      const program = this.getProgram();
      const [config] = findConfigPda(mint, this.programId);
      const tokenAccount = getAssociatedTokenAddressSync(
        mint,
        this.wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      return await program.methods
        .burnTokens(amount)
        .accountsPartial({
          burner: this.wallet.publicKey,
          config,
          mint,
          tokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to burn tokens: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Freeze a token account.
   *
   * Callable by the authority or the blacklister; works even when paused.
   *
   * @param mint               The stablecoin mint address.
   * @param targetTokenAccount The token account to freeze.
   * @returns                  Transaction signature.
   */
  async freezeAccount(
    mint: PublicKey,
    targetTokenAccount: PublicKey
  ): Promise<string> {
    try {
      const program = this.getProgram();
      const [config] = findConfigPda(mint, this.programId);
      const [mintAuthority] = findMintAuthorityPda(mint, this.programId);

      return await program.methods
        .freezeAccount()
        .accountsPartial({
          signer: this.wallet.publicKey,
          config,
          mint,
          targetTokenAccount,
          mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to freeze account: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Thaw a frozen token account.
   *
   * Callable by the authority or the blacklister; works even when paused.
   *
   * @param mint               The stablecoin mint address.
   * @param targetTokenAccount The token account to thaw.
   * @returns                  Transaction signature.
   */
  async thawAccount(
    mint: PublicKey,
    targetTokenAccount: PublicKey
  ): Promise<string> {
    try {
      const program = this.getProgram();
      const [config] = findConfigPda(mint, this.programId);
      const [mintAuthority] = findMintAuthorityPda(mint, this.programId);

      return await program.methods
        .thawAccount()
        .accountsPartial({
          signer: this.wallet.publicKey,
          config,
          mint,
          targetTokenAccount,
          mintAuthority,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to thaw account: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Pause all minting, burning, and transfer operations.
   *
   * Only callable by the pauser role.
   *
   * @param mint  The stablecoin mint address.
   * @returns     Transaction signature.
   */
  async pause(mint: PublicKey): Promise<string> {
    try {
      const program = this.getProgram();
      const [config] = findConfigPda(mint, this.programId);

      return await program.methods
        .pause()
        .accountsPartial({
          pauser: this.wallet.publicKey,
          config,
        })
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to pause: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Resume operations after a pause.
   *
   * Only callable by the pauser role.
   *
   * @param mint  The stablecoin mint address.
   * @returns     Transaction signature.
   */
  async unpause(mint: PublicKey): Promise<string> {
    try {
      const program = this.getProgram();
      const [config] = findConfigPda(mint, this.programId);

      return await program.methods
        .unpause()
        .accountsPartial({
          pauser: this.wallet.publicKey,
          config,
        })
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to unpause: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Update a role assignment.
   *
   * Only callable by the authority.
   *
   * @param mint        The stablecoin mint address.
   * @param role        The role to update (MasterMinter, Pauser, or Blacklister).
   * @param newAddress  The new public key to assign to that role.
   * @returns           Transaction signature.
   */
  async updateRole(
    mint: PublicKey,
    role: RoleType,
    newAddress: PublicKey
  ): Promise<string> {
    try {
      const program = this.getProgram();
      const [config] = findConfigPda(mint, this.programId);
      const anchorRole = roleTypeToAnchor(role);

      return await program.methods
        .updateRole(anchorRole as never, newAddress)
        .accountsPartial({
          authority: this.wallet.publicKey,
          config,
        })
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to update role: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Initiate a two-step authority transfer.
   *
   * The new authority must call acceptAuthority() to complete the transfer.
   *
   * @param mint          The stablecoin mint address.
   * @param newAuthority  The public key of the proposed new authority.
   * @returns             Transaction signature.
   */
  async transferAuthority(
    mint: PublicKey,
    newAuthority: PublicKey
  ): Promise<string> {
    try {
      const program = this.getProgram();
      const [config] = findConfigPda(mint, this.programId);

      return await program.methods
        .transferAuthority(newAuthority)
        .accountsPartial({
          authority: this.wallet.publicKey,
          config,
        })
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to transfer authority: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Accept a pending authority transfer.
   *
   * Must be called by the pending authority (the wallet that was nominated by
   * the current authority via transferAuthority()).
   *
   * @param mint  The stablecoin mint address.
   * @returns     Transaction signature.
   */
  async acceptAuthority(mint: PublicKey): Promise<string> {
    try {
      const program = this.getProgram();
      const [config] = findConfigPda(mint, this.programId);

      return await program.methods
        .acceptAuthority()
        .accountsPartial({
          newAuthority: this.wallet.publicKey,
          config,
        })
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to accept authority: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Seize tokens from a source account using the permanent delegate (SSS-2 only).
   *
   * Only callable by the authority. Builds remaining accounts from the mint's
   * ExtraAccountMetaList so the transfer hook is satisfied.
   *
   * @param mint                     The stablecoin mint address.
   * @param sourceTokenAccount       The account to seize tokens from.
   * @param destinationTokenAccount  The account that receives the seized tokens.
   * @param amount                   Amount to seize (in base units).
   * @returns                        Transaction signature.
   */
  async seize(
    mint: PublicKey,
    sourceTokenAccount: PublicKey,
    destinationTokenAccount: PublicKey,
    amount: BN
  ): Promise<string> {
    try {
      const program = this.getProgram();
      const [config] = findConfigPda(mint, this.programId);
      const [mintAuthority] = findMintAuthorityPda(mint, this.programId);

      return await program.methods
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
        .rpc();
    } catch (err) {
      throw new Error(
        `Failed to seize tokens: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Fetch and deserialize the StablecoinConfig account for a given mint.
   *
   * @param mint  The stablecoin mint address.
   * @returns     The deserialized StablecoinConfig.
   */
  async getConfig(mint: PublicKey): Promise<StablecoinConfig> {
    try {
      const program = this.getProgram();
      const [config] = findConfigPda(mint, this.programId);
      const account = await program.account.stablecoinConfig.fetch(config);
      return account as unknown as StablecoinConfig;
    } catch (err) {
      throw new Error(
        `Failed to fetch stablecoin config for mint ${mint.toBase58()}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * Fetch and deserialize the MinterState account for a given mint and minter wallet.
   *
   * @param mint          The stablecoin mint address.
   * @param minterWallet  The minter's wallet public key.
   * @returns             The deserialized MinterState.
   */
  async getMinterState(
    mint: PublicKey,
    minterWallet: PublicKey
  ): Promise<MinterState> {
    try {
      const program = this.getProgram();
      const [config] = findConfigPda(mint, this.programId);
      const [minterState] = findMinterStatePda(config, minterWallet, this.programId);
      const account = await program.account.minterState.fetch(minterState);
      return account as unknown as MinterState;
    } catch (err) {
      throw new Error(
        `Failed to fetch minter state for mint ${mint.toBase58()} / minter ${minterWallet.toBase58()}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Event parsing
  // ---------------------------------------------------------------------------

  /**
   * Parse sss-core events from a transaction's log messages.
   *
   * @param txSignature  The transaction signature to parse events from.
   * @returns            Array of parsed events with name and data.
   */
  async parseTransactionEvents(
    txSignature: string
  ): Promise<{ name: string; data: Record<string, unknown> }[]> {
    const tx = await this.connection.getTransaction(txSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx?.meta?.logMessages) {
      return [];
    }

    const program = this.getProgram();
    const parser = new EventParser(program.programId, program.coder);
    const events: { name: string; data: Record<string, unknown> }[] = [];

    for (const event of parser.parseLogs(tx.meta.logMessages)) {
      events.push({ name: event.name, data: event.data as Record<string, unknown> });
    }

    return events;
  }

  /**
   * Fetch recent transaction signatures for a mint's config PDA.
   *
   * @param mint   The stablecoin mint address.
   * @param limit  Maximum number of signatures to fetch (default: 25).
   * @returns      Array of confirmed signature info.
   */
  async getRecentTransactions(
    mint: PublicKey,
    limit: number = 25
  ): Promise<ConfirmedSignatureInfo[]> {
    const [config] = findConfigPda(mint, this.programId);
    return this.connection.getSignaturesForAddress(config, { limit });
  }

  // ---------------------------------------------------------------------------
  // Transaction confirmation helper
  // ---------------------------------------------------------------------------

  /**
   * Send a transaction and wait for confirmation with retries.
   *
   * This is a utility for users who build transactions manually (e.g., via
   * TransactionBuilder.build()) and want reliable confirmation.
   *
   * @param txSignature  The transaction signature from sendRawTransaction.
   * @param commitment   Desired commitment level (default: "confirmed").
   * @returns            The confirmed transaction signature.
   */
  async confirmTransaction(
    txSignature: string,
    commitment: "processed" | "confirmed" | "finalized" = "confirmed"
  ): Promise<string> {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash(commitment);

    await this.connection.confirmTransaction(
      {
        signature: txSignature,
        blockhash,
        lastValidBlockHeight,
      },
      commitment
    );

    return txSignature;
  }
}
