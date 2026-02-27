import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { SDKResult } from "./types";
/**
 * Multisig module for SSS-1 governance
 */
export declare class MultisigModule {
    private connection;
    private programId;
    constructor(connection: Connection, programId?: PublicKey);
    /**
     * Get Multisig Config PDA
     */
    getMultisigConfigPDA(stablecoin: PublicKey): PublicKey;
    /**
     * Get Proposal PDA
     */
    getProposalPDA(multisigConfig: PublicKey, proposer: PublicKey): PublicKey;
    /**
     * Initialize multisig config
     */
    initializeMultisig(authority: Keypair, stablecoin: PublicKey, threshold: number, signers: PublicKey[]): Promise<SDKResult>;
    /**
     * Create multisig proposal
     */
    createProposal(proposer: Keypair, stablecoin: PublicKey, instructionData: Buffer, expiresIn: number): Promise<SDKResult>;
    /**
     * Approve multisig proposal
     */
    approveProposal(signer: Keypair, stablecoin: PublicKey, proposal: PublicKey): Promise<SDKResult>;
    /**
     * Execute multisig proposal
     */
    executeProposal(executor: Keypair, stablecoin: PublicKey, proposal: PublicKey): Promise<SDKResult>;
    /**
     * Get proposal status
     */
    getProposalStatus(proposal: PublicKey): Promise<SDKResult>;
}
//# sourceMappingURL=MultisigModule.d.ts.map