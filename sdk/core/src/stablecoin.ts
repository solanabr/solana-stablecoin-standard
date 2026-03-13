import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import {
  findBlacklistPda,
  findConfigPda,
  findExtraAccountMetaListPda,
  findHookConfigPda,
  findRolePda,
  SSS1_PROGRAM_ID,
} from "./pda";
import { InitializeParams, RoleType, StablecoinConfig, Role, HookConfig } from "./types";

export class SSSStablecoin {
  constructor(
    private program: Program,
    private programId: PublicKey = SSS1_PROGRAM_ID
  ) {}

  async initialize(params: InitializeParams, admin: PublicKey): Promise<{ mint: Keypair; configPda: PublicKey; tx: string }> {
    const mint = Keypair.generate();
    const [configPda] = findConfigPda(mint.publicKey, this.programId);

    const tx = await this.program.methods
      .initialize(params.name, params.symbol, params.uri, params.decimals, params.rolesEnabled, params.freezeEnabled)
      .accounts({
        admin,
        config: configPda,
        mint: mint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();

    return { mint, configPda, tx };
  }

  async grantRole(mint: PublicKey, authority: PublicKey, roleType: RoleType, admin: PublicKey): Promise<string> {
    const [configPda] = findConfigPda(mint, this.programId);
    const [rolePda] = findRolePda(configPda, authority, roleType, this.programId);

    return this.program.methods
      .grantRole(roleType)
      .accounts({
        admin,
        config: configPda,
        authority,
        role: rolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async revokeRole(mint: PublicKey, authority: PublicKey, roleType: RoleType, admin: PublicKey): Promise<string> {
    const [configPda] = findConfigPda(mint, this.programId);
    const [rolePda] = findRolePda(configPda, authority, roleType, this.programId);

    return this.program.methods
      .revokeRole()
      .accounts({
        admin,
        config: configPda,
        authority,
        role: rolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async mintTokens(mint: PublicKey, destination: PublicKey, amount: BN, minter: PublicKey): Promise<string> {
    const [configPda] = findConfigPda(mint, this.programId);
    const [rolePda] = findRolePda(configPda, minter, RoleType.Minter, this.programId);

    return this.program.methods
      .mintTokens(amount)
      .accounts({
        minter,
        config: configPda,
        role: rolePda,
        mint,
        destination,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  async burnTokens(mint: PublicKey, source: PublicKey, amount: BN, burner: PublicKey): Promise<string> {
    const [configPda] = findConfigPda(mint, this.programId);
    const [rolePda] = findRolePda(configPda, burner, RoleType.Burner, this.programId);

    return this.program.methods
      .burnTokens(amount)
      .accounts({
        burner,
        config: configPda,
        role: rolePda,
        mint,
        source,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  async freezeAccount(mint: PublicKey, tokenAccount: PublicKey, freezer: PublicKey): Promise<string> {
    const [configPda] = findConfigPda(mint, this.programId);
    const [rolePda] = findRolePda(configPda, freezer, RoleType.Freezer, this.programId);

    return this.program.methods
      .freezeAccount()
      .accounts({
        freezer,
        config: configPda,
        role: rolePda,
        mint,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  async unfreezeAccount(mint: PublicKey, tokenAccount: PublicKey, freezer: PublicKey): Promise<string> {
    const [configPda] = findConfigPda(mint, this.programId);
    const [rolePda] = findRolePda(configPda, freezer, RoleType.Freezer, this.programId);

    return this.program.methods
      .unfreezeAccount()
      .accounts({
        freezer,
        config: configPda,
        role: rolePda,
        mint,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  async updateMetadata(mint: PublicKey, field: string, value: string, admin: PublicKey): Promise<string> {
    const [configPda] = findConfigPda(mint, this.programId);

    return this.program.methods
      .updateMetadata(field, value)
      .accounts({
        admin,
        config: configPda,
        mint,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  async pause(mint: PublicKey, admin: PublicKey): Promise<string> {
    const [configPda] = findConfigPda(mint, this.programId);
    return this.program.methods
      .pause()
      .accounts({
        admin,
        config: configPda,
      })
      .rpc();
  }

  async unpause(mint: PublicKey, admin: PublicKey): Promise<string> {
    const [configPda] = findConfigPda(mint, this.programId);
    return this.program.methods
      .unpause()
      .accounts({
        admin,
        config: configPda,
      })
      .rpc();
  }

  async transferAdmin(mint: PublicKey, admin: PublicKey, newAdmin: PublicKey): Promise<string> {
    const [configPda] = findConfigPda(mint, this.programId);
    return this.program.methods
      .transferAdmin()
      .accounts({
        admin,
        config: configPda,
        newAdmin,
      })
      .rpc();
  }

  async updateMinter(
    mint: PublicKey,
    admin: PublicKey,
    oldMinter: PublicKey,
    newMinter: PublicKey
  ): Promise<{ grantTx: string; revokeTx: string }> {
    const [configPda] = findConfigPda(mint, this.programId);
    const [newRolePda] = findRolePda(configPda, newMinter, RoleType.Minter, this.programId);
    const [oldRolePda] = findRolePda(configPda, oldMinter, RoleType.Minter, this.programId);

    const grantTx = await this.program.methods
      .grantRole(RoleType.Minter)
      .accounts({
        admin,
        config: configPda,
        authority: newMinter,
        role: newRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const revokeTx = await this.program.methods
      .revokeRole()
      .accounts({
        admin,
        config: configPda,
        authority: oldMinter,
        role: oldRolePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { grantTx, revokeTx };
  }

  async seizeTokens(
    mint: PublicKey,
    from: PublicKey,
    to: PublicKey,
    amount: BN,
    admin: PublicKey
  ): Promise<string> {
    const [configPda] = findConfigPda(mint, this.programId);
    return this.program.methods
      .seizeTokens(amount)
      .accounts({
        admin,
        config: configPda,
        mint,
        from,
        to,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  async getConfig(mint: PublicKey): Promise<StablecoinConfig> {
    const [configPda] = findConfigPda(mint, this.programId);
    const accountClient = this.program.account as any;
    return accountClient.stablecoinConfig.fetch(configPda) as Promise<StablecoinConfig>;
  }

  async getRole(config: PublicKey, authority: PublicKey, roleType: RoleType): Promise<Role | null> {
    const [rolePda] = findRolePda(config, authority, roleType, this.programId);
    const accountClient = this.program.account as any;
    try {
      return await accountClient.role.fetch(rolePda) as unknown as Role;
    } catch {
      return null;
    }
  }

  async initializeHookModule(mint: PublicKey, authority: PublicKey): Promise<{ hookConfigPda: PublicKey; tx: string }> {
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

  async transferHookAuthority(mint: PublicKey, authority: PublicKey, newAuthority: PublicKey): Promise<string> {
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
