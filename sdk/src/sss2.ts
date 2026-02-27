// @ts-nocheck
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SendOptions,
} from "@solana/web3.js";
import { BN, AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import type { SSS2HookConfig, SDKResult, FeeCalculation } from "./types";

// SSS-2 Program ID (Devnet)
export const SSS2_PROGRAM_ID = new PublicKey(
  "97WYcUSr6Y9YaDTM55PJYuAXpLL552HS6WXxVBmxAGmx"
);

// Instruction discriminators (Anchor: sha256("global:instruction_name")[:8])
const IX_DISCRIMINATORS: Record<string, number[]> = {
  initialize: [175, 175, 109, 31, 13, 152, 155, 237],
  execute_transfer_hook: [184, 36, 139, 254, 34, 134, 12, 162],
  update_fee_config: [104, 184, 103, 242, 88, 151, 107, 20],
  add_whitelist: [48, 236, 234, 108, 135, 184, 3, 30],
  remove_whitelist: [202, 250, 10, 159, 19, 38, 17, 237],
  add_blacklist: [199, 93, 21, 83, 230, 88, 74, 6],
  remove_blacklist: [58, 176, 24, 5, 191, 6, 131, 252],
  set_permanent_delegate: [51, 98, 188, 112, 225, 222, 156, 167],
  set_blacklist_enabled: [190, 131, 243, 145, 100, 46, 86, 139],
  set_paused: [91, 60, 125, 192, 176, 225, 166, 218],
  close_config: [180, 88, 124, 46, 245, 187, 221, 214],
};

/**
 * SSS-2 Transfer Hook SDK
 * Manages token-2022 transfer hooks with fees, whitelist, blacklist, and permanent delegate
 */
export class SSS2Hook {
  private connection: Connection;
  private payer: Keypair;
  private programId: PublicKey;

  constructor(
    connection: Connection,
    payer: Keypair,
    programId = SSS2_PROGRAM_ID
  ) {
    this.connection = connection;
    this.payer = payer;
    this.programId = programId;
  }

  /**
   * Get config PDA for the hook
   */
  getConfigPDA(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), this.payer.publicKey.toBuffer()],
      this.programId
    );
    return pda;
  }

  /**
   * Get whitelist PDA for an address
   */
  getWhitelistPDA(address: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("whitelist"),
        this.payer.publicKey.toBuffer(),
        address.toBuffer(),
      ],
      this.programId
    );
    return pda;
  }

  /**
   * Get blacklist PDA for an address
   */
  getBlacklistPDA(address: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("blacklist"),
        this.payer.publicKey.toBuffer(),
        address.toBuffer(),
      ],
      this.programId
    );
    return pda;
  }

  /**
   * Initialize the transfer hook with fee configuration
   */
  async initialize(config: SSS2HookConfig): Promise<SDKResult> {
    try {
      const configPDA = this.getConfigPDA();

      // Args: fee_bps (u16) + max_fee (u64)
      const feeBps = Buffer.alloc(2);
      feeBps.writeUInt16LE(config.transferFeeBasisPoints, 0);

      const maxFee = Buffer.alloc(8);
      maxFee.writeBigUInt64LE(BigInt(config.maxTransferFee.toString()), 0);

      const data = Buffer.concat([
        Buffer.from(IX_DISCRIMINATORS.initialize),
        feeBps,
        maxFee,
      ]);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: configPDA, isSigner: false, isWritable: true },
          { pubkey: this.payer.publicKey, isSigner: true, isWritable: true },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        programId: this.programId,
        data,
      });

      const sig = await this.sendTransaction([ix]);
      return { success: true, signature: sig, data: { configPDA } };
    } catch (error: any) {
      // If already initialized, it's ok
      if (
        error.toString().includes("already in use") ||
        error.toString().includes("custom program error: 0x0")
      ) {
        return {
          success: true,
          signature: undefined,
          data: { configPDA: this.getConfigPDA() },
        };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Update fee configuration
   */
  async updateFeeConfig(config: {
    transferFeeBasisPoints: number;
    maxTransferFee: BN;
    minTransferAmount: BN;
  }): Promise<SDKResult> {
    try {
      const configPDA = this.getConfigPDA();

      const feeBps = Buffer.alloc(2);
      feeBps.writeUInt16LE(config.transferFeeBasisPoints, 0);

      const maxFee = Buffer.alloc(8);
      maxFee.writeBigUInt64LE(BigInt(config.maxTransferFee.toString()), 0);

      const minTransfer = Buffer.alloc(8);
      minTransfer.writeBigUInt64LE(
        BigInt(config.minTransferAmount.toString()),
        0
      );

      const data = Buffer.concat([
        Buffer.from(IX_DISCRIMINATORS.update_fee_config),
        feeBps,
        maxFee,
        minTransfer,
      ]);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: configPDA, isSigner: false, isWritable: true },
          { pubkey: this.payer.publicKey, isSigner: true, isWritable: false },
        ],
        programId: this.programId,
        data,
      });

      const sig = await this.sendTransaction([ix]);
      return { success: true, signature: sig };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Add address to whitelist
   */
  async addWhitelist(address: PublicKey): Promise<SDKResult> {
    try {
      const configPDA = this.getConfigPDA();
      const whitelistPDA = this.getWhitelistPDA(address);

      const data = Buffer.concat([
        Buffer.from(IX_DISCRIMINATORS.add_whitelist),
        address.toBuffer(),
      ]);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: configPDA, isSigner: false, isWritable: false },
          { pubkey: whitelistPDA, isSigner: false, isWritable: true },
          { pubkey: this.payer.publicKey, isSigner: true, isWritable: true },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        programId: this.programId,
        data,
      });

      const sig = await this.sendTransaction([ix]);
      return { success: true, signature: sig, data: { whitelistPDA } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove address from whitelist
   */
  async removeWhitelist(address: PublicKey): Promise<SDKResult> {
    try {
      const configPDA = this.getConfigPDA();
      const whitelistPDA = this.getWhitelistPDA(address);

      const data = Buffer.concat([
        Buffer.from(IX_DISCRIMINATORS.remove_whitelist),
        address.toBuffer(),
      ]);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: configPDA, isSigner: false, isWritable: false },
          { pubkey: whitelistPDA, isSigner: false, isWritable: true },
          { pubkey: this.payer.publicKey, isSigner: true, isWritable: true },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        programId: this.programId,
        data,
      });

      const sig = await this.sendTransaction([ix]);
      return { success: true, signature: sig };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Add address to blacklist
   */
  async addBlacklist(address: PublicKey): Promise<SDKResult> {
    try {
      const configPDA = this.getConfigPDA();
      const blacklistPDA = this.getBlacklistPDA(address);

      const data = Buffer.concat([
        Buffer.from(IX_DISCRIMINATORS.add_blacklist),
        address.toBuffer(),
      ]);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: configPDA, isSigner: false, isWritable: false },
          { pubkey: blacklistPDA, isSigner: false, isWritable: true },
          { pubkey: this.payer.publicKey, isSigner: true, isWritable: true },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        programId: this.programId,
        data,
      });

      const sig = await this.sendTransaction([ix]);
      return { success: true, signature: sig, data: { blacklistPDA } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove address from blacklist
   */
  async removeBlacklist(address: PublicKey): Promise<SDKResult> {
    try {
      const configPDA = this.getConfigPDA();
      const blacklistPDA = this.getBlacklistPDA(address);

      const data = Buffer.concat([
        Buffer.from(IX_DISCRIMINATORS.remove_blacklist),
        address.toBuffer(),
      ]);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: configPDA, isSigner: false, isWritable: false },
          { pubkey: blacklistPDA, isSigner: false, isWritable: true },
          { pubkey: this.payer.publicKey, isSigner: true, isWritable: true },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        programId: this.programId,
        data,
      });

      const sig = await this.sendTransaction([ix]);
      return { success: true, signature: sig };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Set permanent delegate
   */
  async setPermanentDelegate(delegate?: PublicKey): Promise<SDKResult> {
    try {
      const configPDA = this.getConfigPDA();

      // Option<Pubkey>: 1 byte (0=none, 1=some) + 32 bytes pubkey
      const hasDelegate = delegate ? 1 : 0;
      const delegateBytes = delegate ? delegate.toBuffer() : Buffer.alloc(32);

      const delegateFlag = Buffer.alloc(1);
      delegateFlag.writeUInt8(hasDelegate, 0);

      const data = Buffer.concat([
        Buffer.from(IX_DISCRIMINATORS.set_permanent_delegate),
        delegateFlag,
        delegateBytes,
      ]);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: configPDA, isSigner: false, isWritable: true },
          { pubkey: this.payer.publicKey, isSigner: true, isWritable: false },
        ],
        programId: this.programId,
        data,
      });

      const sig = await this.sendTransaction([ix]);
      return { success: true, signature: sig };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Enable/disable blacklist enforcement
   */
  async setBlacklistEnabled(enabled: boolean): Promise<SDKResult> {
    try {
      const configPDA = this.getConfigPDA();

      const enabledBuf = Buffer.alloc(1);
      enabledBuf.writeUInt8(enabled ? 1 : 0, 0);

      const data = Buffer.concat([
        Buffer.from(IX_DISCRIMINATORS.set_blacklist_enabled),
        enabledBuf,
      ]);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: configPDA, isSigner: false, isWritable: true },
          { pubkey: this.payer.publicKey, isSigner: true, isWritable: false },
        ],
        programId: this.programId,
        data,
      });

      const sig = await this.sendTransaction([ix]);
      return { success: true, signature: sig };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Pause/unpause the hook
   */
  async setPaused(paused: boolean): Promise<SDKResult> {
    try {
      const configPDA = this.getConfigPDA();

      const pausedBuf = Buffer.alloc(1);
      pausedBuf.writeUInt8(paused ? 1 : 0, 0);

      const data = Buffer.concat([
        Buffer.from(IX_DISCRIMINATORS.set_paused),
        pausedBuf,
      ]);

      const ix = new TransactionInstruction({
        keys: [
          { pubkey: configPDA, isSigner: false, isWritable: true },
          { pubkey: this.payer.publicKey, isSigner: true, isWritable: false },
        ],
        programId: this.programId,
        data,
      });

      const sig = await this.sendTransaction([ix]);
      return { success: true, signature: sig };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate fee for a given amount
   */
  calculateFee(amount: BN, config: SSS2HookConfig): FeeCalculation {
    const amountNum = BigInt(amount.toString());
    const bps = BigInt(config.transferFeeBasisPoints);
    const maxFeeNum = BigInt(config.maxTransferFee.toString());

    if (bps === BigInt(0) || amountNum === BigInt(0)) {
      return {
        fee: new BN(0),
        netAmount: amount,
        rateBps: config.transferFeeBasisPoints,
      };
    }

    const fee = (amountNum * bps) / BigInt(10000);
    const cappedFee = fee > maxFeeNum ? maxFeeNum : fee;
    const netAmount = amountNum - cappedFee;

    return {
      amount,
      fee: new BN(cappedFee.toString()),
      netAmount: new BN(netAmount.toString()),
      rateBps: config.transferFeeBasisPoints,
    };
  }

  // ==================== INTERNAL ====================

  private async sendTransaction(
    instructions: TransactionInstruction[],
    options?: SendOptions
  ): Promise<string> {
    const tx = new Transaction().add(...instructions);
    tx.feePayer = this.payer.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

    tx.sign(this.payer);

    const rawTx = tx.serialize();
    const sig = await this.connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      ...options,
    });

    await this.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }
}

export default SSS2Hook;
