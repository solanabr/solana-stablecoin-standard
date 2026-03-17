import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { stablecoin } from "@stbr/sss-generated-web3js";
import type { StablecoinClientLike } from "./types";
import {
  findBlacklistEntryPda,
  findConfigPda,
  findExtraAccountMetaListPda,
  findHookConfigPda,
  findMinterQuotaPda,
  findRoleConfigPda,
} from "./pdas";
import { buildAndSignTransaction } from "./transaction";
import { Compliance } from "./compliance";

export interface MintArgs {
  recipient: PublicKey;
  amount: bigint;
}

export interface BurnArgs {
  account: PublicKey;
  amount: bigint;
}

export interface SeizeArgs {
  frozenAccount: PublicKey; // source token account to seize from
  frozenAccountOwner: PublicKey; // owner of frozen account (for blacklist PDA)
  treasury: PublicKey; // destination token account
  treasuryOwner: PublicKey; // owner of treasury (for destinationBlacklist PDA)
  amount: bigint;
}

export interface TransferArgs {
  source: PublicKey;
  destination: PublicKey;
  owner: PublicKey;
  amount: bigint;
}

export interface UpdateRolesArgs {
  pauser?: PublicKey | null;
  burner?: PublicKey | null;
  blacklister?: PublicKey | null;
  seizer?: PublicKey | null;
}

export interface UpdateMinterArgs {
  minter: PublicKey;
  quota: bigint;
  active: boolean;
}

export class Stablecoin {
  readonly client: StablecoinClientLike;
  readonly mintAddress: PublicKey;
  readonly compliance: Compliance;

  constructor(client: StablecoinClientLike, mint: PublicKey) {
    this.client = client;
    this.mintAddress = mint;
    this.compliance = new Compliance(this);
  }

  private get configPda(): PublicKey {
    return findConfigPda(this.mintAddress, this.client.stablecoinProgramId)[0];
  }

  private get roleConfigPda(): PublicKey {
    return findRoleConfigPda(this.mintAddress, this.client.stablecoinProgramId)[0];
  }

  private requireWallet(): NonNullable<StablecoinClientLike["wallet"]> {
    if (!this.client.wallet) {
      throw new Error("Wallet required");
    }
    return this.client.wallet;
  }

  // ─── Read methods ─────────────────────────────────────────────────────────

  async getConfig() {
    return stablecoin.fetchStablecoinConfigAccount(
      this.client.connection,
      this.configPda
    );
  }

  async getRoleConfig() {
    return stablecoin.fetchRoleConfigAccount(
      this.client.connection,
      this.roleConfigPda
    );
  }

  async getMinterQuota(minter: PublicKey) {
    const [pda] = findMinterQuotaPda(
      this.mintAddress,
      minter,
      this.client.stablecoinProgramId
    );
    return stablecoin.fetchMinterQuotaAccount(
      this.client.connection,
      pda
    ).catch(() => null);
  }

  async getBlacklistEntry(wallet: PublicKey) {
    const [pda] = findBlacklistEntryPda(
      this.mintAddress,
      wallet,
      this.client.stablecoinProgramId
    );
    return stablecoin
      .fetchBlacklistEntryAccount(this.client.connection, pda)
      .catch(() => null);
  }

  async getTotalSupply(): Promise<bigint> {
    const config = await this.getConfig();
    return config.data.totalMinted - config.data.totalBurned;
  }

  async isPaused(): Promise<boolean> {
    const config = await this.getConfig();
    return config.data.paused;
  }

  async isBlacklisted(wallet: PublicKey): Promise<boolean> {
    const entry = await this.getBlacklistEntry(wallet);
    return entry !== null;
  }

  async hasTransferHook(): Promise<boolean> {
    const config = await this.getConfig();
    return config.data.enableTransferHook;
  }

