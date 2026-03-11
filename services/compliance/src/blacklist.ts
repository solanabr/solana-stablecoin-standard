import { PublicKey, Keypair } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import { loadStablecoin, Logger } from "@sss/shared";
import type { Connection } from "@solana/web3.js";

export interface BlacklistEntry {
  pubkey: string;
  wallet: string;
  reason: string;
}

export class BlacklistService {
  constructor(
    private readonly connection: Connection,
    private readonly mintPubkey: string,
    private readonly blacklisterKeypair: Keypair,
    private readonly logger: Logger,
  ) {}

  private async getStable(): Promise<SolanaStablecoin> {
    return loadStablecoin(this.connection, this.mintPubkey, this.blacklisterKeypair);
  }

  async add(wallet: string, reason: string): Promise<string> {
    const walletPk = new PublicKey(wallet);
    const stable = await this.getStable();

    const txSig = await stable.compliance.blacklistAdd(
      walletPk,
      reason,
      this.blacklisterKeypair,
    );

    this.logger.info({ wallet, reason, txSig }, "Wallet added to blacklist");
    return txSig;
  }

  async remove(wallet: string): Promise<string> {
    const walletPk = new PublicKey(wallet);
    const stable = await this.getStable();

    const txSig = await stable.compliance.blacklistRemove(
      walletPk,
      this.blacklisterKeypair,
    );

    this.logger.info({ wallet, txSig }, "Wallet removed from blacklist");
    return txSig;
  }

  async getAll(): Promise<BlacklistEntry[]> {
    const stable = await this.getStable();
    const entries = await stable.compliance.getBlacklistedEntries();
    return entries.map((e) => ({
      pubkey: e.pubkey.toBase58(),
      wallet: e.wallet.toBase58(),
      reason: e.reason,
    }));
  }

  async isBlacklisted(wallet: string): Promise<boolean> {
    const walletPk = new PublicKey(wallet);
    const stable = await this.getStable();
    return stable.compliance.isBlacklisted(walletPk);
  }
}
