import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionSignature,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  createInitializeDefaultAccountStateInstruction,
  getMintLen,
  ExtensionType,
  AccountState,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import {
  StablecoinConfig,
  MinterInfo,
  BlacklistInfo,
  Role,
  StablecoinStateData,
} from "./types";
import {
  findStablecoinPda,
  findMinterPda,
  findRolePda,
  findBlacklistPda,
} from "./pda";
import {
  SSS_TOKEN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
} from "./constants";

// IDL will be loaded at runtime
// eslint-disable-next-line @typescript-eslint/no-var-requires
let IDL: any;
try {
  IDL = require("../../target/idl/sss_token.json");
} catch {
  // IDL not available — will need to be provided
}

/**
 * Main entry point for the Solana Stablecoin Standard SDK.
 *
 * @example
 * ```typescript
 * import { SolanaStablecoin, Presets } from "@stbr/sss-token";
 *
 * const stable = await SolanaStablecoin.create(connection, wallet, Presets.SSS1({
 *   name: "MyStable",
 *   symbol: "MSTB",
 *   decimals: 6,
 * }));
 *
 * await stable.mint(recipient, 1_000_000);
 * ```
 */
export class SolanaStablecoin {
  private program: Program;
  private provider: AnchorProvider;
  public mint: PublicKey;
  public stablecoinPda: PublicKey;
  public stablecoinBump: number;
  public config: StablecoinConfig;

  private constructor(
    program: Program,
    provider: AnchorProvider,
    mint: PublicKey,
    stablecoinPda: PublicKey,
    stablecoinBump: number,
    config: StablecoinConfig
  ) {
    this.program = program;
    this.provider = provider;
    this.mint = mint;
    this.stablecoinPda = stablecoinPda;
    this.stablecoinBump = stablecoinBump;
    this.config = config;
  }

