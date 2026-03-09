import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  TransactionSignature,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  findConfigPda,
  findRolePda,
  findHookConfigPda,
  findBlacklistEntryPda,
  findExtraAccountMetaListPda,
  SSS_CORE_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "../utils/pda";
import {
  CreateMintParams,
  MintToParams,
  BurnFromParams,
  SeizeParams,
  GrantRoleParams,
  BlacklistParams,
  SetMetadataParams,
  Role,
  StablecoinInfo,
  RoleInfo,
} from "../utils/types";

const ROLE_NAMES: Record<Role, string> = {
  [Role.Minter]: "minter",
  [Role.Burner]: "burner",
  [Role.Seizer]: "seizer",
  [Role.Pauser]: "pauser",
  [Role.ComplianceOfficer]: "complianceOfficer",
};

export class SolanaStablecoin {
  private program: Program;
  private provider: AnchorProvider;

  constructor(provider: AnchorProvider, idl: Idl) {
    this.provider = provider;
    this.program = new Program(idl, provider);
  }

  // === Core Operations ===

  async createMint(
    params: CreateMintParams,
    mintKeypair?: Keypair
  ): Promise<{ signature: TransactionSignature; mint: PublicKey; config: PublicKey }> {
    const mint = mintKeypair ?? Keypair.generate();
    const [config] = findConfigPda(mint.publicKey);

    const txParams = {
      name: params.name,
      symbol: params.symbol,
      uri: params.uri,
      decimals: params.decimals,
      preset: params.preset,
      transferHookProgram: params.transferHookProgram ?? null,
      treasury: params.treasury ?? null,
    };

    const signature = await this.program.methods
      .createMint(txParams)
      .accounts({
        admin: this.provider.wallet.publicKey,
        mint: mint.publicKey,
        config,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();

    return { signature, mint: mint.publicKey, config };
  }

  async mintTo(params: MintToParams): Promise<TransactionSignature> {
    const [config] = findConfigPda(params.mint);
    const [roleAccount] = findRolePda(
      config,
      this.provider.wallet.publicKey,
      Role.Minter
    );

    let builder = this.program.methods
      .mintTo(params.amount)
      .accounts({
        minter: this.provider.wallet.publicKey,
        config,
        roleAccount,
        mint: params.mint,
        to: params.to,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      });

    if (params.toOwner) {
      const [hookConfig] = findHookConfigPda(params.mint);
      const [blacklistEntry] = findBlacklistEntryPda(hookConfig, params.toOwner);
      builder = builder.remainingAccounts([{ pubkey: blacklistEntry, isWritable: false, isSigner: false }]);
    }

    return builder.rpc();
  }

  async burnFrom(params: BurnFromParams): Promise<TransactionSignature> {
    const [config] = findConfigPda(params.mint);
    const [roleAccount] = findRolePda(
      config,
      this.provider.wallet.publicKey,
      Role.Burner
    );
    const [hookConfig] = findHookConfigPda(params.mint);
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, params.fromOwner);

    return this.program.methods
      .burnFrom(params.amount)
      .accounts({
        burner: this.provider.wallet.publicKey,
        config,
        roleAccount,
        mint: params.mint,
        from: params.from,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: blacklistEntry, isWritable: false, isSigner: false }])
      .rpc();
  }

  async seize(params: SeizeParams): Promise<TransactionSignature> {
    const [config] = findConfigPda(params.mint);
    const [roleAccount] = findRolePda(
      config,
      this.provider.wallet.publicKey,
      Role.Seizer
    );
    const [hookConfig] = findHookConfigPda(params.mint);
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, params.fromOwner);

