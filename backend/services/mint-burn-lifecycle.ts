import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { SssClient, Preset } from "@solana-stablecoin-standard/sdk";
import pino from "pino";

const log = pino({ name: "sss-lifecycle" });

interface MintRequest {
  id: string;
  mint: PublicKey;
  destination: PublicKey;
  amount: bigint;
  requestedBy: string;
  approvedBy?: string;
  status: "pending" | "approved" | "executed" | "rejected" | "failed";
  createdAt: number;
  executedAt?: number;
  txSignature?: string;
  error?: string;
}

interface BurnRequest {
  id: string;
  mint: PublicKey;
  amount: bigint;
  requestedBy: string;
  approvedBy?: string;
  status: "pending" | "approved" | "executed" | "rejected" | "failed";
  createdAt: number;
  executedAt?: number;
  txSignature?: string;
  error?: string;
}

/**
 * Mint/burn lifecycle manager. Enforces approval workflows for
 * minting and burning operations, with audit trails.
 *
 * Flow:
 *   1. Operator requests mint/burn
 *   2. Approver (different role) approves
 *   3. Service executes on-chain
 *   4. Audit record stored
 *
 * For SSS-1 (simpler setups), you can skip the approval step and
 * execute directly.
 */
export class MintBurnLifecycle {
  private client: SssClient;
  private mintRequests: Map<string, MintRequest> = new Map();
  private burnRequests: Map<string, BurnRequest> = new Map();
  private requireApproval: boolean;

  constructor(client: SssClient, opts?: { requireApproval?: boolean }) {
    this.client = client;
    this.requireApproval = opts?.requireApproval ?? true;
  }

  /**
   * Request a mint operation. If approval is not required, executes immediately.
   */
  async requestMint(
    mint: PublicKey,
    destination: PublicKey,
    amount: bigint,
    requestedBy: string
  ): Promise<MintRequest> {
    const id = `mint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const request: MintRequest = {
      id,
      mint,
      destination,
      amount,
      requestedBy,
      status: "pending",
      createdAt: Date.now(),
    };

    this.mintRequests.set(id, request);
    log.info({ id, amount: amount.toString(), destination: destination.toBase58() }, "Mint requested");

    if (!this.requireApproval) {
      return this.executeMint(id, requestedBy);
    }

    return request;
  }

  /**
   * Approve and execute a pending mint request.
   */
  async approveMint(requestId: string, approvedBy: string): Promise<MintRequest> {
    const request = this.mintRequests.get(requestId);
    if (!request) throw new Error(`Mint request ${requestId} not found`);
    if (request.status !== "pending") {
      throw new Error(`Request ${requestId} is ${request.status}, not pending`);
    }

    request.approvedBy = approvedBy;
    request.status = "approved";

    return this.executeMint(requestId, approvedBy);
  }

  /**
   * Reject a pending mint request.
   */
  rejectMint(requestId: string, rejectedBy: string): MintRequest {
    const request = this.mintRequests.get(requestId);
    if (!request) throw new Error(`Mint request ${requestId} not found`);
    if (request.status !== "pending") {
      throw new Error(`Request ${requestId} is ${request.status}, not pending`);
    }

    request.status = "rejected";
    request.approvedBy = rejectedBy;
    log.info({ id: requestId }, "Mint request rejected");
    return request;
  }

  /**
   * Request a burn operation.
   */
  async requestBurn(
    mint: PublicKey,
    amount: bigint,
    requestedBy: string
  ): Promise<BurnRequest> {
    const id = `burn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const request: BurnRequest = {
      id,
      mint,
      amount,
      requestedBy,
      status: "pending",
      createdAt: Date.now(),
    };

    this.burnRequests.set(id, request);
    log.info({ id, amount: amount.toString() }, "Burn requested");

    if (!this.requireApproval) {
      return this.executeBurn(id, requestedBy);
    }

    return request;
  }

  /**
   * Approve and execute a pending burn request.
   */
  async approveBurn(requestId: string, approvedBy: string): Promise<BurnRequest> {
    const request = this.burnRequests.get(requestId);
    if (!request) throw new Error(`Burn request ${requestId} not found`);
    if (request.status !== "pending") {
      throw new Error(`Request ${requestId} is ${request.status}, not pending`);
    }

    request.approvedBy = approvedBy;
    request.status = "approved";

    return this.executeBurn(requestId, approvedBy);
  }

  /**
   * Get all pending requests (mint + burn).
   */
  getPendingRequests(): { mints: MintRequest[]; burns: BurnRequest[] } {
    return {
      mints: Array.from(this.mintRequests.values()).filter(
        (r) => r.status === "pending"
      ),
      burns: Array.from(this.burnRequests.values()).filter(
        (r) => r.status === "pending"
      ),
    };
  }

  /**
   * Get full audit trail for a specific request.
   */
  getRequest(id: string): MintRequest | BurnRequest | undefined {
    return this.mintRequests.get(id) ?? this.burnRequests.get(id);
  }

  private async executeMint(requestId: string, executor: string): Promise<MintRequest> {
    const request = this.mintRequests.get(requestId)!;

    try {
      const sig = await this.client.mint(
        request.mint,
        request.destination,
        request.amount
      );

      request.status = "executed";
      request.executedAt = Date.now();
      request.txSignature = sig;

      log.info(
        { id: requestId, signature: sig },
        "Mint executed"
      );
    } catch (err: any) {
      request.status = "failed";
      request.error = err.message;

      log.error(
        { id: requestId, error: err.message },
        "Mint execution failed"
      );
    }

    return request;
  }

  private async executeBurn(requestId: string, executor: string): Promise<BurnRequest> {
    const request = this.burnRequests.get(requestId)!;

    try {
      const sig = await this.client.burn(request.mint, request.amount);

      request.status = "executed";
      request.executedAt = Date.now();
      request.txSignature = sig;

      log.info({ id: requestId, signature: sig }, "Burn executed");
    } catch (err: any) {
      request.status = "failed";
      request.error = err.message;

      log.error({ id: requestId, error: err.message }, "Burn execution failed");
    }

    return request;
  }
}
