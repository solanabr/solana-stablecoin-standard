/**
 * Solana Stablecoin Standard SDK
 * 
 * SDK modular para criação e gerenciamento de stablecoins SSS-1 e SSS-2
 */

import {
  AnchorProvider,
  Program,
  BN,
  Wallet,
} from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  TransactionSignature,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  createMint,
  getMint,
} from "@solana/spl-token";
import IDL from "./idl/stablecoin.json";
import { Stablecoin as StablecoinIDL } from "./types/stablecoin";

export enum Presets {
  SSS_1 = "sss-1",
  SSS_2 = "sss-2",
}

export interface StablecoinConfig {
  preset?: Presets;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  permanentDelegate?: boolean;
  transferHook?: boolean;
}

export class SolanaStablecoin {
  private provider: AnchorProvider;
  private program: Program<StablecoinIDL>;
  private mint: PublicKey;
  private stablecoinPda: PublicKey;

  constructor(
    provider: AnchorProvider,
    program: Program<StablecoinIDL>,
    mint: PublicKey,
    stablecoinPda: PublicKey
  ) {
    this.provider = provider;
    this.program = program;
    this.mint = mint;
    this.stablecoinPda = stablecoinPda;
  }

  /**
   * Cria uma nova stablecoin com configuração
   */
  static async create(
    connection: Connection,
    wallet: Wallet,
    config: StablecoinConfig
  ): Promise<SolanaStablecoin> {
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });

    const program = new Program<StablecoinIDL>(
      IDL as StablecoinIDL,
      provider
    );

    // Generate mint keypair
    const mintKeypair = Keypair.generate();

    // Derive stablecoin PDA
    const [stablecoinPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("stablecoin"), mintKeypair.publicKey.toBuffer()],
      program.programId
    );

    // Build config
    const stablecoinConfig = {
      name: config.name,
      symbol: config.symbol,
      uri: config.uri,
      decimals: config.decimals,
      enablePermanentDelegate: config.permanentDelegate ?? config.preset === Presets.SSS_2,
      enableTransferHook: config.transferHook ?? config.preset === Presets.SSS_2,
      defaultAccountFrozen: false,
    };

    // Initialize
    await program.methods
      .initialize(stablecoinConfig)
      .accounts({
        authority: wallet.publicKey,
        stablecoin: stablecoinPda,
        mint: mintKeypair.publicKey,
      })
      .signers([mintKeypair])
      .rpc();

    return new SolanaStablecoin(provider, program, mintKeypair.publicKey, stablecoinPda);
  }

  /**
   * Carrega stablecoin existente
   */
  static async load(
    connection: Connection,
    wallet: Wallet,
    mint: PublicKey
  ): Promise<SolanaStablecoin> {
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });

    const program = new Program<StablecoinIDL>(
      IDL as StablecoinIDL,
      provider
    );

    const [stablecoinPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("stablecoin"), mint.toBuffer()],
      program.programId
    );

    return new SolanaStablecoin(provider, program, mint, stablecoinPda);
  }

  /**
   * Mint de tokens
   */
  async mint(params: {
    recipient: PublicKey;
    amount: BN;
    minter?: PublicKey;
  }): Promise<TransactionSignature> {
    const minter = params.minter ?? this.provider.publicKey;

    const recipientAta = await getOrCreateAssociatedTokenAccount(
      this.provider.connection,
      this.provider.wallet.payer,
      this.mint,
      params.recipient
    );

    return await this.program.methods
      .mint(params.amount)
      .accounts({
        stablecoin: this.stablecoinPda,
        minter,
        authority: this.provider.publicKey,
        mint: this.mint,
        to: recipientAta.address,
      })
      .rpc();
  }

  /**
   * Burn de tokens
   */
  async burn(params: {
    amount: BN;
  }): Promise<TransactionSignature> {
    const userAta = await getOrCreateAssociatedTokenAccount(
      this.provider.connection,
      this.provider.wallet.payer,
      this.mint,
      this.provider.publicKey
    );

    return await this.program.methods
      .burn(params.amount)
      .accounts({
        stablecoin: this.stablecoinPda,
        authority: this.provider.publicKey,
        mint: this.mint,
        from: userAta.address,
      })
      .rpc();
  }

  /**
   * Freeze de conta (SSS-2)
   */
  async freezeAccount(address: PublicKey): Promise<TransactionSignature> {
    const accountAta = await getOrCreateAssociatedTokenAccount(
      this.provider.connection,
      this.provider.wallet.payer,
      this.mint,
      address
    );

    return await this.program.methods
      .freezeAccount()
      .accounts({
        stablecoin: this.stablecoinPda,
        authority: this.provider.publicKey,
        mint: this.mint,
        account: accountAta.address,
      })
      .rpc();
  }

  /**
   * Thaw de conta congelada
   */
  async thawAccount(address: PublicKey): Promise<TransactionSignature> {
    const accountAta = await getOrCreateAssociatedTokenAccount(
      this.provider.connection,
      this.provider.wallet.payer,
      this.mint,
      address
    );

    return await this.program.methods
      .thawAccount()
      .accounts({
        stablecoin: this.stablecoinPda,
        authority: this.provider.publicKey,
        mint: this.mint,
        account: accountAta.address,
      })
      .rpc();
  }

  /**
   * Pause (emergency)
   */
  async pause(): Promise<TransactionSignature> {
    return await this.program.methods
      .pause()
      .accounts({
        stablecoin: this.stablecoinPda,
        authority: this.provider.publicKey,
      })
      .rpc();
  }

  /**
   * Unpause
   */
  async unpause(): Promise<TransactionSignature> {
    return await this.program.methods
      .unpause()
      .accounts({
        stablecoin: this.stablecoinPda,
        authority: this.provider.publicKey,
      })
      .rpc();
  }

  /**
   * Transferir autoridade
   */
  async transferAuthority(newAuthority: PublicKey): Promise<TransactionSignature> {
    return await this.program.methods
      .transferAuthority(newAuthority)
      .accounts({
        stablecoin: this.stablecoinPda,
        authority: this.provider.publicKey,
      })
      .rpc();
  }

  // === SSS-2 COMPLIANCE ===

  /**
   * Adicionar à blacklist (SSS-2 only)
   */
  async blacklistAdd(address: PublicKey, reason?: string): Promise<TransactionSignature> {
    const [blacklistPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("blacklist"), this.stablecoinPda.toBuffer()],
      this.program.programId
    );

    return await this.program.methods
      .addToBlacklist(address)
      .accounts({
        stablecoin: this.stablecoinPda,
        authority: this.provider.publicKey,
        blacklist: blacklistPda,
      })
      .rpc();
  }

  /**
   * Remover da blacklist (SSS-2 only)
   */
  async blacklistRemove(address: PublicKey): Promise<TransactionSignature> {
    const [blacklistPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("blacklist"), this.stablecoinPda.toBuffer()],
      this.program.programId
    );

    return await this.program.methods
      .removeFromBlacklist(address)
      .accounts({
        stablecoin: this.stablecoinPda,
        authority: this.provider.publicKey,
        blacklist: blacklistPda,
      })
      .rpc();
  }

  /**
   * Seize tokens (SSS-2 only, via permanent delegate)
   */
  async seize(from: PublicKey, to: PublicKey, amount: BN): Promise<TransactionSignature> {
    return await this.program.methods
      .seize(amount, to)
      .accounts({
        stablecoin: this.stablecoinPda,
        authority: this.provider.publicKey,
        mint: this.mint,
        from,
        to,
      })
      .rpc();
  }

  // === VIEW FUNCTIONS ===

  /**
   * Get total supply
   */
  async getTotalSupply(): Promise<BN> {
    const account = await this.program.account.stablecoin.fetch(this.stablecoinPda);
    return account.totalSupply;
  }

  /**
   * Get config
   */
  async getConfig() {
    const account = await this.program.account.stablecoin.fetch(this.stablecoinPda);
    return account.config;
  }

  /**
   * Check if paused
   */
  async isPaused(): Promise<boolean> {
    const account = await this.program.account.stablecoin.fetch(this.stablecoinPda);
    return account.paused;
  }

  /**
   * Get mint address
   */
  getMint(): PublicKey {
    return this.mint;
  }

  /**
   * Get stablecoin PDA
   */
  getStablecoinPda(): PublicKey {
    return this.stablecoinPda;
  }
}

export default SolanaStablecoin;