  async getMintInfo() {
    return getMint(
      this.client.connection,
      this.mintAddress,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
  }

  async getTokenAccount(account: PublicKey) {
    return getAccount(
      this.client.connection,
      account,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
  }

  async getTokenBalance(account: PublicKey): Promise<bigint> {
    const acc = await this.getTokenAccount(account);
    return acc.amount;
  }

  // ─── Instructions ────────────────────────────────────────────────────────

  getMintInstruction(args: MintArgs): TransactionInstruction {
    const [minterQuotaPda] = findMinterQuotaPda(
      this.mintAddress,
      this.requireWallet().publicKey,
      this.client.stablecoinProgramId
    );
    const toAta = getAssociatedTokenAddressSync(
      this.mintAddress,
      args.recipient,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    return stablecoin.createMintInstruction(
      {
        authority: this.requireWallet().publicKey,
        config: this.configPda,
        minterQuota: minterQuotaPda,
        mint: this.mintAddress,
        to: toAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        program: this.client.stablecoinProgramId,
      },
      { amount: args.amount },
      this.client.stablecoinProgramId
    );
  }

  getBurnInstruction(args: BurnArgs): TransactionInstruction {
    return stablecoin.createBurnInstruction(
      {
        authority: this.requireWallet().publicKey,
        config: this.configPda,
        roleConfig: this.roleConfigPda,
        mint: this.mintAddress,
        from: args.account,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        program: this.client.stablecoinProgramId,
      },
      { amount: args.amount },
      this.client.stablecoinProgramId
    );
  }

  getPauseInstruction(): TransactionInstruction {
    return stablecoin.createPauseInstruction(
      {
        authority: this.requireWallet().publicKey,
        config: this.configPda,
        roleConfig: this.roleConfigPda,
        program: this.client.stablecoinProgramId,
      },
      this.client.stablecoinProgramId
    );
  }

  getUnpauseInstruction(): TransactionInstruction {
    return stablecoin.createUnpauseInstruction(
      {
        authority: this.requireWallet().publicKey,
        config: this.configPda,
        roleConfig: this.roleConfigPda,
        program: this.client.stablecoinProgramId,
      },
      this.client.stablecoinProgramId
    );
  }

  getFreezeAccountInstruction(account: PublicKey): TransactionInstruction {
    return stablecoin.createFreezeAccountInstruction(
      {
        authority: this.requireWallet().publicKey,
        config: this.configPda,
        roleConfig: this.roleConfigPda,
        mint: this.mintAddress,
        account,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        program: this.client.stablecoinProgramId,
      },
      this.client.stablecoinProgramId
    );
  }

  getThawAccountInstruction(account: PublicKey): TransactionInstruction {
    return stablecoin.createThawAccountInstruction(
      {
        authority: this.requireWallet().publicKey,
        config: this.configPda,
        roleConfig: this.roleConfigPda,
        mint: this.mintAddress,
        account,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        program: this.client.stablecoinProgramId,
      },
      this.client.stablecoinProgramId
    );
  }

  getAddToBlacklistInstruction(wallet: PublicKey, reason: string): TransactionInstruction {
    const [blacklistEntryPda] = findBlacklistEntryPda(
      this.mintAddress,
      wallet,
      this.client.stablecoinProgramId
    );
    return stablecoin.createAddToBlacklistInstruction(
      {
        authority: this.requireWallet().publicKey,
        config: this.configPda,
        roleConfig: this.roleConfigPda,
        wallet,
        blacklistEntry: blacklistEntryPda,
        systemProgram: SystemProgram.programId,
        program: this.client.stablecoinProgramId,
      },
      { reason },
      this.client.stablecoinProgramId
    );
  }

  getRemoveFromBlacklistInstruction(wallet: PublicKey): TransactionInstruction {
    const [blacklistEntryPda] = findBlacklistEntryPda(
      this.mintAddress,
      wallet,
      this.client.stablecoinProgramId
    );
    return stablecoin.createRemoveFromBlacklistInstruction(
      {
        authority: this.requireWallet().publicKey,
        config: this.configPda,
        roleConfig: this.roleConfigPda,
        blacklistEntry: blacklistEntryPda,
        program: this.client.stablecoinProgramId,
      },
      this.client.stablecoinProgramId
    );
  }

  getSeizeInstruction(args: SeizeArgs): TransactionInstruction {
    const transferHookProgramId = this.client.transferHookProgramId;
    if (!transferHookProgramId) {
      throw new Error(
        "transferHookProgramId required for seize (SSS-2 compliance)"
      );
    }
    const [blacklistEntryPda] = findBlacklistEntryPda(
      this.mintAddress,
      args.frozenAccountOwner,
      this.client.stablecoinProgramId
    );
    // destinationBlacklist = blacklist PDA for the owner of the treasury token account
    const [destinationBlacklistPda] = findBlacklistEntryPda(
      this.mintAddress,
      args.treasuryOwner,
      this.client.stablecoinProgramId
    );
    const [extraAccountMetaListPda] = findExtraAccountMetaListPda(
      this.mintAddress,
      transferHookProgramId
    );
    const [hookConfigPda] = findHookConfigPda(transferHookProgramId);
    return stablecoin.createSeizeInstruction(
      {
        authority: this.requireWallet().publicKey,
        config: this.configPda,
        roleConfig: this.roleConfigPda,
        mint: this.mintAddress,
        from: args.frozenAccount,
        to: args.treasury,
        blacklistEntry: blacklistEntryPda,
        stablecoinProgram: this.client.stablecoinProgramId,
        transferHookProgram: transferHookProgramId,
        hookConfig: hookConfigPda,
        extraAccountMetaList: extraAccountMetaListPda,
        destinationBlacklist: destinationBlacklistPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        program: this.client.stablecoinProgramId,
      },
      { amount: args.amount },
      this.client.stablecoinProgramId
    );
  }

  getTransferAuthorityInstruction(newAuthority: PublicKey): TransactionInstruction {
    return stablecoin.createTransferAuthorityInstruction(
      {
        authority: this.requireWallet().publicKey,
        config: this.configPda,
        roleConfig: this.roleConfigPda,
        program: this.client.stablecoinProgramId,
      },
      { newAuthority },
      this.client.stablecoinProgramId
    );
  }

  getUpdateRolesInstruction(args: UpdateRolesArgs): TransactionInstruction {
    return stablecoin.createUpdateRolesInstruction(
      {
        authority: this.requireWallet().publicKey,
        config: this.configPda,
        roleConfig: this.roleConfigPda,
        program: this.client.stablecoinProgramId,
      },
      {
        pauser: args.pauser ?? null,
        burner: args.burner ?? null,
        blacklister: args.blacklister ?? null,
        seizer: args.seizer ?? null,
      },
      this.client.stablecoinProgramId
    );
  }

  getUpdateMinterInstruction(args: UpdateMinterArgs): TransactionInstruction {
    const [minterQuotaPda] = findMinterQuotaPda(
      this.mintAddress,
      args.minter,
      this.client.stablecoinProgramId
    );
    return stablecoin.createUpdateMinterInstruction(
      {
        authority: this.requireWallet().publicKey,
        config: this.configPda,
        roleConfig: this.roleConfigPda,
        mint: this.mintAddress,
        minter: args.minter,
        minterQuota: minterQuotaPda,
        systemProgram: SystemProgram.programId,
        program: this.client.stablecoinProgramId,
      },
      { minter: args.minter, quota: args.quota, active: args.active },
      this.client.stablecoinProgramId
    );
  }

  async getTransferInstruction(args: TransferArgs): Promise<TransactionInstruction> {
    const mintInfo = await this.getMintInfo();
    const hasHook = await this.hasTransferHook();
    if (hasHook) {
      return createTransferCheckedWithTransferHookInstruction(
        this.client.connection,
        args.source,
        this.mintAddress,
        args.destination,
        args.owner,
        args.amount,
        mintInfo.decimals,
        [],
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
    }
    return createTransferCheckedInstruction(
      args.source,
      this.mintAddress,
      args.destination,
      args.owner,
      args.amount,
      mintInfo.decimals,
      [],
      TOKEN_2022_PROGRAM_ID
    );
  }

  // ─── Transactions ────────────────────────────────────────────────────────

  async buildMintTransaction(args: MintArgs): Promise<VersionedTransaction> {
    const ix = this.getMintInstruction(args);
    const result = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      false
    );
    return result as VersionedTransaction;
  }

  async buildBurnTransaction(args: BurnArgs): Promise<VersionedTransaction> {
    const ix = this.getBurnInstruction(args);
    const result = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      false
    );
    return result as VersionedTransaction;
  }

  async buildPauseTransaction(): Promise<VersionedTransaction> {
    const ix = this.getPauseInstruction();
    const result = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      false
    );
    return result as VersionedTransaction;
  }

  async buildUnpauseTransaction(): Promise<VersionedTransaction> {
    const ix = this.getUnpauseInstruction();
    const result = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      false
    );
    return result as VersionedTransaction;
  }

