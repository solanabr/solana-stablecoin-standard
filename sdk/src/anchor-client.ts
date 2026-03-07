import { Connection, PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { STABLECOIN_CORE_PROGRAM_ID, STABLECOIN_SEED } from './constants';
import stablecoinCoreIdl from './idl/stablecoin_core.json';

/**
 * Anchor-based client for real Solana transactions
 */
export class AnchorStablecoinClient {
  private program: Program;
  private provider: AnchorProvider;
  public connection: Connection;

  constructor(connection: Connection, wallet: Wallet) {
    this.connection = connection;
    this.provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
    
    // Create program with explicit program ID
    this.program = new Program(
      stablecoinCoreIdl as any,
      this.provider
    );
  }

  /**
   * Derive stablecoin state PDA
   */
  private getStablecoinStatePDA(mint: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [STABLECOIN_SEED],
      STABLECOIN_CORE_PROGRAM_ID
    );
    return pda;
  }

  /**
   * Initialize a new stablecoin
   */
  async initialize(params: {
    name: string;
    symbol: string;
    decimals: number;
    authority: Keypair;
  }): Promise<{ mint: PublicKey; signature: string }> {
    const mintKeypair = Keypair.generate();
    const stablecoinState = this.getStablecoinStatePDA(mintKeypair.publicKey);

    const signature = await this.program.methods
      .initialize(params.name, params.symbol, params.decimals)
      .accounts({
        state: stablecoinState,
        authority: params.authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([params.authority])
      .rpc();

    return {
      mint: mintKeypair.publicKey,
      signature,
    };
  }

  /**
   * Mint tokens
   */
  async mint(params: {
    mint: PublicKey;
    amount: number;
    authority: Keypair;
  }): Promise<string> {
    const stablecoinState = this.getStablecoinStatePDA(params.mint);
    const amountBN = new BN(params.amount);

    const signature = await this.program.methods
      .mint(amountBN)
      .accounts({
        state: stablecoinState,
        authority: params.authority.publicKey,
      })
      .signers([params.authority])
      .rpc();

    return signature;
  }

  /**
   * Burn tokens
   */
  async burn(params: {
    mint: PublicKey;
    amount: number;
    authority: Keypair;
  }): Promise<string> {
    const stablecoinState = this.getStablecoinStatePDA(params.mint);
    const amountBN = new BN(params.amount);

    const signature = await this.program.methods
      .burn(amountBN)
      .accounts({
        state: stablecoinState,
        authority: params.authority.publicKey,
      })
      .signers([params.authority])
      .rpc();

    return signature;
  }

  /**
   * Pause operations
   */
  async pause(params: {
    mint: PublicKey;
    authority: Keypair;
  }): Promise<string> {
    const stablecoinState = this.getStablecoinStatePDA(params.mint);

    const signature = await this.program.methods
      .pause()
      .accounts({
        state: stablecoinState,
        authority: params.authority.publicKey,
      })
      .signers([params.authority])
      .rpc();

    return signature;
  }

  /**
   * Unpause operations
   */
  async unpause(params: {
    mint: PublicKey;
    authority: Keypair;
  }): Promise<string> {
    const stablecoinState = this.getStablecoinStatePDA(params.mint);

    const signature = await this.program.methods
      .unpause()
      .accounts({
        state: stablecoinState,
        authority: params.authority.publicKey,
      })
      .signers([params.authority])
      .rpc();

    return signature;
  }

  /**
   * Freeze account
   */
  async freezeAccount(params: {
    mint: PublicKey;
    target: PublicKey;
    authority: Keypair;
  }): Promise<string> {
    const stablecoinState = this.getStablecoinStatePDA(params.mint);

    const signature = await this.program.methods
      .freezeAccount(params.target)
      .accounts({
        state: stablecoinState,
        authority: params.authority.publicKey,
      })
      .signers([params.authority])
      .rpc();

    return signature;
  }

  /**
   * Thaw account
   */
  async thawAccount(params: {
    mint: PublicKey;
    target: PublicKey;
    authority: Keypair;
  }): Promise<string> {
    const stablecoinState = this.getStablecoinStatePDA(params.mint);

    const signature = await this.program.methods
      .thawAccount(params.target)
      .accounts({
        state: stablecoinState,
        authority: params.authority.publicKey,
      })
      .signers([params.authority])
      .rpc();

    return signature;
  }

  /**
   * Add address to blacklist
   */
  async addToBlacklist(params: {
    mint: PublicKey;
    address: PublicKey;
    reason: string;
    authority: Keypair;
  }): Promise<string> {
    const stablecoinState = this.getStablecoinStatePDA(params.mint);

    const signature = await this.program.methods
      .addToBlacklist(params.address, params.reason)
      .accounts({
        state: stablecoinState,
        authority: params.authority.publicKey,
      })
      .signers([params.authority])
      .rpc();

    return signature;
  }

  /**
   * Remove address from blacklist
   */
  async removeFromBlacklist(params: {
    mint: PublicKey;
    address: PublicKey;
    authority: Keypair;
  }): Promise<string> {
    const stablecoinState = this.getStablecoinStatePDA(params.mint);

    const signature = await this.program.methods
      .removeFromBlacklist(params.address)
      .accounts({
        state: stablecoinState,
        authority: params.authority.publicKey,
      })
      .signers([params.authority])
      .rpc();

    return signature;
  }

  /**
   * Get stablecoin state
   */
  async getState(mint: PublicKey): Promise<any> {
    const stablecoinState = this.getStablecoinStatePDA(mint);
    try {
      const accountInfo = await this.connection.getAccountInfo(stablecoinState);
      if (!accountInfo) {
        throw new Error('Stablecoin state not found');
      }
      // Parse account data manually since IDL account names may not match
      return {
        address: stablecoinState.toBase58(),
        data: accountInfo.data,
      };
    } catch (error) {
      throw new Error(`Failed to fetch stablecoin state: ${error}`);
    }
  }
}
