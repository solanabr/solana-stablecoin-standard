import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
} from "@solana/spl-token";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { Program } from "@coral-xyz/anchor";
import BN from "bn.js";

import {
  PROGRAM_ID,
  getConfigPda,
  getBlacklisterRolePda,
  getBlacklistedEntryPda,
  getSeizerAuthorityPda,
  getSeizerRolePda,
  getEventAuthorityPda,
} from "./pda";
import type { StablecoinConfigData } from "./types";

export class Compliance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly program: Program<any>,
    private readonly mint: PublicKey,
    private readonly getConfig: () => StablecoinConfigData,
  ) {}

  private assertSss2(): void {
    const config = this.getConfig();
    if ("sss1" in config.standard) {
      throw new Error(
        "This operation requires SSS-2 compliance features. " +
          "Initialize the stablecoin with Presets.SSS_2 or enable compliance extensions.",
      );
    }
  }

  /**
   * Add a wallet to the blacklist (SSS-2 only).
   * The signer must hold the blacklister role for this mint.
   * @param wallet - The wallet address to blacklist.
   * @param reason - Human-readable reason (max 100 chars), stored on-chain.
   * @param blacklister - Keypair with the blacklister role. Defaults to the provider wallet.
   */
  async blacklistAdd(
    wallet: PublicKey,
    reason: string,
    blacklister?: Keypair,
  ): Promise<string> {
    this.assertSss2();

    const blacklisterKey = blacklister
      ? blacklister.publicKey
      : this.program.provider.publicKey!;

    const [configPda] = getConfigPda(PROGRAM_ID, this.mint);
    const [blacklistedEntry] = getBlacklistedEntryPda(
      PROGRAM_ID,
      this.mint,
      wallet,
    );
    const [blacklisterRole] = getBlacklisterRolePda(
      PROGRAM_ID,
      this.mint,
      blacklisterKey,
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _role = blacklisterRole; // validated on-chain

    const extraSigners = blacklister ? [blacklister] : [];

    const sig = await this.program.methods
      .addToBlacklist(wallet, reason)
      .accountsStrict({
        blacklister: blacklisterKey,
        mint: this.mint,
        config: configPda,
        blacklistedEntry,
        systemProgram: SystemProgram.programId,
        eventAuthority: getEventAuthorityPda(PROGRAM_ID),
        program: PROGRAM_ID,
      })
      .signers(extraSigners)
      .rpc();

    return sig;
  }

  /**
   * Remove a wallet from the blacklist (SSS-2 only).
   * The signer must hold the blacklister role for this mint.
   * @param wallet - The wallet address to remove from the blacklist.
   * @param blacklister - Keypair with the blacklister role. Defaults to the provider wallet.
   */
  async blacklistRemove(
    wallet: PublicKey,
    blacklister?: Keypair,
  ): Promise<string> {
    this.assertSss2();

    const blacklisterKey = blacklister
      ? blacklister.publicKey
      : this.program.provider.publicKey!;

    const [configPda] = getConfigPda(PROGRAM_ID, this.mint);
    const [blacklistedEntry] = getBlacklistedEntryPda(
      PROGRAM_ID,
      this.mint,
      wallet,
    );

    const extraSigners = blacklister ? [blacklister] : [];

    const sig = await this.program.methods
      .removeFromBlacklist(wallet)
      .accountsStrict({
        blacklister: blacklisterKey,
        mint: this.mint,
        config: configPda,
        blacklistedEntry,
        systemProgram: SystemProgram.programId,
        eventAuthority: getEventAuthorityPda(PROGRAM_ID),
        program: PROGRAM_ID,
      })
      .signers(extraSigners)
      .rpc();

    return sig;
  }

  /**
   * Seize tokens from a frozen/non-compliant account (SSS-2 only).
   * The signer must hold the seizer role for this mint.
   * @param fromAta - The source token account to seize from.
   * @param toTreasury - The destination wallet (will be resolved to its ATA) or token account.
   * @param amount - Amount in base units. If omitted, seizes the full balance.
   * @param seizer - Keypair with the seizer role. Defaults to the provider wallet.
   */
  async seize(
    fromAta: PublicKey,
    toTreasury: PublicKey,
    amount?: bigint | number,
    seizer?: Keypair,
  ): Promise<string> {
    this.assertSss2();

    const seizerKey = seizer
      ? seizer.publicKey
      : this.program.provider.publicKey!;

    const [seizerAuthority] = getSeizerAuthorityPda(PROGRAM_ID, this.mint);
    const [seizerRole] = getSeizerRolePda(PROGRAM_ID, this.mint, seizerKey);
    const [stablecoinConfig] = getConfigPda(PROGRAM_ID, this.mint);

    const toAta = getAssociatedTokenAddressSync(
      this.mint,
      toTreasury,
      true,
      TOKEN_2022_PROGRAM_ID,
    );

    let seizeAmount: bigint;
    if (amount !== undefined) {
      seizeAmount = BigInt(amount);
    } else {
      const tokenAccount = await getAccount(
        this.program.provider.connection,
        fromAta,
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      seizeAmount = tokenAccount.amount;
    }

    const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      seizerKey,
      toAta,
      toTreasury,
      this.mint,
      TOKEN_2022_PROGRAM_ID,
    );

    const extraSigners = seizer ? [seizer] : [];

    const sig = await this.program.methods
      .seize(new BN(seizeAmount.toString()))
      .accountsStrict({
        seizer: seizerKey,
        seizerAuthority,
        seizerRole,
        stablecoinConfig,
        from: fromAta,
        to: toAta,
        mint: this.mint,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        eventAuthority: getEventAuthorityPda(PROGRAM_ID),
        program: PROGRAM_ID,
      })
      .preInstructions([createAtaIx])
      .signers(extraSigners)
      .rpc();

    return sig;
  }

  /**
   * Fetch all blacklisted entries for this mint.
   * Returns an array of objects with pubkey and account data.
   */
  async getBlacklistedEntries(): Promise<
    { pubkey: PublicKey; wallet: PublicKey; reason: string }[]
  > {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accounts = await (this.program.account as any).blacklistedEntry.all([
      {
        memcmp: {
          offset: 8 + 1, // skip discriminator + bump
          bytes: this.mint.toBase58(),
        },
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return accounts.map((a: any) => ({
      pubkey: a.publicKey as PublicKey,
      wallet: a.account.wallet as PublicKey,
      reason: a.account.reason as string,
    }));
  }

  /**
   * Check if a specific wallet is blacklisted for this mint.
   */
  async isBlacklisted(wallet: PublicKey): Promise<boolean> {
    const [blacklistedEntry] = getBlacklistedEntryPda(
      PROGRAM_ID,
      this.mint,
      wallet,
    );
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = await (this.program.account as any).blacklistedEntry.fetch(blacklistedEntry);
      return (account as any).isBlacklisted === true;
    } catch {
      return false;
    }
  }
}
