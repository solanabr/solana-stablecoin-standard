import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  createTransferCheckedWithTransferHookInstruction,
} from "@solana/spl-token";

import { Preset, StablecoinConfig, resolvePreset } from "./presets";
import {
  findStatePDA,
  findMintAuthorityPDA,
  findFreezeAuthorityPDA,
  findPermanentDelegatePDA,
  findMinterInfoPDA,
  findExtraAccountMetaListPDA,
  findHookStatePDA,
  TRANSFER_HOOK_PROGRAM_ID,
  createMintWithExtensions,
  getOrCreateTokenAccount,
} from "./utils";
import SSS_TOKEN_IDL from "./idl/sss_token.json";
import TRANSFER_HOOK_IDL from "./idl/transfer_hook.json";
import { createAnchorWallet } from "./internal/createAnchorWallet";
import { ComplianceModule } from "./modules/compliance";
import type { CreateOptions, MintOptions, TransferOptions } from "./options";

export class SolanaStablecoin {
  readonly connection: Connection;
  readonly mint: PublicKey;
  readonly statePDA: PublicKey;
  readonly authority: Keypair;
  readonly config: StablecoinConfig;
  readonly compliance: ComplianceModule;

  private readonly program: Program;

  private constructor(
    connection: Connection,
    mint: PublicKey,
    statePDA: PublicKey,
    authority: Keypair,
    config: StablecoinConfig,
    program: Program,
  ) {
    this.connection = connection;
    this.mint = mint;
    this.statePDA = statePDA;
    this.authority = authority;
    this.config = config;
    this.program = program;
    this.compliance = new ComplianceModule(this, program);
  }

