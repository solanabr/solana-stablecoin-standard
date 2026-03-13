import type { PublicKey } from "@solana/web3.js";

export interface ComplianceProofInput {
  subject: PublicKey;
  nullifier: string;
  proofCommitment: string;
  complianceRoot: string;
  circuit: string;
  expiresAtSlot?: number;
}

export interface ComplianceBackend {
  blacklistAdd(address: PublicKey, reason: string): Promise<string>;
  blacklistRemove(address: PublicKey): Promise<string>;
  seize(fromAccount: PublicKey, toAccount: PublicKey): Promise<string>;
  submitProofReceipt(input: ComplianceProofInput): Promise<string>;
  setCompressedStateRoot(root: string): Promise<string>;
}

export class ComplianceClient {
  public constructor(
    private readonly enabled: boolean,
    private readonly backend: ComplianceBackend
  ) {}

  public async blacklistAdd(address: PublicKey, reason: string): Promise<string> {
    this.assertEnabled();
    return this.backend.blacklistAdd(address, reason);
  }

  public async blacklistRemove(address: PublicKey): Promise<string> {
    this.assertEnabled();
    return this.backend.blacklistRemove(address);
  }

  public async seize(fromAccount: PublicKey, toAccount: PublicKey): Promise<string> {
    this.assertEnabled();
    return this.backend.seize(fromAccount, toAccount);
  }

  public async submitProofReceipt(input: ComplianceProofInput): Promise<string> {
    this.assertEnabled();
    return this.backend.submitProofReceipt(input);
  }

  public async setCompressedStateRoot(root: string): Promise<string> {
    this.assertEnabled();
    return this.backend.setCompressedStateRoot(root);
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new Error("ComplianceNotEnabled");
    }
  }
}
