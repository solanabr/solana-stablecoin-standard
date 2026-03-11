import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SolanaStablecoin } from "@stbr/sss-token";
import { Logger } from "@sss/shared";
import {
  createMintRequest,
  createBurnRequest,
  findMintRequestByIdempotencyKey,
  findBurnRequestByIdempotencyKey,
  updateMintRequest,
  updateBurnRequest,
  MintRequest,
  BurnRequest,
} from "./repository";

interface MintBurnServiceOptions {
  connection: Connection;
  mintPubkey: string;
  minterKeypair: Keypair;
  burnerKeypair: Keypair;
  complianceServiceUrl?: string;
  screenBeforeMint?: boolean;
  logger: Logger;
}

export class MintBurnService {
  constructor(private readonly opts: MintBurnServiceOptions) {}

  async mint(params: {
    recipient: string;
    amount: string;
    idempotencyKey?: string;
  }): Promise<MintRequest> {
    const { recipient, amount, idempotencyKey } = params;
    const { connection, mintPubkey, minterKeypair, logger } = this.opts;

    // Idempotency check
    if (idempotencyKey) {
      const existing = await findMintRequestByIdempotencyKey(idempotencyKey);
      if (existing) {
        logger.info({ id: existing.id, idempotencyKey }, "Returning existing mint request");
        return existing;
      }
    }

    // Validate recipient
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
    } catch {
      throw new Error(`Invalid recipient public key: ${recipient}`);
    }

    // Optional sanctions screening before mint
    if (this.opts.screenBeforeMint && this.opts.complianceServiceUrl) {
      await this.screenAddress(recipient);
    }

    const request = await createMintRequest({
      idempotencyKey,
      mint: mintPubkey,
      recipient,
      amount,
    });

    logger.info({ id: request.id, recipient, amount }, "Executing mint");

    try {
      const stable = await SolanaStablecoin.load(
        connection,
        new PublicKey(mintPubkey),
        minterKeypair,
      );

      const txSig = await stable.mint({
        recipient: recipientPubkey,
        amount: BigInt(amount),
        minter: minterKeypair,
      });

      await updateMintRequest(request.id, { status: "confirmed", txSignature: txSig });
      logger.info({ id: request.id, txSig }, "Mint confirmed");

      return { ...request, status: "confirmed", tx_signature: txSig };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await updateMintRequest(request.id, { status: "failed", error: errorMsg });
      logger.error({ id: request.id, err }, "Mint failed");
      throw err;
    }
  }

  async burn(params: {
    from: string;
    amount: string;
    idempotencyKey?: string;
  }): Promise<BurnRequest> {
    const { from, amount, idempotencyKey } = params;
    const { connection, mintPubkey, burnerKeypair, logger } = this.opts;

    // Idempotency check
    if (idempotencyKey) {
      const existing = await findBurnRequestByIdempotencyKey(idempotencyKey);
      if (existing) {
        logger.info({ id: existing.id, idempotencyKey }, "Returning existing burn request");
        return existing;
      }
    }

    // Validate from ATA
    let fromAta: PublicKey;
    try {
      fromAta = new PublicKey(from);
    } catch {
      throw new Error(`Invalid from token account: ${from}`);
    }

    const request = await createBurnRequest({
      idempotencyKey,
      mint: mintPubkey,
      fromAccount: from,
      amount,
    });

    logger.info({ id: request.id, from, amount }, "Executing burn");

    try {
      const stable = await SolanaStablecoin.load(
        connection,
        new PublicKey(mintPubkey),
        burnerKeypair,
      );

      const txSig = await stable.burn({
        from: fromAta,
        amount: BigInt(amount),
        burner: burnerKeypair,
      });

      await updateBurnRequest(request.id, { status: "confirmed", txSignature: txSig });
      logger.info({ id: request.id, txSig }, "Burn confirmed");

      return { ...request, status: "confirmed", tx_signature: txSig };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await updateBurnRequest(request.id, { status: "failed", error: errorMsg });
      logger.error({ id: request.id, err }, "Burn failed");
      throw err;
    }
  }

  private async screenAddress(address: string): Promise<void> {
    const url = `${this.opts.complianceServiceUrl}/screen`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });

    if (!resp.ok) {
      throw new Error(`Compliance screening request failed: ${resp.status}`);
    }

    const data = (await resp.json()) as { result: "pass" | "flag" | "block" };

    if (data.result === "block") {
      throw new Error(`Address ${address} is blocked by sanctions screening`);
    }
  }
}
