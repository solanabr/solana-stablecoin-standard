import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";

import {
  Preset,
  Role,
  TokenInitParams,
  TokenConfigAccount,
  TokenStatus,
} from "../types";
import {
  getConfigPDA,
  getRolePDA,
  getBlacklistPDA,
  getExtraAccountMetaListPDA,
  SSS_TOKEN_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
} from "../utils/pda";

export interface SssClientConfig {
  connection: Connection;
  wallet: anchor.Wallet;
  tokenProgramId?: PublicKey;
  hookProgramId?: PublicKey;
}

export class SssClient {
  readonly connection: Connection;
  readonly wallet: anchor.Wallet;
  readonly tokenProgramId: PublicKey;
  readonly hookProgramId: PublicKey;
  private program: anchor.Program | null = null;

  constructor(config: SssClientConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.tokenProgramId = config.tokenProgramId ?? SSS_TOKEN_PROGRAM_ID;
    this.hookProgramId = config.hookProgramId ?? SSS_HOOK_PROGRAM_ID;
  }

  /**
   * Load the Anchor program from IDL. Call this before any instruction methods.
   */
  async loadProgram(idl: anchor.Idl): Promise<void> {
    const provider = new anchor.AnchorProvider(this.connection, this.wallet, {
      commitment: "confirmed",
    });
    this.program = new anchor.Program(idl, provider);
  }

  /**
   * Initialize a new SSS token.
   *
   * Returns the mint keypair and the tx signature.
   */
  async initialize(
    params: TokenInitParams
  ): Promise<{ mint: Keypair; signature: string }> {
    const mint = Keypair.generate();
    const [configPda] = getConfigPDA(mint.publicKey, this.tokenProgramId);
    const [rolePda] = getRolePDA(
      configPda,
      this.wallet.publicKey,
      this.tokenProgramId
    );

    const accounts: Record<string, PublicKey> = {
      deployer: this.wallet.publicKey,
      mint: mint.publicKey,
      config: configPda,
      deployerRole: rolePda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    };

    // For SSS-2, derive and pass the blacklist PDA
    if (params.preset === Preset.SSS2) {
      const [blacklistPda] = getBlacklistPDA(configPda, this.tokenProgramId);
      accounts.blacklist = blacklistPda;
    }

    const initParams = {
      preset: params.preset,
      name: params.name,
      symbol: params.symbol,
      uri: params.uri,
      decimals: params.decimals,
      supplyCap: new anchor.BN(params.supplyCap.toString()),
      transferHookProgram: params.transferHookProgram ?? null,
    };

    const sig = await this.getProgram()
      .methods.initialize(initParams)
      .accounts(accounts)
      .signers([mint])
      .rpc();

    return { mint, signature: sig };
  }

