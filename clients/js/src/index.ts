import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

import {
  Presets,
  CreateStablecoinParams,
  CreateStablecoinResult,
  MintParams,
  BurnParams,
  TransferParams,
  StablecoinConfigData,
} from "./types";
import {
  STABLECOIN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  deriveConfigPda,
  deriveMintAuthorityPda,
  deriveMinterPda,
  deriveBlacklistPda,
  deriveRolePda,
  deriveExtraAccountMetaListPda,
} from "./pda";
import { createStablecoin } from "./actions/createStablecoin";
import { mintTokens } from "./actions/mint";
import { burnTokens } from "./actions/burn";
import { blacklistAdd, blacklistRemove, isBlacklisted } from "./actions/blacklist";
import { seize } from "./actions/seize";
import { freezeAccount, thawAccount } from "./actions/freeze";
import { pause, unpause } from "./actions/pause";
import {
  assignRole,
  revokeRole,
  addMinter,
  removeMinter,
  updateMinterAllowance,
  RoleType,
} from "./actions/roles";
import { transfer } from "./actions/transfer";

export class SolanaStablecoin {
  public readonly program: anchor.Program;
  public readonly mint: PublicKey;
  public readonly configPda: PublicKey;
  public readonly mintAuthority: PublicKey;
  public readonly compliance: ComplianceAPI;

  private config: StablecoinConfigData | null = null;

  private constructor(
    program: anchor.Program,
    mint: PublicKey,
    configPda: PublicKey,
    mintAuthority: PublicKey
  ) {
    this.program = program;
    this.mint = mint;
    this.configPda = configPda;
    this.mintAuthority = mintAuthority;
    this.compliance = new ComplianceAPI(this);
  }

  static async create(
    program: anchor.Program,
    params: CreateStablecoinParams
  ): Promise<{ stablecoin: SolanaStablecoin; result: CreateStablecoinResult }> {
    const result = await createStablecoin(program, params);
    const stablecoin = new SolanaStablecoin(
      program,
      result.mint,
      result.configPda,
      result.mintAuthority
    );
    return { stablecoin, result };
  }

  static async load(
    program: anchor.Program,
    mint: PublicKey
  ): Promise<SolanaStablecoin> {
    const [configPda] = deriveConfigPda(mint);
    const [mintAuthority] = deriveMintAuthorityPda(mint);
    const stablecoin = new SolanaStablecoin(program, mint, configPda, mintAuthority);
    await stablecoin.getConfig(); // validate it exists
    return stablecoin;
  }

  async getConfig(): Promise<StablecoinConfigData> {
    const raw = await (this.program.account as any).stablecoinConfig.fetch(
      this.configPda
    );
    this.config = {
      mint: raw.mint,
      preset: Object.keys(raw.preset)[0],
      name: raw.name,
      symbol: raw.symbol,
      uri: raw.uri,
      decimals: raw.decimals,
      owner: raw.owner,
      pendingOwner: raw.pendingOwner ?? null,
      masterMinter: raw.masterMinter,
      pauser: raw.pauser,
      blacklister: raw.blacklister,
      isPaused: raw.isPaused,
      totalMinted: BigInt(raw.totalMinted.toString()),
      totalBurned: BigInt(raw.totalBurned.toString()),
      enableTransferHook: raw.enableTransferHook,
      enablePermanentDelegate: raw.enablePermanentDelegate,
      enableConfidentialTransfers: raw.enableConfidentialTransfers,
      defaultAccountFrozen: raw.defaultAccountFrozen,
    };
    return this.config;
  }

  async getTotalSupply(): Promise<bigint> {
    const cfg = await this.getConfig();
    return cfg.totalMinted - cfg.totalBurned;
  }

  async mintTo(params: MintParams): Promise<string> {
    return mintTokens(this.program, this.mint, params);
  }

  async burnFrom(params: BurnParams): Promise<string> {
    return burnTokens(this.program, this.mint, params);
  }

  async freeze(targetWallet: PublicKey, authority: Keypair): Promise<string> {
    return freezeAccount(this.program, this.mint, targetWallet, authority);
  }

