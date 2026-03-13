import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { v4 as uuidv4 } from "uuid";
import { logger } from "./logger";

export type MintBurnStatus = "pending" | "verifying" | "executing" | "completed" | "failed";

export interface MintBurnRequest {
  id: string;
  type: "mint" | "burn";
  amount: string;
  recipient?: string;
  status: MintBurnStatus;
  signature?: string;
  createdAt: Date;
  updatedAt: Date;
  error?: string;
}

/**
 * Fiat-to-stablecoin lifecycle coordination service.
 * Manages request → verify → execute → log flow.
 */
export class MintBurnService {
  private requests: Map<string, MintBurnRequest> = new Map();

  constructor(
    private connection: Connection,
    private programId: PublicKey
  ) {}

  async createMintRequest(
    amount: string,
    recipient: string
  ): Promise<MintBurnRequest> {
    const request: MintBurnRequest = {
      id: uuidv4(),
      type: "mint",
      amount,
      recipient,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.requests.set(request.id, request);
    logger.info("Mint request created", { requestId: request.id, amount, recipient });

    return request;
  }

  async createBurnRequest(amount: string): Promise<MintBurnRequest> {
    const request: MintBurnRequest = {
      id: uuidv4(),
      type: "burn",
      amount,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.requests.set(request.id, request);
    logger.info("Burn request created", { requestId: request.id, amount });

    return request;
  }

  async updateRequestStatus(
    id: string,
    status: MintBurnStatus,
    signature?: string,
    error?: string
  ): Promise<MintBurnRequest | null> {
    const request = this.requests.get(id);
    if (!request) return null;

    request.status = status;
    request.updatedAt = new Date();
    if (signature) request.signature = signature;
    if (error) request.error = error;

    logger.info("Request status updated", {
      requestId: id,
      status,
      signature,
    });

    return request;
  }

  getRequest(id: string): MintBurnRequest | undefined {
    return this.requests.get(id);
  }

  listRequests(type?: "mint" | "burn"): MintBurnRequest[] {
    const all = Array.from(this.requests.values());
    if (type) return all.filter((r) => r.type === type);
    return all;
  }
}