  /**
   * Set up transfer hook extra account metas (SSS-2 only, call after initialize)
   */
  async initializeExtraAccountMetas(
    mint: PublicKey
  ): Promise<string> {
    const [extraMetasPda] = getExtraAccountMetaListPDA(
      mint,
      this.hookProgramId
    );

    // This would use the hook program — for now return the PDA info
    // In production you'd call the hook program's initialize_extra_account_metas
    const [configPda] = getConfigPDA(mint, this.tokenProgramId);

    // Build the instruction manually since it's a different program
    const sig = await this.getProgram()
      .methods.initializeExtraAccountMetas()
      .accounts({
        payer: this.wallet.publicKey,
        mint,
        extraAccountMetaList: extraMetasPda,
        sssTokenProgram: this.tokenProgramId,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return sig;
  }

  /**
   * Mint tokens to a destination. Creates the ATA if it doesn't exist.
   */
  async mint(
    mint: PublicKey,
    destination: PublicKey,
    amount: bigint
  ): Promise<string> {
    const [configPda] = getConfigPDA(mint, this.tokenProgramId);
    const [rolePda] = getRolePDA(
      configPda,
      this.wallet.publicKey,
      this.tokenProgramId
    );

    const ata = getAssociatedTokenAddressSync(
      mint,
      destination,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Check if ATA exists, create if not
    const ataInfo = await this.connection.getAccountInfo(ata);
    const preInstructions: TransactionInstruction[] = [];
    if (!ataInfo) {
      preInstructions.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          ata,
          destination,
          mint,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }

    return await this.getProgram()
      .methods.mintTokens({ amount: new anchor.BN(amount.toString()) })
      .accounts({
        authority: this.wallet.publicKey,
        config: configPda,
        role: rolePda,
        mint,
        destination: ata,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .preInstructions(preInstructions)
      .rpc();
  }

  /**
   * Burn tokens from the caller's account.
   */
  async burn(mint: PublicKey, amount: bigint): Promise<string> {
    const [configPda] = getConfigPDA(mint, this.tokenProgramId);
    const [rolePda] = getRolePDA(
      configPda,
      this.wallet.publicKey,
      this.tokenProgramId
    );
    const source = getAssociatedTokenAddressSync(
      mint,
      this.wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    return await this.getProgram()
      .methods.burnTokens({ amount: new anchor.BN(amount.toString()) })
      .accounts({
        authority: this.wallet.publicKey,
        config: configPda,
        role: rolePda,
        mint,
        source,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Freeze a token account.
   */
  async freeze(mint: PublicKey, targetOwner: PublicKey): Promise<string> {
    const [configPda] = getConfigPDA(mint, this.tokenProgramId);
    const [rolePda] = getRolePDA(
      configPda,
      this.wallet.publicKey,
      this.tokenProgramId
    );
    const targetAccount = getAssociatedTokenAddressSync(
      mint,
      targetOwner,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    return await this.getProgram()
      .methods.freezeAccount()
      .accounts({
        authority: this.wallet.publicKey,
        config: configPda,
        role: rolePda,
        mint,
        targetAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Thaw a frozen token account.
   */
  async thaw(mint: PublicKey, targetOwner: PublicKey): Promise<string> {
    const [configPda] = getConfigPDA(mint, this.tokenProgramId);
    const [rolePda] = getRolePDA(
      configPda,
      this.wallet.publicKey,
      this.tokenProgramId
    );
    const targetAccount = getAssociatedTokenAddressSync(
      mint,
      targetOwner,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    return await this.getProgram()
      .methods.thawAccount()
      .accounts({
        authority: this.wallet.publicKey,
        config: configPda,
        role: rolePda,
        mint,
        targetAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  /**
   * Pause all token operations.
   */
  async pause(mint: PublicKey): Promise<string> {
    const [configPda] = getConfigPDA(mint, this.tokenProgramId);
    const [rolePda] = getRolePDA(
      configPda,
      this.wallet.publicKey,
      this.tokenProgramId
    );

    return await this.getProgram()
      .methods.pause()
      .accounts({
        authority: this.wallet.publicKey,
        config: configPda,
        role: rolePda,
      })
      .rpc();
  }

  /**
   * Unpause token operations.
   */
  async unpause(mint: PublicKey): Promise<string> {
    const [configPda] = getConfigPDA(mint, this.tokenProgramId);
    const [rolePda] = getRolePDA(
      configPda,
      this.wallet.publicKey,
      this.tokenProgramId
    );

    return await this.getProgram()
      .methods.unpause()
      .accounts({
        authority: this.wallet.publicKey,
        config: configPda,
        role: rolePda,
      })
      .rpc();
  }

  /**
   * Grant a role to a target wallet.
   */
  async grantRole(
    mint: PublicKey,
    target: PublicKey,
    role: Role
  ): Promise<string> {
    const [configPda] = getConfigPDA(mint, this.tokenProgramId);
    const [adminRolePda] = getRolePDA(
      configPda,
      this.wallet.publicKey,
      this.tokenProgramId
    );
    const [targetRolePda] = getRolePDA(
      configPda,
      target,
      this.tokenProgramId
    );

    return await this.getProgram()
      .methods.grantRole(target, role)
      .accounts({
        admin: this.wallet.publicKey,
        config: configPda,
        adminRole: adminRolePda,
        targetRole: targetRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  /**
   * Revoke a role from a target wallet.
   */
  async revokeRole(
    mint: PublicKey,
    target: PublicKey,
    role: Role
  ): Promise<string> {
    const [configPda] = getConfigPDA(mint, this.tokenProgramId);
    const [adminRolePda] = getRolePDA(
      configPda,
      this.wallet.publicKey,
      this.tokenProgramId
    );
    const [targetRolePda] = getRolePDA(
      configPda,
      target,
      this.tokenProgramId
    );

    return await this.getProgram()
      .methods.revokeRole(target, role)
      .accounts({
        admin: this.wallet.publicKey,
        config: configPda,
        adminRole: adminRolePda,
        targetRole: targetRolePda,
      })
      .rpc();
  }

  // --- SSS-2 methods ---

  /**
   * Add an address to the blacklist (SSS-2 only).
   */
  async blacklistAdd(mint: PublicKey, address: PublicKey): Promise<string> {
    const [configPda] = getConfigPDA(mint, this.tokenProgramId);
    const [rolePda] = getRolePDA(
      configPda,
      this.wallet.publicKey,
      this.tokenProgramId
    );
    const [blacklistPda] = getBlacklistPDA(configPda, this.tokenProgramId);

    return await this.getProgram()
      .methods.blacklistAdd(address)
      .accounts({
        authority: this.wallet.publicKey,
        config: configPda,
        role: rolePda,
        blacklist: blacklistPda,
      })
      .rpc();
  }

  /**
   * Remove an address from the blacklist (SSS-2 only).
   */
  async blacklistRemove(
    mint: PublicKey,
    address: PublicKey
  ): Promise<string> {
    const [configPda] = getConfigPDA(mint, this.tokenProgramId);
    const [rolePda] = getRolePDA(
      configPda,
      this.wallet.publicKey,
      this.tokenProgramId
    );
    const [blacklistPda] = getBlacklistPDA(configPda, this.tokenProgramId);

    return await this.getProgram()
      .methods.blacklistRemove(address)
      .accounts({
        authority: this.wallet.publicKey,
        config: configPda,
        role: rolePda,
        blacklist: blacklistPda,
      })
      .rpc();
  }

  /**
   * Seize tokens from a blacklisted account (SSS-2 only).
   */
  async seize(
    mint: PublicKey,
    sourceOwner: PublicKey,
    treasuryOwner: PublicKey
  ): Promise<string> {
    const [configPda] = getConfigPDA(mint, this.tokenProgramId);
    const [rolePda] = getRolePDA(
      configPda,
      this.wallet.publicKey,
      this.tokenProgramId
    );
    const [blacklistPda] = getBlacklistPDA(configPda, this.tokenProgramId);

    const source = getAssociatedTokenAddressSync(
      mint,
      sourceOwner,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const treasury = getAssociatedTokenAddressSync(
      mint,
      treasuryOwner,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    return await this.getProgram()
      .methods.seize()
      .accounts({
        authority: this.wallet.publicKey,
        config: configPda,
        role: rolePda,
        blacklist: blacklistPda,
        mint,
        source,
        treasury,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  // --- Read methods ---

  /**
   * Fetch the on-chain config for a mint.
   */
  async getConfig(mint: PublicKey): Promise<TokenConfigAccount> {
    const [configPda] = getConfigPDA(mint, this.tokenProgramId);
    return await this.getProgram().account.tokenConfig.fetch(configPda);
  }

  /**
   * Get full token status including supply, pause state, blacklist count.
   */
  async getStatus(mint: PublicKey): Promise<TokenStatus> {
    const config = await this.getConfig(mint);
    const mintAccount = await this.connection.getAccountInfo(mint);
    // Parse supply from Token-2022 mint data
    const supply = BigInt(0); // Would parse from mintAccount.data

    const status: TokenStatus = {
      config,
      supply,
      paused: config.paused,
      preset: config.preset as Preset,
    };

    if (config.preset === Preset.SSS2) {
      const [blacklistPda] = getBlacklistPDA(
        getConfigPDA(mint, this.tokenProgramId)[0],
        this.tokenProgramId
      );
      try {
        const bl = await this.getProgram().account.blacklist.fetch(
          blacklistPda
        );
        status.blacklistCount = bl.count;
      } catch {
        status.blacklistCount = 0;
      }
    }

    return status;
  }

  /**
   * Check if a wallet has a specific role for a given mint.
   */
  async hasRole(
    mint: PublicKey,
    authority: PublicKey,
    role: Role
  ): Promise<boolean> {
    const [configPda] = getConfigPDA(mint, this.tokenProgramId);
    const [rolePda] = getRolePDA(configPda, authority, this.tokenProgramId);
    try {
      const roleAccount = await this.getProgram().account.roleAccount.fetch(
        rolePda
      );
      return (roleAccount.roles & role) !== 0;
    } catch {
      return false;
    }
  }

  /**
   * Check if an address is blacklisted (SSS-2 only).
   */
  async isBlacklisted(mint: PublicKey, address: PublicKey): Promise<boolean> {
    const [configPda] = getConfigPDA(mint, this.tokenProgramId);
    const [blacklistPda] = getBlacklistPDA(configPda, this.tokenProgramId);
    try {
      const bl = await this.getProgram().account.blacklist.fetch(blacklistPda);
      return bl.entries.some((e: PublicKey) => e.equals(address));
    } catch {
      return false;
    }
  }

  private getProgram(): anchor.Program {
    if (!this.program) {
      throw new Error("Program not loaded — call loadProgram(idl) first");
    }
    return this.program;
  }
}