  static async create(options: CreateOptions): Promise<SolanaStablecoin> {
    const {
      preset,
      name,
      symbol,
      uri,
      decimals = 6,
      authority,
      extensions = {},
      connection,
    } = options;

    const cleanOverrides: Partial<StablecoinConfig> = {};
    if (extensions.permanentDelegate !== undefined) cleanOverrides.enablePermanentDelegate = extensions.permanentDelegate;
    if (extensions.transferHook !== undefined) cleanOverrides.enableTransferHook = extensions.transferHook;
    if (extensions.defaultAccountFrozen !== undefined) cleanOverrides.defaultAccountFrozen = extensions.defaultAccountFrozen;

    const presetConfig = preset
      ? resolvePreset(preset, cleanOverrides)
      : {
          enablePermanentDelegate: extensions.permanentDelegate ?? false,
          enableTransferHook: extensions.transferHook ?? false,
          defaultAccountFrozen: extensions.defaultAccountFrozen ?? false,
        };

    const config: StablecoinConfig = {
      name,
      symbol,
      uri,
      decimals,
      enablePermanentDelegate: presetConfig.enablePermanentDelegate ?? false,
      enableTransferHook: presetConfig.enableTransferHook ?? false,
      defaultAccountFrozen: presetConfig.defaultAccountFrozen ?? false,
      transferHookProgramId: presetConfig.enableTransferHook ? TRANSFER_HOOK_PROGRAM_ID : undefined,
    } as StablecoinConfig;

    const mintKeypair = options.mintKeypair ?? Keypair.generate();
    const [statePDA] = findStatePDA(mintKeypair.publicKey);
    const [mintAuthority] = findMintAuthorityPDA(statePDA);
    const [freezeAuthority] = findFreezeAuthorityPDA(statePDA);
    const [permanentDelegate] = findPermanentDelegatePDA(statePDA);

    await createMintWithExtensions({
      connection,
      payer: authority,
      mintKeypair,
      decimals,
      mintAuthority,
      freezeAuthority,
      enablePermanentDelegate: config.enablePermanentDelegate,
      permanentDelegateKey: config.enablePermanentDelegate ? permanentDelegate : undefined,
      enableTransferHook: config.enableTransferHook,
      transferHookProgramId: config.transferHookProgramId,
      defaultAccountFrozen: config.defaultAccountFrozen,
      metadataPointerAuthority: authority.publicKey,
      name,
      symbol,
      uri,
    });

    const provider = new AnchorProvider(connection, createAnchorWallet(authority), {});
    const idl = (options.idl ?? SSS_TOKEN_IDL) as Idl;
    const program = new Program(idl, provider);

    await program.methods
      .initialize({
        name,
        symbol,
        uri,
        decimals,
        enablePermanentDelegate: config.enablePermanentDelegate,
        enableTransferHook: config.enableTransferHook,
        defaultAccountFrozen: config.defaultAccountFrozen,
        transferHookProgramId: config.transferHookProgramId ?? null,
      })
      .accounts({
        masterAuthority: authority.publicKey,
        state: statePDA,
        mint: mintKeypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([authority, mintKeypair])
      .rpc();

    if (config.enableTransferHook) {
      const [extraAccountMetaList] = findExtraAccountMetaListPDA(mintKeypair.publicKey);
      const existing = await connection.getAccountInfo(extraAccountMetaList);
      if (!existing) {
        const hookIdl = (options.transferHookIdl ?? TRANSFER_HOOK_IDL) as Idl;
        const hookProgram = new Program(hookIdl, provider);
        const [hookState] = findHookStatePDA(mintKeypair.publicKey);

        await hookProgram.methods
          .initializeExtraAccountMetaList(statePDA)
          .accounts({
            payer: authority.publicKey,
            extraAccountMetaList,
            mint: mintKeypair.publicKey,
            hookState,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
      }
    }

    return new SolanaStablecoin(
      connection,
      mintKeypair.publicKey,
      statePDA,
      authority,
      config,
      program,
    );
  }

  static async load(
    connection: Connection,
    mint: PublicKey,
    authority: Keypair,
    idl?: Idl,
  ): Promise<SolanaStablecoin> {
    const [statePDA] = findStatePDA(mint);
    const provider = new AnchorProvider(connection, createAnchorWallet(authority), {});
    const resolvedIdl = (idl ?? SSS_TOKEN_IDL) as Idl;
    const program = new Program(resolvedIdl, provider);

    const state = await (program.account as any).stablecoinState.fetch(statePDA);

    const config: StablecoinConfig = {
      name: state.name,
      symbol: state.symbol,
      uri: state.uri,
      decimals: state.decimals,
      enablePermanentDelegate: state.permanentDelegateEnabled,
      enableTransferHook: state.transferHookEnabled,
      defaultAccountFrozen: state.defaultAccountFrozen,
      transferHookProgramId: state.transferHookProgramId ?? undefined,
    };

    return new SolanaStablecoin(connection, mint, statePDA, authority, config, program);
  }

  async initializeTransferHook(transferHookIdl?: Idl): Promise<string> {
    if (!this.config.enableTransferHook) {
      throw new Error("Transfer hook is not enabled on this stablecoin.");
    }

    const [extraAccountMetaList] = findExtraAccountMetaListPDA(this.mint);
    const existing = await this.connection.getAccountInfo(extraAccountMetaList);
    if (existing !== null) {
      throw new Error(
        `Transfer-hook is already initialized for this mint. extra-account-metas PDA: ${extraAccountMetaList.toBase58()}`,
      );
    }

    const provider = new AnchorProvider(this.connection, createAnchorWallet(this.authority), {});
    const hookIdl = (transferHookIdl ?? TRANSFER_HOOK_IDL) as Idl;
    const hookProgram = new Program(hookIdl, provider);
    const [hookState] = findHookStatePDA(this.mint);

    return hookProgram.methods
      .initializeExtraAccountMetaList(this.statePDA)
      .accounts({
        payer: this.authority.publicKey,
        extraAccountMetaList,
        mint: this.mint,
        hookState,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([this.authority])
      .rpc();
  }

  async mintTokens(options: MintOptions): Promise<string> {
    const { recipient, amount, minter } = options;
    const [minterInfoPDA] = findMinterInfoPDA(this.statePDA, minter.publicKey);
    const recipientAta = await getOrCreateTokenAccount(
      this.connection,
      this.authority,
      this.mint,
      recipient,
    );
    const [mintAuthority] = findMintAuthorityPDA(this.statePDA);

    return this.program.methods
      .mint(new BN(amount.toString()))
      .accounts({
        minter: minter.publicKey,
        state: this.statePDA,
        mint: this.mint,
        minterInfo: minterInfoPDA,
        recipientTokenAccount: recipientAta,
        mintAuthority,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
  }

  async transfer(options: TransferOptions): Promise<string> {
    const { from, to, amount, payer: payerOverride } = options;
    const payer = payerOverride ?? from;

    const destinationAta = await getOrCreateTokenAccount(
      this.connection,
      payer,
      this.mint,
      to,
    );

    const sourceAta = getAssociatedTokenAddressSync(
      this.mint,
      from.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    const amountBigInt = BigInt(amount.toString());

    if (this.config.enableTransferHook) {
      const instruction = await createTransferCheckedWithTransferHookInstruction(
        this.connection,
        sourceAta,
        this.mint,
        destinationAta,
        from.publicKey,
        amountBigInt,
        this.config.decimals,
        [],
        undefined,
        TOKEN_2022_PROGRAM_ID,
      );
      const tx = new Transaction().add(instruction);
      return sendAndConfirmTransaction(this.connection, tx, [payer, from]);
    }

    const instruction = createTransferCheckedInstruction(
      sourceAta,
      this.mint,
      destinationAta,
      from.publicKey,
      amountBigInt,
      this.config.decimals,
      [],
      TOKEN_2022_PROGRAM_ID,
    );
    const tx = new Transaction().add(instruction);
    return sendAndConfirmTransaction(this.connection, tx, [payer, from]);
  }

  async burn(from: PublicKey, amount: number | bigint): Promise<string> {
    const [permanentDelegate] = findPermanentDelegatePDA(this.statePDA);
    const fromAta = await getOrCreateTokenAccount(
      this.connection,
      this.authority,
      this.mint,
      from,
    );

    return this.program.methods
      .burn(new BN(amount.toString()))
      .accounts({
        authority: this.authority.publicKey,
        state: this.statePDA,
        mint: this.mint,
        fromTokenAccount: fromAta,
        permanentDelegate,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([this.authority])
      .rpc();
  }

  async freeze(account: PublicKey): Promise<string> {
    const [freezeAuthority] = findFreezeAuthorityPDA(this.statePDA);
    const ata = await getOrCreateTokenAccount(
      this.connection,
      this.authority,
      this.mint,
      account,
    );

    return this.program.methods
      .freezeAccount()
      .accounts({
        authority: this.authority.publicKey,
        state: this.statePDA,
        mint: this.mint,
        tokenAccount: ata,
        freezeAuthority,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([this.authority])
      .rpc();
  }

  async thaw(account: PublicKey): Promise<string> {
    const [freezeAuthority] = findFreezeAuthorityPDA(this.statePDA);
    const ata = await getOrCreateTokenAccount(
      this.connection,
      this.authority,
      this.mint,
      account,
    );

    return this.program.methods
      .thawAccount()
      .accounts({
        authority: this.authority.publicKey,
        state: this.statePDA,
        mint: this.mint,
        tokenAccount: ata,
        freezeAuthority,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([this.authority])
      .rpc();
  }

  async pause(): Promise<string> {
    return this.program.methods
      .pause()
      .accounts({ authority: this.authority.publicKey, state: this.statePDA })
      .signers([this.authority])
      .rpc();
  }

  async unpause(): Promise<string> {
    return this.program.methods
      .unpause()
      .accounts({ authority: this.authority.publicKey, state: this.statePDA })
      .signers([this.authority])
      .rpc();
  }

  async addMinter(minter: PublicKey, quota: number | bigint = 0): Promise<string> {
    const [minterInfo] = findMinterInfoPDA(this.statePDA, minter);

    return this.program.methods
      .addMinter(new BN(quota.toString()))
      .accounts({
        authority: this.authority.publicKey,
        state: this.statePDA,
        minter,
        minterInfo,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([this.authority])
      .rpc();
  }

  async increaseMinterQuota(minter: PublicKey, additionalQuota: number | bigint): Promise<string> {
    const [minterInfo] = findMinterInfoPDA(this.statePDA, minter);

    return this.program.methods
      .increaseMinterQuota(new BN(additionalQuota.toString()))
      .accounts({
        authority: this.authority.publicKey,
        state: this.statePDA,
        minter,
        minterInfo,
      })
      .signers([this.authority])
      .rpc();
  }

  async removeMinter(minter: PublicKey): Promise<string> {
    const [minterInfo] = findMinterInfoPDA(this.statePDA, minter);

    return this.program.methods
      .removeMinter()
      .accounts({
        authority: this.authority.publicKey,
        state: this.statePDA,
        minter,
        minterInfo,
      })
      .signers([this.authority])
      .rpc();
  }

  async updateRoles(roles: {
    pauser?: PublicKey | null;
    freezer?: PublicKey | null;
    burner?: PublicKey | null;
    blacklister?: PublicKey | null;
    seizer?: PublicKey | null;
  }): Promise<string> {
    return this.program.methods
      .updateRoles({
        pauser: roles.pauser === null ? PublicKey.default : roles.pauser ?? null,
        freezer: roles.freezer === null ? PublicKey.default : roles.freezer ?? null,
        burner: roles.burner === null ? PublicKey.default : roles.burner ?? null,
        blacklister: roles.blacklister === null ? PublicKey.default : roles.blacklister ?? null,
        seizer: roles.seizer === null ? PublicKey.default : roles.seizer ?? null,
      })
      .accounts({
        authority: this.authority.publicKey,
        state: this.statePDA,
      })
      .signers([this.authority])
      .rpc();
  }

  async setBurner(address: PublicKey): Promise<string> {
    return this.updateRoles({ burner: address });
  }

  async clearBurner(): Promise<string> {
    return this.updateRoles({ burner: null });
  }

  async setPauser(address: PublicKey): Promise<string> {
    return this.updateRoles({ pauser: address });
  }

  async clearPauser(): Promise<string> {
    return this.updateRoles({ pauser: null });
  }

  async setFreezer(address: PublicKey): Promise<string> {
    return this.updateRoles({ freezer: address });
  }

  async clearFreezer(): Promise<string> {
    return this.updateRoles({ freezer: null });
  }

  async setBlacklister(address: PublicKey): Promise<string> {
    return this.updateRoles({ blacklister: address });
  }

  async clearBlacklister(): Promise<string> {
    return this.updateRoles({ blacklister: null });
  }

  async setSeizer(address: PublicKey): Promise<string> {
    return this.updateRoles({ seizer: address });
  }

  async clearSeizer(): Promise<string> {
    return this.updateRoles({ seizer: null });
  }

  async getRoles(): Promise<{
    master: PublicKey;
    pauser?: PublicKey;
    burner?: PublicKey;
    freezer?: PublicKey;
    blacklister?: PublicKey;
    seizer?: PublicKey;
  }> {
    const state = await this.getState();
    return {
      master: state.masterAuthority,
      pauser: state.pauser ?? undefined,
      burner: state.burner ?? undefined,
      freezer: state.freezer ?? undefined,
      blacklister: state.blacklister ?? undefined,
      seizer: state.seizer ?? undefined,
    };
  }

  async proposeAuthority(newAuthority: PublicKey): Promise<string> {
    return this.program.methods
      .proposeAuthority()
      .accounts({
        currentAuthority: this.authority.publicKey,
        proposedAuthority: newAuthority,
        state: this.statePDA,
      })
      .signers([this.authority])
      .rpc();
  }

  async acceptAuthority(newAuthorityKeypair: Keypair): Promise<string> {
    return this.program.methods
      .acceptAuthority()
      .accounts({
        newAuthority: newAuthorityKeypair.publicKey,
        state: this.statePDA,
      })
      .signers([newAuthorityKeypair])
      .rpc();
  }

  async getState(): Promise<any> {
    return (this.program.account as any).stablecoinState.fetch(this.statePDA);
  }

  async getTotalSupply(): Promise<bigint> {
    const state = await this.getState();
    return BigInt(state.totalMinted.toString()) - BigInt(state.totalBurned.toString());
  }

  async getMintInfo(): Promise<any> {
    const { getMint } = await import("@solana/spl-token");
    const { TOKEN_2022_PROGRAM_ID: tokenProgramId } = await import("@solana/spl-token");
    return getMint(this.connection, this.mint, undefined, tokenProgramId);
  }

  async listMinters(): Promise<Array<{
    address: PublicKey;
    quota: bigint;
    mintedTotal: bigint;
    active: boolean;
  }>> {
    const accounts = await (this.program.account as any).minterInfo.all([
      { memcmp: { offset: 8, bytes: this.statePDA.toBase58() } },
    ]);
    return accounts.map((a: any) => ({
      address: a.account.minter,
      quota: BigInt(a.account.quota.toString()),
      mintedTotal: BigInt(a.account.mintedTotal.toString()),
      active: a.account.active,
    }));
  }

  async getHolders(minBalance: bigint = 0n): Promise<Array<{
    owner: PublicKey;
    balance: bigint;
  }>> {
    const { TOKEN_2022_PROGRAM_ID: tokenProgramId } = await import("@solana/spl-token");
    const accounts = await this.connection.getParsedProgramAccounts(tokenProgramId, {
      filters: [{ memcmp: { offset: 0, bytes: this.mint.toBase58() } }],
    });

    const holders: Array<{ owner: PublicKey; balance: bigint }> = [];
    for (const account of accounts) {
      const parsed = (account.account.data as any)?.parsed?.info;
      if (!parsed) continue;
      const balance = BigInt(parsed.tokenAmount?.amount ?? "0");
      if (balance >= minBalance) {
        holders.push({
          owner: new PublicKey(parsed.owner),
          balance,
        });
      }
    }

    return holders.sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
  }
}

export { Preset };
