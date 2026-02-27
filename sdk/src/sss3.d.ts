import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
export declare const SSS3_PRESET: {
    readonly name: "SSS-3 Private Stablecoin";
    readonly preset: "sss-3";
    readonly decimals: 6;
    readonly enableConfidentialTransfers: true;
    readonly maxConfidentialBalance: BN;
    readonly requireAllowlist: false;
    readonly enableTransferFees: true;
    readonly transferFeeBasisPoints: 100;
    readonly maxTransferFee: BN;
    readonly enablePermanentDelegate: true;
    readonly enableBlacklist: true;
    readonly auditor: {
        readonly enabled: false;
        readonly pubkey: PublicKey | null;
    };
    readonly rangeProof: {
        readonly minAmount: BN;
        readonly maxAmount: BN;
        readonly bitSize: 32 | 64;
    };
    readonly transferTimeoutSeconds: 0;
};
export declare const SSS3_HIGH_PRIVACY_PRESET: {
    readonly name: "SSS-3 High Privacy";
    readonly preset: "sss-3-high";
    readonly requireAllowlist: true;
    readonly maxConfidentialBalance: BN;
    readonly auditor: {
        readonly enabled: true;
        readonly pubkey: PublicKey | null;
    };
    readonly decimals: 6;
    readonly enableConfidentialTransfers: true;
    readonly enableTransferFees: true;
    readonly transferFeeBasisPoints: 100;
    readonly maxTransferFee: BN;
    readonly enablePermanentDelegate: true;
    readonly enableBlacklist: true;
    readonly rangeProof: {
        readonly minAmount: BN;
        readonly maxAmount: BN;
        readonly bitSize: 32 | 64;
    };
    readonly transferTimeoutSeconds: 0;
};
export declare const SSS3_COMPLIANT_PRESET: {
    readonly name: "SSS-3 Compliant";
    readonly preset: "sss-3-compliant";
    readonly requireAllowlist: true;
    readonly transferFeeBasisPoints: 200;
    readonly maxTransferFee: BN;
    readonly rangeProof: {
        readonly minAmount: BN;
        readonly maxAmount: BN;
        readonly bitSize: 32 | 64;
    };
    readonly auditor: {
        readonly enabled: true;
        readonly pubkey: PublicKey | null;
    };
    readonly decimals: 6;
    readonly enableConfidentialTransfers: true;
    readonly maxConfidentialBalance: BN;
    readonly enableTransferFees: true;
    readonly enablePermanentDelegate: true;
    readonly enableBlacklist: true;
    readonly transferTimeoutSeconds: 0;
};
export declare function createSSS3Params(name: string, symbol: string, authority: PublicKey, presetVariant?: "default" | "high-privacy" | "compliant"): {
    name: string;
    symbol: string;
    decimals: 6;
    authority: PublicKey;
    enableConfidentialTransfers: true;
    enablePermanentDelegate: true;
    enableTransferHook: true;
    requireAllowlist: boolean;
    maxConfidentialBalance: BN;
    transferFeeBasisPoints: 100 | 200;
    maxTransferFee: BN;
    enableBlacklist: true;
};
export declare function isSSS3(features: number): boolean;
export declare function encodeSSS3Features(): number;
export declare function decodeSSS3Features(features: number): string[];
export declare const SSS3_FEATURE_DESCRIPTIONS: Record<number, string>;
export declare function validateSSS3Params(params: {
    maxConfidentialBalance?: BN;
    transferFeeBasisPoints?: number;
    requireAllowlist?: boolean;
    auditorPubkey?: PublicKey | null;
}): {
    valid: boolean;
    errors: string[];
};
export declare const SSS3_INIT_STEPS: readonly ["1. Initialize base stablecoin (SSS-1)", "2. Configure transfer hook (SSS-2)", "3. Enable confidential transfers (SSS-3)", "4. Create range proof verifier", "5. Set auditor (optional)", "6. Configure allowlist", "7. Create confidential accounts"];
export default SSS3_PRESET;
