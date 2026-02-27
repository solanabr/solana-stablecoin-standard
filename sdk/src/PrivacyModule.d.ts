import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Program, BN } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { SDKResult, ConfidentialAccount, AllowlistEntry, RangeProof, ElGamalPubkey } from "./types";
export declare class PrivacyModule {
    private connection;
    private provider;
    private program;
    constructor(connection: Connection, wallet?: anchor.Wallet);
    initialize(program: Program): this;
    getConfidentialityConfigPDA(stablecoin: PublicKey): PublicKey;
    getElGamalRegistryPDA(stablecoin: PublicKey, owner: PublicKey): PublicKey;
    getConfidentialAccountPDA(stablecoin: PublicKey, owner: PublicKey): PublicKey;
    getRangeProofVerifierPDA(stablecoin: PublicKey): PublicKey;
    getAllowlistPDA(stablecoin: PublicKey, address: PublicKey): PublicKey;
    getAuditorPDA(stablecoin: PublicKey): PublicKey;
    enableConfidentialTransfers(params: {
        stablecoin: PublicKey;
        authority: Keypair;
        auditor?: PublicKey;
        requireAllowlist?: boolean;
        maxBalance?: BN;
    }): Promise<SDKResult<{
        signature: string;
        config: PublicKey;
    }>>;
    createConfidentialAccount(params: {
        mint: PublicKey;
        owner: Keypair;
        elgamalPubkey?: ElGamalPubkey;
    }): Promise<SDKResult<{
        account: PublicKey;
        elgamalRegistry: PublicKey;
        signature: string;
    }>>;
    getConfidentialAccount(confidentialAccount: PublicKey): Promise<SDKResult<ConfidentialAccount>>;
    confidentialTransfer(params: {
        source: PublicKey;
        destination: PublicKey;
        mint: PublicKey;
        amount: BN;
        authority: Keypair;
        proofData?: RangeProof;
        auditorDecryptionKey?: Buffer;
    }): Promise<SDKResult<{
        signature: string;
    }>>;
    depositToConfidential(params: {
        tokenAccount: PublicKey;
        confidentialAccount: PublicKey;
        mint: PublicKey;
        amount: BN;
        authority: Keypair;
    }): Promise<SDKResult<{
        signature: string;
    }>>;
    withdrawFromConfidential(params: {
        confidentialAccount: PublicKey;
        tokenAccount: PublicKey;
        mint: PublicKey;
        amount: BN;
        authority: Keypair;
        decryptionKey: Buffer;
    }): Promise<SDKResult<{
        signature: string;
    }>>;
    addToAllowlist(params: {
        stablecoin: PublicKey;
        address: PublicKey;
        authority: Keypair;
        reason?: string;
        expiry?: BN;
    }): Promise<SDKResult<{
        signature: string;
        entry: PublicKey;
    }>>;
    removeFromAllowlist(params: {
        stablecoin: PublicKey;
        address: PublicKey;
        authority: Keypair;
    }): Promise<SDKResult<{
        signature: string;
    }>>;
    isAddressAllowed(stablecoin: PublicKey, address: PublicKey): Promise<SDKResult<{
        isAllowed: boolean;
        entry?: AllowlistEntry;
    }>>;
    getAllowlist(stablecoin: PublicKey): Promise<SDKResult<{
        addresses: Array<{
            address: PublicKey;
            reason: string;
            expiry?: number;
        }>;
    }>>;
    setAuditor(params: {
        stablecoin: PublicKey;
        auditor: PublicKey;
        auditorPubkey: Buffer;
        authority: Keypair;
    }): Promise<SDKResult<{
        signature: string;
    }>>;
    encryptAmount(amount: BN, recipientPubkey: Buffer): {
        encrypted: Buffer;
        commitment: Buffer;
    };
    generateRangeProof(amount: BN, min?: BN, max?: BN): RangeProof;
}
export declare function generateElGamalKeypair(): {
    publicKey: Buffer;
    privateKey: Buffer;
};
export default PrivacyModule;
