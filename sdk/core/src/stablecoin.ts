import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import idl from "./idl/solana_stablecoin_standard.json";
import hookIdl from "./idl/sss_transfer_hook.json";
import {
  SSS_TOKEN_PROGRAM_ID,
  SSS_HOOK_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "./constants";
import {
  findStablecoinPDA,
  findRolePDA,
  findMinterPDA,
  findBlacklistPDA,
  findExtraAccountMetasPDA,
  findSupplyCapPDA,
} from "./pda";
import type { MintParams, BurnParams, UpdateRolesParams, UpdateMinterParams } from "./types";
import { normalizeInitializeParams, type CreateStablecoinParams } from "./types";
import { ComplianceNotEnabledError } from "./errors";

const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

type SSSIDL = typeof idl;
type SSSProgram = Program;

export interface StablecoinState {
  authority: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enable_permanent_delegate: boolean;
  enable_transfer_hook: boolean;
  default_account_frozen: boolean;
  paused: boolean;
  total_minted: BN;
  total_burned: BN;
  bump: number;
}

export function toStablecoinState(raw: unknown): StablecoinState {
  const r = raw as Record<string, unknown>;
  const toBN = (v: unknown): BN => {
    if (v == null) return new BN(0);
    if (BN.isBN(v)) return v as BN;
    if (typeof v === "bigint") return new BN(v.toString());
    if (typeof v === "number") return new BN(v);
    return new BN(String(v));
  };
  const totalMinted = r.total_minted ?? r.totalMinted;
  const totalBurned = r.total_burned ?? r.totalBurned;
  return {
    authority: new PublicKey(r.authority as string),
    mint: new PublicKey(r.mint as string),
    name: (r.name as string) ?? "",
    symbol: (r.symbol as string) ?? "",
    uri: (r.uri as string) ?? "",
    decimals: (r.decimals as number) ?? 0,
    enable_permanent_delegate: (r.enable_permanent_delegate ?? r.enablePermanentDelegate) as boolean,
    enable_transfer_hook: (r.enable_transfer_hook ?? r.enableTransferHook) as boolean,
    default_account_frozen: (r.default_account_frozen ?? r.defaultAccountFrozen) as boolean,
    paused: (r.paused as boolean) ?? false,
    total_minted: toBN(totalMinted),
    total_burned: toBN(totalBurned),
    bump: (r.bump as number) ?? 0,
  };
}

export class SolanaStablecoin {
  readonly program: SSSProgram;
  readonly provider: AnchorProvider;
  readonly mintAddress: PublicKey;
  readonly stablecoin: PublicKey;
  readonly stablecoinBump: number;

  private _state: StablecoinState | null = null;

  private constructor(
    program: SSSProgram,
    provider: AnchorProvider,
    mintAddress: PublicKey,
    stablecoin: PublicKey,
    stablecoinBump: number
  ) {
    this.program = program;
    this.provider = provider;
    this.mintAddress = mintAddress;
    this.stablecoin = stablecoin;
    this.stablecoinBump = stablecoinBump;
  }

  static async load(
    program: SSSProgram,
    mint: PublicKey
  ): Promise<SolanaStablecoin> {
    const [stablecoin, bump] = findStablecoinPDA(mint, program.programId);
    const instance = new SolanaStablecoin(
      program,
      program.provider as AnchorProvider,
      mint,
      stablecoin,
      bump
    );
    await instance.refresh();
    return instance;
  }

  /**
   * Load a stablecoin by mint using only a connection. Builds a provider from the given signer
   * or from KEYPAIR_PATH env (if set). Use when you do not already have a Program instance.
   */
  static async loadFromConnection(
    connection: Connection,
    mint: PublicKey,
    signer?: Keypair
  ): Promise<SolanaStablecoin> {
    let keypair: Keypair;
    if (signer) {
      keypair = signer;
    } else {
      const keypairPath =
        process.env.KEYPAIR_PATH ||
        `${process.env.HOME ?? process.env.USERPROFILE ?? ""}/.config/solana/id.json`;
      const { readFileSync } = await import("fs");
      const secret = JSON.parse(readFileSync(keypairPath, "utf-8")) as number[];
      keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
    }
    const { AnchorProvider, Wallet } = await import("@coral-xyz/anchor");
    const provider = new AnchorProvider(connection, new Wallet(keypair), {});
    const program = new Program(idl as unknown as Idl, provider) as SSSProgram;
    return SolanaStablecoin.load(program, mint);
  }

  static async create(
    programOrConnection: SSSProgram | Connection,
    params: CreateStablecoinParams,
    signer?: Keypair
  ): Promise<SolanaStablecoin> {
    let program: SSSProgram;
    let provider: AnchorProvider;
    let authority: PublicKey;

    if ("provider" in programOrConnection) {
      program = programOrConnection;
      provider = program.provider as AnchorProvider;
      authority = provider.wallet.publicKey;
    } else {
      if (!signer) {
        throw new Error(
          "SolanaStablecoin.create with Connection requires a signer (authority) keypair."
        );
      }
      const { AnchorProvider, Wallet } = await import("@coral-xyz/anchor");
      provider = new AnchorProvider(programOrConnection, new Wallet(signer), {});
      program = new Program(idl as unknown as Idl, provider) as SSSProgram;
      authority = signer.publicKey;
    }

    const initParams = normalizeInitializeParams(params);
    const mintKeypair = Keypair.generate();
    const mintPk = mintKeypair.publicKey;
    const [stablecoinPda] = findStablecoinPDA(mintPk, program.programId);
    const [authorityRolePda] = findRolePDA(stablecoinPda, authority, program.programId);

    const initArgs = {
      name: initParams.name,
      symbol: initParams.symbol,
      uri: initParams.uri,
      decimals: initParams.decimals,
      enablePermanentDelegate: initParams.enable_permanent_delegate,
      enableTransferHook: initParams.enable_transfer_hook,
      defaultAccountFrozen: initParams.default_account_frozen,
    };

    const connection = provider.connection;
    let initSig: string;
    try {
      initSig = await (program.methods as unknown as { initializeStablecoin: (p: typeof initArgs) => { accountsStrict: (a: object) => { signers: (s: Keypair[]) => { rpc: () => Promise<string> } } } })
        .initializeStablecoin(initArgs)
        .accountsStrict({
          authority,
          stablecoin: stablecoinPda,
          mint: mintPk,
          authorityRole: authorityRolePda,
          transferHookProgram: SSS_HOOK_PROGRAM_ID,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        })
        .signers([mintKeypair])
        .rpc();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Initialize stablecoin failed: ${msg}. Check RPC cluster (devnet/mainnet), program deployment, and signer balance.`
      );
    }

    const commitment = "confirmed";
    for (let i = 0; i < 25; i++) {
      const info = await connection.getAccountInfo(stablecoinPda, { commitment });
      if (info?.data) break;
      if (i === 24) {
        throw new Error(
          `Stablecoin PDA not found after init (tx: ${initSig}). Init may have failed on-chain or RPC is lagging. Check explorer for tx.`
        );
      }
      await new Promise((r) => setTimeout(r, 1200));
    }

    const isSSS2 =
      initParams.enable_permanent_delegate && initParams.enable_transfer_hook;
    if (isSSS2) {
      const [extraMetasPda] = findExtraAccountMetasPDA(mintPk, SSS_HOOK_PROGRAM_ID);
      const { Program: AnchorProgram } = await import("@coral-xyz/anchor");
      const hookProgram = new AnchorProgram(
        hookIdl as unknown as Idl,
        provider
      ) as Program;
      await (hookProgram.methods as unknown as { initializeExtraAccountMetaList: (programId: PublicKey) => { accountsStrict: (a: object) => { rpc: () => Promise<string> } } })
        .initializeExtraAccountMetaList(program.programId)
        .accountsStrict({
          authority,
          extraAccountMetaList: extraMetasPda,
          mint: mintPk,
          systemProgram: SYSTEM_PROGRAM_ID,
        })
        .rpc();
    }

    return SolanaStablecoin.load(program, mintPk);
  }

  async refresh(): Promise<StablecoinState> {
    const accountNs = this.program.account as Record<
      string,
      { fetch: (p: PublicKey) => Promise<unknown> }
    >;
    const fetchAccount = () =>
      accountNs["stablecoinState"]?.fetch(this.stablecoin) ??
      accountNs["StablecoinState"]?.fetch(this.stablecoin);

    let raw: unknown = null;
    for (let i = 0; i < 15; i++) {
      try {
        raw = await fetchAccount();
        if (raw) break;
      } catch {
        if (i === 14) throw new Error("Stablecoin state account not found");
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!raw) throw new Error("Stablecoin state account not found");
    const state = toStablecoinState(raw);
    this._state = state;
    return state;
  }

  async getState(): Promise<StablecoinState> {
    if (!this._state) await this.refresh();
    return this._state!;
  }

  isSSS2(): boolean {
    if (!this._state) return false;
    return (
      this._state.enable_permanent_delegate &&
      this._state.enable_transfer_hook
    );
  }

  async getTotalSupply(): Promise<BN> {
    await this.refresh();
    const state = this._state!;
    return state.total_minted.sub(state.total_burned);
  }

  getRecipientTokenAccount(owner: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(
      this.mintAddress,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  }

  async mint(signer: PublicKey | Keypair, params: MintParams): Promise<string> {
    const signerPubkey =
      signer instanceof Keypair ? signer.publicKey : new PublicKey(signer);
    const signerKeypair = signer instanceof Keypair ? signer : null;

    const [rolePda] = findRolePDA(this.stablecoin, params.minter, this.program.programId);
    const [minterInfoPda] = findMinterPDA(this.stablecoin, params.minter, this.program.programId);
    const recipientAta = this.getRecipientTokenAccount(params.recipient);
    const connection = this.provider.connection;
    const needsAta = !(await connection.getAccountInfo(recipientAta));

    const [supplyCapPda] = findSupplyCapPDA(this.stablecoin, this.program.programId);
    const supplyCapInfo = await connection.getAccountInfo(supplyCapPda);
    const supplyCapAccount = supplyCapInfo ? supplyCapPda : this.program.programId;

    const mintAccounts = {
      minter: params.minter,
      stablecoin: this.stablecoin,
      role: rolePda,
      minterInfo: minterInfoPda,
      mint: this.mintAddress,
      recipientTokenAccount: recipientAta,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      supplyCap: supplyCapAccount,
    };
    const mintIxBuilder = (this.program.methods as unknown as {
      mintTokens: (amount: BN) => {
        accountsStrict: (a: object) => {
          rpc: () => Promise<string>;
          instruction: () => Promise<TransactionInstruction>;
        };
      };
    })
      .mintTokens(new BN(params.amount.toString()))
      .accountsStrict(mintAccounts);

    const mintIx = await mintIxBuilder.instruction();

    if (needsAta) {
      const createAtaIx = createAssociatedTokenAccountInstruction(
        signerPubkey,
        recipientAta,
        params.recipient,
        this.mintAddress,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction().add(createAtaIx, mintIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer = signerPubkey;
      const extraSigners = signerKeypair ? [signerKeypair] : [];
      return this.provider.sendAndConfirm(tx, extraSigners);
    }

    if (signerKeypair) {
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction().add(mintIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.provider.wallet.publicKey;
      return this.provider.sendAndConfirm(tx, [signerKeypair]);
    }
    return mintIxBuilder.rpc();
  }

  async burn(signer: PublicKey | Keypair, params: BurnParams): Promise<string> {
    const signerPubkey =
      signer instanceof Keypair ? signer.publicKey : new PublicKey(signer);
    const signerKeypair = signer instanceof Keypair ? signer : null;

    const burnerAta = this.getRecipientTokenAccount(signerPubkey);
    const amount = BigInt(params.amount.toString());

    // Pre-check: burner's token account must exist and have sufficient balance
    try {
      const account = await getAccount(
        this.provider.connection,
        burnerAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const balance = account.amount;
      if (balance < amount) {
        throw new Error(
          `Insufficient balance: signer has ${balance.toString()} tokens, tried to burn ${amount.toString()}. ` +
            "Burn burns from the signer's token account. Mint to the signer first, or burn less."
        );
      }
    } catch (e) {
      if (e instanceof Error) {
        if (e.message.includes("Insufficient balance")) throw e;
        const isNotFound =
          e.name === "TokenAccountNotFoundError" ||
          e.message.includes("could not find account") ||
          e.message.includes("Account does not exist");
        if (isNotFound) {
          throw new Error(
            `Burner's token account does not exist. ` +
              `The signer (${signerPubkey.toBase58()}) must hold tokens before burning. ` +
              "Mint tokens to the signer first."
          );
        }
      }
      throw e;
    }

    const [rolePda] = findRolePDA(this.stablecoin, signerPubkey, this.program.programId);
    const burnIxBuilder = (this.program.methods as unknown as {
      burnTokens: (amount: BN) => {
        accountsStrict: (a: object) => {
          rpc: () => Promise<string>;
          instruction: () => Promise<TransactionInstruction>;
        };
      };
    })
      .burnTokens(new BN(params.amount.toString()))
      .accountsStrict({
        burner: signerPubkey,
        stablecoin: this.stablecoin,
        role: rolePda,
        mint: this.mintAddress,
        burnerTokenAccount: burnerAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      });

    if (signerKeypair) {
      const burnIx = await burnIxBuilder.instruction();
      const connection = this.provider.connection;
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction().add(burnIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer = this.provider.wallet.publicKey;
      return this.provider.sendAndConfirm(tx, [signerKeypair]);
    }
    return burnIxBuilder.rpc();
  }

  async freezeAccount(
    signer: PublicKey,
    targetTokenAccount: PublicKey
  ): Promise<string> {
    // Pre-check: target token account must exist
    try {
      await getAccount(
        this.provider.connection,
        targetTokenAccount,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
    } catch (e) {
      const isNotFound =
        e instanceof Error &&
        (e.name === "TokenAccountNotFoundError" ||
          e.message.includes("could not find account") ||
          e.message.includes("Account does not exist"));
      if (isNotFound) {
        throw new Error(
          `Token account does not exist: ${targetTokenAccount.toBase58()}. ` +
            "The owner must have a token account for this mint. Mint to that owner first."
        );
      }
      throw e;
    }

    const [rolePda] = findRolePDA(this.stablecoin, signer, this.program.programId);
    return (this.program.methods as unknown as { freezeAccount: () => { accountsStrict: (a: object) => { rpc: () => Promise<string> } } })
      .freezeAccount()
      .accountsStrict({
        authority: signer,
        stablecoin: this.stablecoin,
        role: rolePda,
        mint: this.mintAddress,
        targetTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  async thawAccount(
    signer: PublicKey,
    targetTokenAccount: PublicKey
  ): Promise<string> {
    // Pre-check: target token account must exist
    try {
      await getAccount(
        this.provider.connection,
        targetTokenAccount,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
    } catch (e) {
      const isNotFound =
        e instanceof Error &&
        (e.name === "TokenAccountNotFoundError" ||
          e.message.includes("could not find account") ||
          e.message.includes("Account does not exist"));
      if (isNotFound) {
        throw new Error(
          `Token account does not exist: ${targetTokenAccount.toBase58()}. ` +
            "The owner must have a token account for this mint. Mint to that owner first."
        );
      }
      throw e;
    }

    const [rolePda] = findRolePDA(this.stablecoin, signer, this.program.programId);
    return (this.program.methods as unknown as { thawAccount: () => { accountsStrict: (a: object) => { rpc: () => Promise<string> } } })
      .thawAccount()
      .accountsStrict({
        authority: signer,
        stablecoin: this.stablecoin,
        role: rolePda,
        mint: this.mintAddress,
        targetTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  async pause(signer: PublicKey): Promise<string> {
    const [rolePda] = findRolePDA(this.stablecoin, signer, this.program.programId);
    return (this.program.methods as unknown as { pause: () => { accountsStrict: (a: object) => { rpc: () => Promise<string> } } })
      .pause()
      .accountsStrict({
        authority: signer,
        stablecoin: this.stablecoin,
        role: rolePda,
      })
      .rpc();
  }

  async unpause(signer: PublicKey): Promise<string> {
    const [rolePda] = findRolePDA(this.stablecoin, signer, this.program.programId);
    return (this.program.methods as unknown as { unpause: () => { accountsStrict: (a: object) => { rpc: () => Promise<string> } } })
      .unpause()
      .accountsStrict({
        authority: signer,
        stablecoin: this.stablecoin,
        role: rolePda,
      })
      .rpc();
  }

  async updateRoles(
    signer: PublicKey,
    params: UpdateRolesParams
  ): Promise<string> {
    const [rolePda] = findRolePDA(
      this.stablecoin,
      params.holder,
      this.program.programId
    );
    const roles = {
      isMinter: params.roles.isMinter,
      isBurner: params.roles.isBurner,
      isPauser: params.roles.isPauser,
      isFreezer: params.roles.isFreezer,
      isBlacklister: params.roles.isBlacklister,
      isSeizer: params.roles.isSeizer,
    };
    return (this.program.methods as unknown as { updateRoles: (r: typeof roles) => { accountsStrict: (a: object) => { rpc: () => Promise<string> } } })
      .updateRoles(roles)
      .accountsStrict({
        authority: signer,
        stablecoin: this.stablecoin,
        role: rolePda,
        holder: params.holder,
        systemProgram: SYSTEM_PROGRAM_ID,
      })
      .rpc();
  }

  async updateMinter(
    signer: PublicKey,
    params: UpdateMinterParams
  ): Promise<string> {
    const [minterInfoPda] = findMinterPDA(
      this.stablecoin,
      params.minter,
      this.program.programId
    );
    return (this.program.methods as unknown as { updateMinter: (quota: BN) => { accountsStrict: (a: object) => { rpc: () => Promise<string> } } })
      .updateMinter(new BN(params.quota.toString()))
      .accountsStrict({
        authority: signer,
        stablecoin: this.stablecoin,
        minterInfo: minterInfoPda,
        minter: params.minter,
        systemProgram: SYSTEM_PROGRAM_ID,
      })
      .rpc();
  }

  async updateSupplyCap(signer: PublicKey, cap: bigint): Promise<string> {
    const [supplyCapPda] = findSupplyCapPDA(this.stablecoin, this.program.programId);
    return (this.program.methods as unknown as { updateSupplyCap: (cap: BN) => { accountsStrict: (a: object) => { rpc: () => Promise<string> } } })
      .updateSupplyCap(new BN(cap.toString()))
      .accountsStrict({
        authority: signer,
        stablecoin: this.stablecoin,
        supplyCap: supplyCapPda,
        systemProgram: SYSTEM_PROGRAM_ID,
      })
      .rpc();
  }

  async getSupplyCap(): Promise<bigint | null> {
    const [supplyCapPda] = findSupplyCapPDA(this.stablecoin, this.program.programId);
    const info = await this.provider.connection.getAccountInfo(supplyCapPda);
    if (!info?.data || info.data.length < 16) return null;
    const cap = info.data.readBigUInt64LE(8);
    return cap === BigInt("18446744073709551615") ? null : cap; // u64::MAX = no cap
  }

  async transferAuthority(
    signer: PublicKey,
    newAuthority: PublicKey
  ): Promise<string> {
    return (this.program.methods as unknown as { transferAuthority: () => { accountsStrict: (a: object) => { rpc: () => Promise<string> } } })
      .transferAuthority()
      .accountsStrict({
        authority: signer,
        stablecoin: this.stablecoin,
        newAuthority,
      })
      .rpc();
  }

  readonly compliance = {
    blacklistAdd: async (
      signer: PublicKey,
      address: PublicKey,
      reason: string
    ): Promise<string> => {
      const state = await this.getState();
      if (!state.enable_transfer_hook || !state.enable_permanent_delegate) {
        throw new ComplianceNotEnabledError();
      }
      const [rolePda] = findRolePDA(this.stablecoin, signer, this.program.programId);
      const [blacklistPda] = findBlacklistPDA(
        this.stablecoin,
        address,
        this.program.programId
      );
      return (this.program.methods as unknown as { addToBlacklist: (reason: string) => { accountsStrict: (a: object) => { rpc: () => Promise<string> } } })
        .addToBlacklist(reason)
        .accountsStrict({
          blacklister: signer,
          stablecoin: this.stablecoin,
          role: rolePda,
          blacklistEntry: blacklistPda,
          address,
          systemProgram: SYSTEM_PROGRAM_ID,
        })
        .rpc();
    },

    blacklistRemove: async (
      signer: PublicKey,
      address: PublicKey
    ): Promise<string> => {
      const state = await this.getState();
      if (!state.enable_transfer_hook || !state.enable_permanent_delegate) {
        throw new ComplianceNotEnabledError();
      }
      const [rolePda] = findRolePDA(this.stablecoin, signer, this.program.programId);
      const [blacklistPda] = findBlacklistPDA(
        this.stablecoin,
        address,
        this.program.programId
      );
      return (this.program.methods as unknown as { removeFromBlacklist: () => { accountsStrict: (a: object) => { rpc: () => Promise<string> } } })
        .removeFromBlacklist()
        .accountsStrict({
          blacklister: signer,
          stablecoin: this.stablecoin,
          role: rolePda,
          blacklistEntry: blacklistPda,
          address,
        })
        .rpc();
    },

    seize: async (
      signer: PublicKey,
      sourceTokenAccount: PublicKey,
      destinationTokenAccount: PublicKey
    ): Promise<string> => {
      const state = await this.getState();
      if (
        !state.enable_permanent_delegate ||
        !state.enable_transfer_hook
      ) {
        throw new ComplianceNotEnabledError();
      }
      const [rolePda] = findRolePDA(this.stablecoin, signer, this.program.programId);
      const [extraMetasPda] = findExtraAccountMetasPDA(
        this.mintAddress,
        SSS_HOOK_PROGRAM_ID
      );
      const sourceAccount = await getAccount(
        this.provider.connection,
        sourceTokenAccount,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const destAccount = await getAccount(
        this.provider.connection,
        destinationTokenAccount,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const sourceOwner = sourceAccount.owner;
      const destOwner = destAccount.owner;
      const [sourceBlacklistPda] = findBlacklistPDA(
        this.stablecoin,
        sourceOwner,
        this.program.programId
      );
      const [destBlacklistPda] = findBlacklistPDA(
        this.stablecoin,
        destOwner,
        this.program.programId
      );
      return (this.program.methods as unknown as { seize: () => { accountsStrict: (a: object) => { rpc: () => Promise<string> } } })
        .seize()
        .accountsStrict({
          seizer: signer,
          stablecoin: this.stablecoin,
          role: rolePda,
          mint: this.mintAddress,
          sourceTokenAccount,
          destinationTokenAccount,
          transferHookProgram: SSS_HOOK_PROGRAM_ID,
          extraAccountMetas: extraMetasPda,
          sssTokenProgram: SSS_TOKEN_PROGRAM_ID,
          sourceBlacklist: sourceBlacklistPda,
          destBlacklist: destBlacklistPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    },
  };
}

export function getProgram(provider: AnchorProvider): Program {
  return new Program(idl as unknown as Idl, provider) as Program;
}
