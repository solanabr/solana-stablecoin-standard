import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  findHookConfigPda,
  findBlacklistPda,
  findExtraAccountMetaListPda,
  SSS1_PROGRAM_ID,
} from "./pda";
import { HookConfig, BlacklistEntry } from "./types";

export class SSSHook {
  constructor(
    private program: Program,
    private programId: PublicKey = SSS1_PROGRAM_ID
  ) {}

  async initialize(mint: PublicKey, authority: PublicKey): Promise<{ hookConfigPda: PublicKey; tx: string }> {
    const [hookConfigPda] = findHookConfigPda(mint, this.programId);

    const tx = await this.program.methods
      .initializeHookModule()
      .accounts({
        authority,
        hookConfig: hookConfigPda,
        mint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { hookConfigPda, tx };
  }

  async addToBlacklist(mint: PublicKey, address: PublicKey, authority: PublicKey): Promise<string> {
    const [hookConfigPda] = findHookConfigPda(mint, this.programId);
    const [blacklistPda] = findBlacklistPda(hookConfigPda, address, this.programId);

    return this.program.methods
      .addToBlacklist()
      .accounts({
        authority,
        hookConfig: hookConfigPda,
        blacklist: blacklistPda,
        address,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async initializeExtraAccountMetaList(mint: PublicKey, authority: PublicKey): Promise<string> {
    const [hookConfigPda] = findHookConfigPda(mint, this.programId);
    const [extraAccountMetaList] = findExtraAccountMetaListPda(mint, this.programId);

    return this.program.methods
      .initializeExtraAccountMetaList()
      .accounts({
        authority,
        extraAccountMetaList,
        mint,
        hookConfig: hookConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async removeFromBlacklist(mint: PublicKey, address: PublicKey, authority: PublicKey): Promise<string> {
    const [hookConfigPda] = findHookConfigPda(mint, this.programId);
    const [blacklistPda] = findBlacklistPda(hookConfigPda, address, this.programId);

    return this.program.methods
      .removeFromBlacklist()
      .accounts({
        authority,
        hookConfig: hookConfigPda,
        address,
        blacklist: blacklistPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async setComplianceMode(mint: PublicKey, authority: PublicKey, enabled: boolean): Promise<string> {
    const [hookConfigPda] = findHookConfigPda(mint, this.programId);
    return this.program.methods
      .setComplianceMode(enabled)
      .accounts({
        authority,
        hookConfig: hookConfigPda,
      })
      .rpc();
  }

  async transferAuthority(mint: PublicKey, authority: PublicKey, newAuthority: PublicKey): Promise<string> {
    const [hookConfigPda] = findHookConfigPda(mint, this.programId);
    return this.program.methods
      .transferHookAuthority()
      .accounts({
        authority,
        hookConfig: hookConfigPda,
        newAuthority,
      })
      .rpc();
  }

  async isBlacklisted(mint: PublicKey, address: PublicKey): Promise<boolean> {
    const [hookConfigPda] = findHookConfigPda(mint, this.programId);
    const [blacklistPda] = findBlacklistPda(hookConfigPda, address, this.programId);
    const accountClient = this.program.account as any;
    try {
      await accountClient.blacklist.fetch(blacklistPda);
      return true;
    } catch {
      return false;
    }
  }

  async getHookConfig(mint: PublicKey): Promise<HookConfig> {
    const [hookConfigPda] = findHookConfigPda(mint, this.programId);
    const accountClient = this.program.account as any;
    return accountClient.hookConfig.fetch(hookConfigPda) as Promise<HookConfig>;
  }
}
