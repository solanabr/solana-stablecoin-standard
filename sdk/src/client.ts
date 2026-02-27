import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  AnchorProvider,
  Program,
  Wallet,
  BN,
} from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction as createATAIx,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "./constants";
import {
  getConfigPda,
  getRoleRegistryPda,
  getMinterInfoPda,
  getBlacklistPda,
  getReserveAttestationPda,
  getExtraAccountMetaListPda,
} from "./pda";
import type {
  StablecoinConfig,
  RoleRegistry,
  MinterInfo,
  BlacklistEntry,
  ReserveAttestation,
  InitializeParams,
  UpdateRoleParams,
  UpdateMinterParams,
  BlacklistAddParams,
  AttestReserveParams,
} from "./types";
import { SSSError } from "./errors";

import sssTokenIdl from "./idl/sss_token.json";
import sssTransferHookIdl from "./idl/sss_transfer_hook.json";

export interface SSSClientOptions {
  tokenProgramId?: PublicKey;
  hookProgramId?: PublicKey;
  provider?: AnchorProvider;
}

export class SSSClient {
  readonly connection: Connection;
  readonly provider: AnchorProvider;
  readonly tokenProgram: Program;
  readonly hookProgram: Program;
  readonly tokenProgramId: PublicKey;
  readonly hookProgramId: PublicKey;

  constructor(
    connection: Connection,
    wallet: Wallet,
    options?: SSSClientOptions
  ) {
    this.connection = connection;
    this.tokenProgramId = options?.tokenProgramId ?? SSS_TOKEN_PROGRAM_ID;
    this.hookProgramId = options?.hookProgramId ?? SSS_TRANSFER_HOOK_PROGRAM_ID;
    this.provider = options?.provider ?? new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    this.tokenProgram = new Program(sssTokenIdl as any, this.provider);
    this.hookProgram = new Program(sssTransferHookIdl as any, this.provider);
  }

  // --- PDA Helpers ---

  getConfigPda(mint: PublicKey): [PublicKey, number] {
    return getConfigPda(mint, this.tokenProgramId);
  }

  getRoleRegistryPda(config: PublicKey): [PublicKey, number] {
    return getRoleRegistryPda(config, this.tokenProgramId);
  }

  getMinterInfoPda(config: PublicKey, minter: PublicKey): [PublicKey, number] {
    return getMinterInfoPda(config, minter, this.tokenProgramId);
  }

  getBlacklistPda(config: PublicKey, address: PublicKey): [PublicKey, number] {
    return getBlacklistPda(config, address, this.tokenProgramId);
  }

  getReserveAttestationPda(
    config: PublicKey,
    index: BN | number
  ): [PublicKey, number] {
    return getReserveAttestationPda(config, index, this.tokenProgramId);
  }

  getExtraAccountMetaListPda(mint: PublicKey): [PublicKey, number] {
    return getExtraAccountMetaListPda(mint, this.hookProgramId);
  }

  // --- Account Fetchers ---

  async fetchConfig(mint: PublicKey): Promise<StablecoinConfig> {
    const [configPda] = this.getConfigPda(mint);
    const accounts = this.tokenProgram.account as any;
    return (await accounts.stablecoinConfig.fetch(configPda)) as StablecoinConfig;
  }

  async fetchRoleRegistry(config: PublicKey): Promise<RoleRegistry> {
    const [rolesPda] = this.getRoleRegistryPda(config);
    const accounts = this.tokenProgram.account as any;
    return (await accounts.roleRegistry.fetch(rolesPda)) as RoleRegistry;
  }

  async fetchMinterInfo(
    config: PublicKey,
    minter: PublicKey
  ): Promise<MinterInfo> {
    const [minterPda] = this.getMinterInfoPda(config, minter);
    const accounts = this.tokenProgram.account as any;
    return (await accounts.minterInfo.fetch(minterPda)) as MinterInfo;
  }

  async fetchBlacklistEntry(
    config: PublicKey,
    address: PublicKey
  ): Promise<BlacklistEntry | null> {
    const [blacklistPda] = this.getBlacklistPda(config, address);
    try {
      const accounts = this.tokenProgram.account as any;
      return (await accounts.blacklistEntry.fetch(blacklistPda)) as BlacklistEntry;
    } catch {
      return null;
    }
  }

  async fetchReserveAttestation(
    config: PublicKey,
    index: BN | number
  ): Promise<ReserveAttestation> {
    const [attestPda] = this.getReserveAttestationPda(config, index);
    const accounts = this.tokenProgram.account as any;
    return (await accounts.reserveAttestation.fetch(attestPda)) as ReserveAttestation;
  }