  async thaw(targetWallet: PublicKey, authority: Keypair): Promise<string> {
    return thawAccount(this.program, this.mint, targetWallet, authority);
  }

  async pause(pauser: Keypair): Promise<string> {
    return pause(this.program, this.mint, pauser);
  }

  async unpause(pauser: Keypair): Promise<string> {
    return unpause(this.program, this.mint, pauser);
  }

  async transfer(params: TransferParams): Promise<string> {
    const cfg = this.config ?? (await this.getConfig());
    return transfer(
      this.program,
      this.mint,
      params,
      cfg.decimals,
      cfg.enableTransferHook
    );
  }

  async addMinter(minter: PublicKey, allowance: bigint, masterMinter: Keypair): Promise<string> {
    return addMinter(this.program, this.mint, minter, allowance, masterMinter);
  }

  async removeMinter(minter: PublicKey, masterMinter: Keypair): Promise<string> {
    return removeMinter(this.program, this.mint, minter, masterMinter);
  }

  async updateMinterAllowance(
    minter: PublicKey,
    newAllowance: bigint,
    masterMinter: Keypair
  ): Promise<string> {
    return updateMinterAllowance(
      this.program,
      this.mint,
      minter,
      newAllowance,
      masterMinter
    );
  }

  async assignRole(role: RoleType, assignee: PublicKey, authority: Keypair): Promise<string> {
    return assignRole(this.program, this.mint, role, assignee, authority);
  }

  async revokeRole(role: RoleType, assignee: PublicKey, authority: Keypair): Promise<string> {
    return revokeRole(this.program, this.mint, role, assignee, authority);
  }

  async transferOwnership(newOwner: PublicKey, owner: Keypair): Promise<string> {
    return this.program.methods
      .transferOwnership(newOwner)
      .accounts({ owner: owner.publicKey, config: this.configPda })
      .signers([owner])
      .rpc();
  }

  async acceptOwnership(newOwner: Keypair): Promise<string> {
    return this.program.methods
      .acceptOwnership()
      .accounts({ newOwner: newOwner.publicKey, config: this.configPda })
      .signers([newOwner])
      .rpc();
  }
}

class ComplianceAPI {
  constructor(private readonly stablecoin: SolanaStablecoin) {}

  async blacklistAdd(
    wallet: PublicKey,
    reason: string,
    blacklister: Keypair
  ): Promise<string> {
    return blacklistAdd(
      this.stablecoin.program,
      this.stablecoin.mint,
      wallet,
      reason,
      blacklister
    );
  }

  async blacklistRemove(wallet: PublicKey, blacklister: Keypair): Promise<string> {
    return blacklistRemove(
      this.stablecoin.program,
      this.stablecoin.mint,
      wallet,
      blacklister
    );
  }

  async isBlacklisted(wallet: PublicKey): Promise<boolean> {
    return isBlacklisted(this.stablecoin.program, this.stablecoin.mint, wallet);
  }

  async seize(
    targetWallet: PublicKey,
    treasuryOwner: PublicKey,
    amount: bigint,
    owner: Keypair
  ): Promise<string> {
    const cfg = await this.stablecoin.getConfig();
    return seize(
      this.stablecoin.program,
      this.stablecoin.mint,
      targetWallet,
      treasuryOwner,
      amount,
      owner,
      cfg.enableTransferHook
    );
  }
}

// Re-export everything
export { Presets } from "./types";
export type {
  CreateStablecoinParams,
  CreateStablecoinResult,
  MintParams,
  BurnParams,
  TransferParams,
  StablecoinConfigData,
} from "./types";
export type { RoleType } from "./actions/roles";
export {
  STABLECOIN_PROGRAM_ID,
  TRANSFER_HOOK_PROGRAM_ID,
  deriveConfigPda,
  deriveMintAuthorityPda,
  deriveMinterPda,
  deriveBlacklistPda,
  deriveRolePda,
  deriveExtraAccountMetaListPda,
} from "./pda";
export { PRESET_CONFIGS, getPresetAnchorEnum } from "./presets";
