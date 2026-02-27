"use strict";
// SSS-3 (Private Stablecoin) Preset
// Confidential transfers with privacy-preserving compliance
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSS3_INIT_STEPS = exports.SSS3_FEATURE_DESCRIPTIONS = exports.SSS3_COMPLIANT_PRESET = exports.SSS3_HIGH_PRIVACY_PRESET = exports.SSS3_PRESET = void 0;
exports.createSSS3Params = createSSS3Params;
exports.isSSS3 = isSSS3;
exports.encodeSSS3Features = encodeSSS3Features;
exports.decodeSSS3Features = decodeSSS3Features;
exports.validateSSS3Params = validateSSS3Params;
const anchor_1 = require("@coral-xyz/anchor");
// Default SSS-3 config
exports.SSS3_PRESET = {
    name: "SSS-3 Private Stablecoin",
    preset: "sss-3",
    decimals: 6,
    enableConfidentialTransfers: true,
    maxConfidentialBalance: new anchor_1.BN(0), // unlimited
    requireAllowlist: false,
    enableTransferFees: true,
    transferFeeBasisPoints: 100, // 1%
    maxTransferFee: new anchor_1.BN(100000000), // 100 tokens
    enablePermanentDelegate: true,
    enableBlacklist: true,
    auditor: {
        enabled: false,
        pubkey: null,
    },
    rangeProof: {
        minAmount: new anchor_1.BN(1),
        maxAmount: new anchor_1.BN(0), // unlimited
        bitSize: 32,
    },
    transferTimeoutSeconds: 0,
};
// High privacy preset
exports.SSS3_HIGH_PRIVACY_PRESET = {
    ...exports.SSS3_PRESET,
    name: "SSS-3 High Privacy",
    preset: "sss-3-high",
    requireAllowlist: true,
    maxConfidentialBalance: new anchor_1.BN(1000000000000), // 1M tokens
    auditor: {
        enabled: true,
        pubkey: null,
    },
};
// Compliant preset
exports.SSS3_COMPLIANT_PRESET = {
    ...exports.SSS3_PRESET,
    name: "SSS-3 Compliant",
    preset: "sss-3-compliant",
    requireAllowlist: true,
    transferFeeBasisPoints: 200, // 2%
    maxTransferFee: new anchor_1.BN(500000000), // 500 tokens
    rangeProof: {
        minAmount: new anchor_1.BN(1000000), // min 1 token
        maxAmount: new anchor_1.BN(1000000000000), // max 1M tokens
        bitSize: 64,
    },
    auditor: {
        enabled: true,
        pubkey: null,
    },
};
// Create init params
function createSSS3Params(name, symbol, authority, presetVariant = "default") {
    const base = presetVariant === "high-privacy"
        ? exports.SSS3_HIGH_PRIVACY_PRESET
        : presetVariant === "compliant"
            ? exports.SSS3_COMPLIANT_PRESET
            : exports.SSS3_PRESET;
    return {
        name,
        symbol,
        decimals: base.decimals,
        authority,
        enableConfidentialTransfers: base.enableConfidentialTransfers,
        enablePermanentDelegate: base.enablePermanentDelegate,
        enableTransferHook: base.enableTransferFees,
        requireAllowlist: base.requireAllowlist,
        maxConfidentialBalance: base.maxConfidentialBalance,
        transferFeeBasisPoints: base.transferFeeBasisPoints,
        maxTransferFee: base.maxTransferFee,
        enableBlacklist: base.enableBlacklist,
    };
}
// Check if features include SSS-3
function isSSS3(features) {
    return (features & 16) !== 0;
}
// Encode SSS-3 features
function encodeSSS3Features() {
    let features = 0;
    features |= 1; // transfer hook
    features |= 2; // permanent delegate
    features |= 4; // mint close authority
    features |= 8; // default account state
    features |= 16; // confidential transfers
    return features;
}
// Decode features to names
function decodeSSS3Features(features) {
    const names = [];
    if (features & 1)
        names.push("Transfer Hook");
    if (features & 2)
        names.push("Permanent Delegate");
    if (features & 4)
        names.push("Mint Close Authority");
    if (features & 8)
        names.push("Default Account State");
    if (features & 16)
        names.push("Confidential Transfers");
    if (features & 32)
        names.push("Auditor");
    if (features & 64)
        names.push("Allowlist Required");
    return names;
}
// Feature descriptions
exports.SSS3_FEATURE_DESCRIPTIONS = {
    16: "Confidential transfers using Token-2022 with ElGamal encryption",
    32: "Auditor with decryption capability for regulatory compliance",
    64: "Allowlist enforcement for confidential transfers",
};
// Validate params
function validateSSS3Params(params) {
    const errors = [];
    if (params.transferFeeBasisPoints !== undefined) {
        if (params.transferFeeBasisPoints > 10000) {
            errors.push("Transfer fee basis points must be <= 10000 (100%)");
        }
    }
    if (params.auditorPubkey !== undefined && params.auditorPubkey !== null) {
        if (params.auditorPubkey.toString().length !== 44) {
            errors.push("Invalid auditor public key");
        }
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
// Init steps
exports.SSS3_INIT_STEPS = [
    "1. Initialize base stablecoin (SSS-1)",
    "2. Configure transfer hook (SSS-2)",
    "3. Enable confidential transfers (SSS-3)",
    "4. Create range proof verifier",
    "5. Set auditor (optional)",
    "6. Configure allowlist",
    "7. Create confidential accounts",
];
exports.default = exports.SSS3_PRESET;