  // --- Instructions ---

  async initialize(
    params: InitializeParams,
    mintKeypair: Keypair,
    hookProgramId?: PublicKey
  ): Promise<{ signature: string }> {
    const [configPda] = getConfigPda(mintKeypair.publicKey, this.tokenProgramId);
    const [roleRegistryPda] = getRoleRegistryPda(configPda, this.tokenProgramId);

    const remainingAccounts = hookProgramId
      ? [{ pubkey: hookProgramId, isSigner: false, isWritable: false }]
      : [];

    try {
      const signature = await this.tokenProgram.methods
        .initialize(params)
        .accounts({
          authority: this.provider.wallet.publicKey,
          mint: mintKeypair.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .remainingAccounts(remainingAccounts)
        .signers([mintKeypair])
        .rpc();

      return { signature };
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  async mintTokens(
    mint: PublicKey,
    amount: BN,
    recipientTokenAccount: PublicKey
  ): Promise<{ signature: string }> {
    const [configPda] = this.getConfigPda(mint);
    const [minterInfoPda] = this.getMinterInfoPda(
      configPda,
      this.provider.wallet.publicKey
    );

    try {
      const signature = await this.tokenProgram.methods
        .mintTokens(amount)
        .accounts({
          minterAuthority: this.provider.wallet.publicKey,
          config: configPda,
          minterInfo: minterInfoPda,
          mint,
          recipientTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      return { signature };
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  async burnTokens(
    mint: PublicKey,
    amount: BN,
    burnerTokenAccount: PublicKey
  ): Promise<{ signature: string }> {
    const [configPda] = this.getConfigPda(mint);

    try {
      const signature = await this.tokenProgram.methods
        .burnTokens(amount)
        .accounts({
          burner: this.provider.wallet.publicKey,
          config: configPda,
          mint,
          burnerTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      return { signature };
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  async freezeAccount(
    mint: PublicKey,
    targetTokenAccount: PublicKey
  ): Promise<{ signature: string }> {
    const [configPda] = this.getConfigPda(mint);
    const [roleRegistryPda] = this.getRoleRegistryPda(configPda);

    try {
      const signature = await this.tokenProgram.methods
        .freezeAccount()
        .accounts({
          authority: this.provider.wallet.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
          mint,
          targetTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      return { signature };
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  async thawAccount(
    mint: PublicKey,
    targetTokenAccount: PublicKey
  ): Promise<{ signature: string }> {
    const [configPda] = this.getConfigPda(mint);
    const [roleRegistryPda] = this.getRoleRegistryPda(configPda);

    try {
      const signature = await this.tokenProgram.methods
        .thawAccount()
        .accounts({
          authority: this.provider.wallet.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
          mint,
          targetTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      return { signature };
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  async pause(mint: PublicKey): Promise<{ signature: string }> {
    const [configPda] = this.getConfigPda(mint);
    const [roleRegistryPda] = this.getRoleRegistryPda(configPda);

    try {
      const signature = await this.tokenProgram.methods
        .pause()
        .accounts({
          authority: this.provider.wallet.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
        })
        .rpc();

      return { signature };
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  async unpause(mint: PublicKey): Promise<{ signature: string }> {
    const [configPda] = this.getConfigPda(mint);
    const [roleRegistryPda] = this.getRoleRegistryPda(configPda);

    try {
      const signature = await this.tokenProgram.methods
        .unpause()
        .accounts({
          authority: this.provider.wallet.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
        })
        .rpc();

      return { signature };
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  async updateRoles(
    mint: PublicKey,
    params: UpdateRoleParams
  ): Promise<{ signature: string }> {
    const [configPda] = this.getConfigPda(mint);
    const [roleRegistryPda] = this.getRoleRegistryPda(configPda);

    try {
      const signature = await this.tokenProgram.methods
        .updateRoles(params)
        .accounts({
          authority: this.provider.wallet.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
        })
        .rpc();

      return { signature };
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  async updateMinter(
    mint: PublicKey,
    minterWallet: PublicKey,
    params: UpdateMinterParams
  ): Promise<{ signature: string }> {
    const [configPda] = this.getConfigPda(mint);
    const [roleRegistryPda] = this.getRoleRegistryPda(configPda);
    const [minterInfoPda] = this.getMinterInfoPda(configPda, minterWallet);

    try {
      const signature = await this.tokenProgram.methods
        .updateMinter(params)
        .accounts({
          authority: this.provider.wallet.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
          minterInfo: minterInfoPda,
          minterWallet,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return { signature };
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  async transferAuthority(
    mint: PublicKey,
    newAuthority: PublicKey
  ): Promise<{ signature: string }> {
    const [configPda] = this.getConfigPda(mint);
    const [roleRegistryPda] = this.getRoleRegistryPda(configPda);

    try {
      const signature = await this.tokenProgram.methods
        .transferAuthority()
        .accounts({
          authority: this.provider.wallet.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
          newAuthority,
        })
        .rpc();

      return { signature };
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  async blacklistAdd(
    mint: PublicKey,
    address: PublicKey,
    targetTokenAccount: PublicKey,
    params: BlacklistAddParams
  ): Promise<{ signature: string }> {
    const [configPda] = this.getConfigPda(mint);
    const [roleRegistryPda] = this.getRoleRegistryPda(configPda);
    const [blacklistEntryPda] = this.getBlacklistPda(configPda, address);

    try {
      const signature = await this.tokenProgram.methods
        .blacklistAdd(params)
        .accounts({
          authority: this.provider.wallet.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
          blacklistEntry: blacklistEntryPda,
          addressToBlacklist: address,
          mint,
          targetTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return { signature };
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  async blacklistRemove(
    mint: PublicKey,
    address: PublicKey,
    targetTokenAccount: PublicKey
  ): Promise<{ signature: string }> {
    const [configPda] = this.getConfigPda(mint);
    const [roleRegistryPda] = this.getRoleRegistryPda(configPda);
    const [blacklistEntryPda] = this.getBlacklistPda(configPda, address);

    try {
      const signature = await this.tokenProgram.methods
        .blacklistRemove()
        .accounts({
          authority: this.provider.wallet.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
          blacklistEntry: blacklistEntryPda,
          mint,
          targetTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      return { signature };
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  async seize(
    mint: PublicKey,
    blacklistedAddress: PublicKey,
    fromTokenAccount: PublicKey,
    toTokenAccount: PublicKey,
    amount: BN
  ): Promise<{ signature: string }> {
    const [configPda] = this.getConfigPda(mint);
    const [roleRegistryPda] = this.getRoleRegistryPda(configPda);
    const [blacklistEntryPda] = this.getBlacklistPda(
      configPda,
      blacklistedAddress
    );

    try {
      const signature = await this.tokenProgram.methods
        .seize(amount)
        .accounts({
          authority: this.provider.wallet.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
          blacklistEntry: blacklistEntryPda,
          mint,
          fromTokenAccount,
          toTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      return { signature };
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  async attestReserve(
    mint: PublicKey,
    params: AttestReserveParams
  ): Promise<{ signature: string }> {
    const [configPda] = this.getConfigPda(mint);
    const config = await this.fetchConfig(mint);
    const [roleRegistryPda] = this.getRoleRegistryPda(configPda);
    const [attestationPda] = this.getReserveAttestationPda(
      configPda,
      config.reserveAttestationIndex
    );

    try {
      const signature = await this.tokenProgram.methods
        .attestReserve(params)
        .accounts({
          authority: this.provider.wallet.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
          attestation: attestationPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return { signature };
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  async initializeExtraAccountMetaList(
    mint: PublicKey
  ): Promise<{ signature: string }> {
    const [extraAccountMetaListPda] = this.getExtraAccountMetaListPda(mint);
    const [configPda] = this.getConfigPda(mint);

    try {
      const signature = await this.hookProgram.methods
        .initializeExtraAccountMetaList()
        .accounts({
          payer: this.provider.wallet.publicKey,
          authority: this.provider.wallet.publicKey,
          extraAccountMetaList: extraAccountMetaListPda,
          mint,
          config: configPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return { signature };
    } catch (err) {
      throw this.wrapError(err);
    }
  }

  // --- Utilities ---

  getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022_PROGRAM_ID);
  }

  createAssociatedTokenAccountInstruction(
    payer: PublicKey,
    mint: PublicKey,
    owner: PublicKey
  ) {
    return createATAIx(payer, this.getAssociatedTokenAddress(mint, owner), owner, mint, TOKEN_2022_PROGRAM_ID);
  }

  // --- Private Helpers ---

  private wrapError(err: any): Error {
    const sssErr = SSSError.fromAnchorError(err);
    if (sssErr) return sssErr;
    return err instanceof Error ? err : new Error(String(err));
  }
}