  /**
   * Create and initialize a new stablecoin.
   * Sets up the Token-2022 mint with requested extensions, then calls the on-chain initialize instruction.
   */
  static async create(
    connection: Connection,
    wallet: Wallet,
    config: StablecoinConfig,
    idl?: any
  ): Promise<SolanaStablecoin> {
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    const program = new Program(idl ?? IDL, provider);

    // Generate mint keypair
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;

    // Determine extensions
    const extensions: ExtensionType[] = [];
    if (config.enablePermanentDelegate) {
      extensions.push(ExtensionType.PermanentDelegate);
    }
    if (config.enableTransferHook) {
      extensions.push(ExtensionType.TransferHook);
    }
    if (config.defaultAccountFrozen) {
      extensions.push(ExtensionType.DefaultAccountState);
    }

    // Calculate mint space
    const mintLen = getMintLen(extensions);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    // Derive stablecoin PDA (will be mint authority & freeze authority)
    const [stablecoinPda, stablecoinBump] = findStablecoinPda(mint);

    // Build mint creation + extension init instructions
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    const ixs = [createAccountIx];

    if (config.enablePermanentDelegate) {
      ixs.push(
        createInitializePermanentDelegateInstruction(
          mint,
          stablecoinPda, // PDA is the permanent delegate
          TOKEN_2022_PROGRAM_ID
        )
      );
    }

    if (config.enableTransferHook) {
      ixs.push(
        createInitializeTransferHookInstruction(
          mint,
          stablecoinPda, // PDA controls the hook
          TRANSFER_HOOK_PROGRAM_ID,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }

    if (config.defaultAccountFrozen) {
      ixs.push(
        createInitializeDefaultAccountStateInstruction(
          mint,
          AccountState.Frozen,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }

    // Initialize the mint itself
    ixs.push(
      createInitializeMintInstruction(
        mint,
        config.decimals,
        stablecoinPda, // Mint authority = PDA
        stablecoinPda, // Freeze authority = PDA
        TOKEN_2022_PROGRAM_ID
      )
    );

    // Send mint creation transaction
    const { blockhash } = await connection.getLatestBlockhash();
    const tx = new (await import("@solana/web3.js")).Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    ixs.forEach((ix) => tx.add(ix));
    tx.sign(mintKeypair);
    const signedTx = await wallet.signTransaction(tx);
    await connection.sendRawTransaction(signedTx.serialize());

    // Call the on-chain initialize instruction
    await program.methods
      .initialize({
        name: config.name,
        symbol: config.symbol,
        uri: config.uri,
        decimals: config.decimals,
        enablePermanentDelegate: config.enablePermanentDelegate,
        enableTransferHook: config.enableTransferHook,
        defaultAccountFrozen: config.defaultAccountFrozen,
      })
      .accounts({
        authority: wallet.publicKey,
        stablecoinState: stablecoinPda,
        mint,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return new SolanaStablecoin(
      program,
      provider,
      mint,
      stablecoinPda,
      stablecoinBump,
      config
    );
  }

  /**
   * Load an existing stablecoin from its mint address.
   */
  static async load(
    connection: Connection,
    wallet: Wallet,
    mint: PublicKey,
    idl?: any
  ): Promise<SolanaStablecoin> {
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    const program = new Program(idl ?? IDL, provider);
    const [stablecoinPda, stablecoinBump] = findStablecoinPda(mint);

    const state = (await program.account.stablecoinState.fetch(
      stablecoinPda
    )) as any;

    const config: StablecoinConfig = {
      name: state.name,
      symbol: state.symbol,
      uri: state.uri,
      decimals: state.decimals,
      enablePermanentDelegate: state.permanentDelegateEnabled,
      enableTransferHook: state.transferHookEnabled,
      defaultAccountFrozen: state.defaultAccountFrozen,
    };

    return new SolanaStablecoin(
      program,
      provider,
      mint,
      stablecoinPda,
      stablecoinBump,
      config
    );
  }

  /** Fetch the on-chain state. */
  async getState(): Promise<StablecoinStateData> {
    return (await this.program.account.stablecoinState.fetch(
      this.stablecoinPda
    )) as any;
  }

  // ===== Minting =====

  /** Mint tokens to a recipient. Caller must be an authorized minter. */
  async mint(
    recipient: PublicKey,
    amount: number | BN
  ): Promise<TransactionSignature> {
    const amountBn = new BN(amount.toString());
    const [minterPda] = findMinterPda(
      this.stablecoinPda,
      this.provider.wallet.publicKey
    );

    const recipientAta = getAssociatedTokenAddressSync(
      this.mint,
      recipient,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    return this.program.methods
      .mintTokens(amountBn)
      .accounts({
        minter: this.provider.wallet.publicKey,
        stablecoinState: this.stablecoinPda,
        minterState: minterPda,
        mint: this.mint,
        recipientTokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  // ===== Burning =====

  /** Burn tokens from a token account. Caller must be an authorized burner. */
  async burn(
    tokenAccount: PublicKey,
    amount: number | BN
  ): Promise<TransactionSignature> {
    const amountBn = new BN(amount.toString());
    const [rolePda] = findRolePda(
      this.stablecoinPda,
      Role.Burner,
      this.provider.wallet.publicKey
    );

    return this.program.methods
      .burnTokens(amountBn)
      .accounts({
        burner: this.provider.wallet.publicKey,
        stablecoinState: this.stablecoinPda,
        roleAssignment: rolePda,
        mint: this.mint,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  // ===== Freeze / Thaw =====

  /** Freeze a token account. */
  async freezeAccount(tokenAccount: PublicKey): Promise<TransactionSignature> {
    return this.program.methods
      .freezeAccount()
      .accounts({
        authority: this.provider.wallet.publicKey,
        stablecoinState: this.stablecoinPda,
        mint: this.mint,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /** Thaw a frozen token account. */
  async thawAccount(tokenAccount: PublicKey): Promise<TransactionSignature> {
    return this.program.methods
      .thawAccount()
      .accounts({
        authority: this.provider.wallet.publicKey,
        stablecoinState: this.stablecoinPda,
        mint: this.mint,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  // ===== Pause / Unpause =====

  /** Pause all minting and burning. */
  async pause(): Promise<TransactionSignature> {
    return this.program.methods
      .pause()
      .accounts({
        authority: this.provider.wallet.publicKey,
        stablecoinState: this.stablecoinPda,
      })
      .rpc();
  }

  /** Unpause minting and burning. */
  async unpause(): Promise<TransactionSignature> {
    return this.program.methods
      .unpause()
      .accounts({
        authority: this.provider.wallet.publicKey,
        stablecoinState: this.stablecoinPda,
      })
      .rpc();
  }

  // ===== Role Management =====

  /** Add or update a minter with an optional quota. */
  async updateMinter(
    minter: PublicKey,
    quota?: number | BN
  ): Promise<TransactionSignature> {
    const [minterPda] = findMinterPda(this.stablecoinPda, minter);
    const quotaBn = quota ? new BN(quota.toString()) : null;

    return this.program.methods
      .updateMinter(quotaBn)
      .accounts({
        authority: this.provider.wallet.publicKey,
        stablecoinState: this.stablecoinPda,
        minter,
        minterState: minterPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /** Remove a minter. */
  async removeMinter(minter: PublicKey): Promise<TransactionSignature> {
    const [minterPda] = findMinterPda(this.stablecoinPda, minter);

    return this.program.methods
      .removeMinter()
      .accounts({
        authority: this.provider.wallet.publicKey,
        stablecoinState: this.stablecoinPda,
        minter,
        minterState: minterPda,
      })
      .rpc();
  }

  /** Assign or revoke a role. */
  async updateRole(
    role: Role,
    assignee: PublicKey,
    active: boolean
  ): Promise<TransactionSignature> {
    const [rolePda] = findRolePda(this.stablecoinPda, role, assignee);

    // Convert Role enum to anchor format
    const roleArg = this.roleToAnchor(role);

    return this.program.methods
      .updateRoles(roleArg, assignee, active)
      .accounts({
        authority: this.provider.wallet.publicKey,
        stablecoinState: this.stablecoinPda,
        roleAssignment: rolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /** Transfer master authority to a new key. */
  async transferAuthority(
    newAuthority: PublicKey
  ): Promise<TransactionSignature> {
    return this.program.methods
      .transferAuthority()
      .accounts({
        authority: this.provider.wallet.publicKey,
        stablecoinState: this.stablecoinPda,
        newAuthority,
      })
      .rpc();
  }

  // ===== SSS-2 Compliance =====

  /** Add an address to the blacklist (SSS-2 only). */
  async addToBlacklist(
    target: PublicKey,
    reason: string
  ): Promise<TransactionSignature> {
    const [blacklistPda] = findBlacklistPda(this.stablecoinPda, target);
    const [rolePda] = findRolePda(
      this.stablecoinPda,
      Role.Blacklister,
      this.provider.wallet.publicKey
    );

    return this.program.methods
      .addToBlacklist(reason)
      .accounts({
        blacklister: this.provider.wallet.publicKey,
        stablecoinState: this.stablecoinPda,
        roleAssignment: rolePda,
        target,
        blacklistEntry: blacklistPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /** Remove an address from the blacklist (SSS-2 only). */
  async removeFromBlacklist(target: PublicKey): Promise<TransactionSignature> {
    const [blacklistPda] = findBlacklistPda(this.stablecoinPda, target);
    const [rolePda] = findRolePda(
      this.stablecoinPda,
      Role.Blacklister,
      this.provider.wallet.publicKey
    );

    return this.program.methods
      .removeFromBlacklist()
      .accounts({
        blacklister: this.provider.wallet.publicKey,
        stablecoinState: this.stablecoinPda,
        roleAssignment: rolePda,
        target,
        blacklistEntry: blacklistPda,
      })
      .rpc();
  }

  /** Seize tokens from a blacklisted account (SSS-2 only). */
  async seize(
    from: PublicKey,
    treasury: PublicKey
  ): Promise<TransactionSignature> {
    const fromAta = getAssociatedTokenAddressSync(
      this.mint,
      from,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const treasuryAta = getAssociatedTokenAddressSync(
      this.mint,
      treasury,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const [blacklistPda] = findBlacklistPda(this.stablecoinPda, from);
    const [rolePda] = findRolePda(
      this.stablecoinPda,
      Role.Seizer,
      this.provider.wallet.publicKey
    );

    return this.program.methods
      .seize()
      .accounts({
        seizer: this.provider.wallet.publicKey,
        stablecoinState: this.stablecoinPda,
        roleAssignment: rolePda,
        blacklistEntry: blacklistPda,
        mint: this.mint,
        from: fromAta,
        treasury: treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  // ===== Utilities =====

  /** Get the associated token address for a wallet. */
  getTokenAddress(owner: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(
      this.mint,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID
    );
  }

  /** Create an associated token account instruction for a wallet. */
  createTokenAccountIx(owner: PublicKey) {
    return createAssociatedTokenAccountInstruction(
      this.provider.wallet.publicKey,
      this.getTokenAddress(owner),
      owner,
      this.mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  }

  private roleToAnchor(role: Role): any {
    switch (role) {
      case Role.Burner:
        return { burner: {} };
      case Role.Pauser:
        return { pauser: {} };
      case Role.Blacklister:
        return { blacklister: {} };
      case Role.Seizer:
        return { seizer: {} };
    }
  }
}