  async buildFreezeAccountTransaction(account: PublicKey): Promise<VersionedTransaction> {
    const ix = this.getFreezeAccountInstruction(account);
    const result = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      false
    );
    return result as VersionedTransaction;
  }

  async buildThawAccountTransaction(account: PublicKey): Promise<VersionedTransaction> {
    const ix = this.getThawAccountInstruction(account);
    const result = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      false
    );
    return result as VersionedTransaction;
  }

  async buildBlacklistAddTransaction(
    wallet: PublicKey,
    reason: string
  ): Promise<VersionedTransaction> {
    const ix = this.getAddToBlacklistInstruction(wallet, reason);
    const result = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      false
    );
    return result as VersionedTransaction;
  }

  async buildBlacklistRemoveTransaction(wallet: PublicKey): Promise<VersionedTransaction> {
    const ix = this.getRemoveFromBlacklistInstruction(wallet);
    const result = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      false
    );
    return result as VersionedTransaction;
  }

  async buildSeizeTransaction(args: SeizeArgs): Promise<VersionedTransaction> {
    const ix = this.getSeizeInstruction(args);
    const result = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      false
    );
    return result as VersionedTransaction;
  }

  async buildTransferAuthorityTransaction(
    newAuthority: PublicKey
  ): Promise<VersionedTransaction> {
    const ix = this.getTransferAuthorityInstruction(newAuthority);
    const result = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      false
    );
    return result as VersionedTransaction;
  }

  async buildUpdateRolesTransaction(args: UpdateRolesArgs): Promise<VersionedTransaction> {
    const ix = this.getUpdateRolesInstruction(args);
    const result = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      false
    );
    return result as VersionedTransaction;
  }

  async buildUpdateMinterTransaction(
    args: UpdateMinterArgs
  ): Promise<VersionedTransaction> {
    const ix = this.getUpdateMinterInstruction(args);
    const result = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      false
    );
    return result as VersionedTransaction;
  }

  async buildTransferTransaction(args: TransferArgs): Promise<VersionedTransaction> {
    const ix = await this.getTransferInstruction(args);
    const result = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      false
    );
    return result as VersionedTransaction;
  }

  // ─── Send (build + sign + send) ────────────────────────────────────────────

  async mint(args: MintArgs): Promise<string> {
    const ix = this.getMintInstruction(args);
    const sig = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      true
    );
    if (typeof sig !== "string") throw new Error("Expected signature");
    return sig;
  }

  async burn(args: BurnArgs): Promise<string> {
    const ix = this.getBurnInstruction(args);
    const sig = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      true
    );
    if (typeof sig !== "string") throw new Error("Expected signature");
    return sig;
  }

  async pause(): Promise<string> {
    const ix = this.getPauseInstruction();
    const sig = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      true
    );
    if (typeof sig !== "string") throw new Error("Expected signature");
    return sig;
  }

  async unpause(): Promise<string> {
    const ix = this.getUnpauseInstruction();
    const sig = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      true
    );
    if (typeof sig !== "string") throw new Error("Expected signature");
    return sig;
  }

  async transferAuthority(newAuthority: PublicKey): Promise<string> {
    const ix = this.getTransferAuthorityInstruction(newAuthority);
    const sig = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      true
    );
    if (typeof sig !== "string") throw new Error("Expected signature");
    return sig;
  }

  async updateRoles(args: UpdateRolesArgs): Promise<string> {
    const ix = this.getUpdateRolesInstruction(args);
    const sig = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      true
    );
    if (typeof sig !== "string") throw new Error("Expected signature");
    return sig;
  }

  async updateMinter(args: UpdateMinterArgs): Promise<string> {
    const ix = this.getUpdateMinterInstruction(args);
    const sig = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      true
    );
    if (typeof sig !== "string") throw new Error("Expected signature");
    return sig;
  }

  async transfer(args: TransferArgs): Promise<string> {
    const ix = await this.getTransferInstruction(args);
    const sig = await buildAndSignTransaction(
      this.client.connection,
      this.client.wallet,
      [ix],
      true
    );
    if (typeof sig !== "string") throw new Error("Expected signature");
    return sig;
  }
}