    return this.program.methods
      .seize(params.amount)
      .accounts({
        seizer: this.provider.wallet.publicKey,
        config,
        roleAccount,
        mint: params.mint,
        from: params.from,
        treasuryAta: params.treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts([{ pubkey: blacklistEntry, isWritable: false, isSigner: false }])
      .rpc();
  }

  // === Role Management ===

  async grantRole(params: GrantRoleParams): Promise<TransactionSignature> {
    const [config] = findConfigPda(params.mint);
    const [roleAccount] = findRolePda(
      config,
      params.holder,
      params.role
    );

    return this.program.methods
      .grantRole({ [ROLE_NAMES[params.role]]: {} }, params.allowance)
      .accounts({
        admin: this.provider.wallet.publicKey,
        config,
        holder: params.holder,
        roleAccount,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async revokeRole(
    mint: PublicKey,
    holder: PublicKey,
    role: Role
  ): Promise<TransactionSignature> {
    const [config] = findConfigPda(mint);
    const [roleAccount] = findRolePda(config, holder, role);

    return this.program.methods
      .revokeRole()
      .accounts({
        admin: this.provider.wallet.publicKey,
        config,
        holder,
        roleAccount,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async incrementAllowance(
    mint: PublicKey,
    minterHolder: PublicKey,
    amount: BN
  ): Promise<TransactionSignature> {
    const [config] = findConfigPda(mint);
    const [minterRoleAccount] = findRolePda(config, minterHolder, Role.Minter);

    return this.program.methods
      .incrementAllowance(amount)
      .accounts({
        admin: this.provider.wallet.publicKey,
        config,
        minterRoleAccount,
      })
      .rpc();
  }

  // === Compliance ===

  async blacklist(params: BlacklistParams): Promise<TransactionSignature> {
    const [config] = findConfigPda(params.mint);
    const [hookConfig] = findHookConfigPda(params.mint);
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, params.wallet);
    const info = await this.getStablecoinInfo(params.mint);

    return this.program.methods
      .blacklist(params.wallet)
      .accounts({
        payer: this.provider.wallet.publicKey,
        admin: this.provider.wallet.publicKey,
        config,
        hookConfig,
        blacklistEntry,
        transferHookProgram: info.transferHookProgram!,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async unblacklist(params: BlacklistParams): Promise<TransactionSignature> {
    const [config] = findConfigPda(params.mint);
    const [hookConfig] = findHookConfigPda(params.mint);
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, params.wallet);
    const info = await this.getStablecoinInfo(params.mint);

    return this.program.methods
      .unblacklist(params.wallet)
      .accounts({
        payer: this.provider.wallet.publicKey,
        admin: this.provider.wallet.publicKey,
        config,
        hookConfig,
        blacklistEntry,
        transferHookProgram: info.transferHookProgram!,
      })
      .rpc();
  }

  async freezeAccount(mint: PublicKey, tokenAccount: PublicKey, roleAccountPda?: PublicKey): Promise<TransactionSignature> {
    const [config] = findConfigPda(mint);
    const accounts: any = {
      authority: this.provider.wallet.publicKey,
      config,
      mint,
      tokenAccount,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    };
    if (roleAccountPda) {
      accounts.roleAccount = roleAccountPda;
    } else {
      // Pass program ID → Anchor treats Optional<Account> as None (admin path)
      accounts.roleAccount = this.program.programId;
    }

    return this.program.methods
      .freezeAccount()
      .accounts(accounts)
      .rpc();
  }

  async thawAccount(mint: PublicKey, tokenAccount: PublicKey, roleAccountPda?: PublicKey): Promise<TransactionSignature> {
    const [config] = findConfigPda(mint);
    const accounts: any = {
      authority: this.provider.wallet.publicKey,
      config,
      mint,
      tokenAccount,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    };
    if (roleAccountPda) {
      accounts.roleAccount = roleAccountPda;
    } else {
      // Pass program ID → Anchor treats Optional<Account> as None (admin path)
      accounts.roleAccount = this.program.programId;
    }

    return this.program.methods
      .thawAccount()
      .accounts(accounts)
      .rpc();
  }

  // === Pause/Unpause ===

  async pause(mint: PublicKey, roleAccount?: PublicKey): Promise<TransactionSignature> {
    const [config] = findConfigPda(mint);
    const accounts: any = {
      authority: this.provider.wallet.publicKey,
      config,
    };
    if (roleAccount) {
      accounts.roleAccount = roleAccount;
    } else {
      // Pass program ID → Anchor treats Optional<Account> as None (admin path)
      accounts.roleAccount = this.program.programId;
    }

    return this.program.methods
      .pause()
      .accounts(accounts)
      .rpc();
  }

  async unpause(mint: PublicKey, roleAccount?: PublicKey): Promise<TransactionSignature> {
    const [config] = findConfigPda(mint);
    const accounts: any = {
      authority: this.provider.wallet.publicKey,
      config,
    };
    if (roleAccount) {
      accounts.roleAccount = roleAccount;
    } else {
      // Pass program ID → Anchor treats Optional<Account> as None (admin path)
      accounts.roleAccount = this.program.programId;
    }

    return this.program.methods
      .unpause()
      .accounts(accounts)
      .rpc();
  }

  // === Admin Transfer ===

  async transferAdmin(mint: PublicKey, newAdmin: PublicKey): Promise<TransactionSignature> {
    const [config] = findConfigPda(mint);

    return this.program.methods
      .transferAdmin(newAdmin)
      .accounts({
        admin: this.provider.wallet.publicKey,
        config,
      })
      .rpc();
  }

  async acceptAdmin(mint: PublicKey): Promise<TransactionSignature> {
    const [config] = findConfigPda(mint);

    return this.program.methods
      .acceptAdmin()
      .accounts({
        pendingAdmin: this.provider.wallet.publicKey,
        config,
      })
      .rpc();
  }

  async setMetadata(params: SetMetadataParams): Promise<TransactionSignature> {
    const [config] = findConfigPda(params.mint);

    return this.program.methods
      .setMetadata({ name: params.name, symbol: params.symbol, uri: params.uri })
      .accounts({
        admin: this.provider.wallet.publicKey,
        mint: params.mint,
        config,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  // === Hook Initialization ===

  async initializeHook(mint: PublicKey): Promise<TransactionSignature> {
    const [config] = findConfigPda(mint);
    const info = await this.getStablecoinInfo(mint);
    const [hookConfig] = findHookConfigPda(mint);
    const [extraAccountMetaList] = findExtraAccountMetaListPda(mint);

    return this.program.methods
      .initializeHook()
      .accounts({
        payer: this.provider.wallet.publicKey,
        admin: this.provider.wallet.publicKey,
        config,
        mint,
        hookConfig,
        extraAccountMetaList,
        transferHookProgram: info.transferHookProgram!,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  // === Query Methods ===

  async getStablecoinInfo(mint: PublicKey): Promise<StablecoinInfo> {
    const [config] = findConfigPda(mint);
    const account = await (this.program.account as any).stablecoinConfig.fetch(config);

    const ZERO_PUBKEY = "11111111111111111111111111111111";
    const transferHookProgram: PublicKey | null =
      account.transferHookProgram && account.transferHookProgram.toBase58() !== ZERO_PUBKEY
        ? account.transferHookProgram
        : null;
    const treasury: PublicKey | null =
      account.treasury && account.treasury.toBase58() !== ZERO_PUBKEY
        ? account.treasury
        : null;

    return {
      admin: account.admin,
      pendingAdmin: account.pendingAdmin,
      mint: account.mint,
      preset: account.preset.sss1 !== undefined ? 0 :
             account.preset.sss2 !== undefined ? 1 : 2,
      paused: account.paused,
      transferHookProgram,
      treasury,
      totalMinted: account.totalMinted,
      totalBurned: account.totalBurned,
      totalSeized: account.totalSeized,
    };
  }

  async getRoleInfo(
    mint: PublicKey,
    holder: PublicKey,
    role: Role
  ): Promise<RoleInfo | null> {
    const [config] = findConfigPda(mint);
    const [roleAccount] = findRolePda(config, holder, role);

    try {
      const account = await (this.program.account as any).roleAccount.fetch(roleAccount);
      return {
        config: account.config,
        holder: account.holder,
        role: account.role.minter ? Role.Minter :
              account.role.burner ? Role.Burner :
              account.role.seizer ? Role.Seizer :
              account.role.pauser ? Role.Pauser :
              Role.ComplianceOfficer,
        allowance: account.allowance,
      };
    } catch {
      return null;
    }
  }

  async isBlacklisted(mint: PublicKey, wallet: PublicKey): Promise<boolean> {
    const [hookConfig] = findHookConfigPda(mint);
    const [blacklistEntry] = findBlacklistEntryPda(hookConfig, wallet);

    try {
      const accountInfo = await this.provider.connection.getAccountInfo(blacklistEntry);
      return accountInfo !== null && accountInfo.lamports > 0;
    } catch {
      return false;
    }
  }
}
