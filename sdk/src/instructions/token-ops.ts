import { BN } from "@coral-xyz/anchor";
import { PublicKey, TransactionSignature } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "../types";
import { findRolePDA } from "../utils/pda";
import type { SolanaStablecoin } from "../stablecoin";

export class TokenOperations {
  constructor(private readonly sdk: SolanaStablecoin) {}

  async mint(destination: PublicKey, amount: bigint): Promise<TransactionSignature> {
    const wallet = this.sdk.provider.wallet.publicKey;
    const [rolePDA] = findRolePDA(this.sdk.configPDA, wallet);
    return (this.sdk.program.methods as any)
      .mintTokens(new BN(amount.toString()))
      .accounts({
        minter: wallet,
        config: this.sdk.configPDA,
        roleAssignment: rolePDA,
        mint: this.sdk.mint,
        destination,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  async burn(source: PublicKey, amount: bigint, sourceAuthority?: PublicKey): Promise<TransactionSignature> {
    const wallet = this.sdk.provider.wallet.publicKey;
    const [rolePDA] = findRolePDA(this.sdk.configPDA, wallet);
    return (this.sdk.program.methods as any)
      .burnTokens(new BN(amount.toString()))
      .accounts({
        burner: wallet,
        config: this.sdk.configPDA,
        roleAssignment: rolePDA,
        mint: this.sdk.mint,
        source,
        sourceAuthority: sourceAuthority || wallet,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  async freezeAccount(tokenAccount: PublicKey): Promise<TransactionSignature> {
    const wallet = this.sdk.provider.wallet.publicKey;
    const [rolePDA] = findRolePDA(this.sdk.configPDA, wallet);
    return (this.sdk.program.methods as any)
      .freezeAccount()
      .accounts({
        authority: wallet,
        config: this.sdk.configPDA,
        roleAssignment: rolePDA,
        mint: this.sdk.mint,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  async thawAccount(tokenAccount: PublicKey): Promise<TransactionSignature> {
    const wallet = this.sdk.provider.wallet.publicKey;
    const [rolePDA] = findRolePDA(this.sdk.configPDA, wallet);
    return (this.sdk.program.methods as any)
      .thawAccount()
      .accounts({
        authority: wallet,
        config: this.sdk.configPDA,
        roleAssignment: rolePDA,
        mint: this.sdk.mint,
        tokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  }

  async pause(): Promise<TransactionSignature> {
    const wallet = this.sdk.provider.wallet.publicKey;
    const [rolePDA] = findRolePDA(this.sdk.configPDA, wallet);
    return (this.sdk.program.methods as any)
      .pause()
      .accounts({ authority: wallet, config: this.sdk.configPDA, roleAssignment: rolePDA })
      .rpc();
  }

  async unpause(): Promise<TransactionSignature> {
    const wallet = this.sdk.provider.wallet.publicKey;
    return (this.sdk.program.methods as any)
      .unpause()
      .accounts({ authority: wallet, config: this.sdk.configPDA })
      .rpc();
  }

  async getSupplyInfo(): Promise<{ totalMinted: bigint; totalBurned: bigint; circulating: bigint }> {
    const config = await this.sdk.getConfig();
    return {
      totalMinted: config.totalMinted,
      totalBurned: config.totalBurned,
      circulating: config.totalMinted - config.totalBurned,
    };
  }
}
