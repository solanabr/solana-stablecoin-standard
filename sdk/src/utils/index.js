"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRANSFER_HOOK_PROGRAM_ID = exports.SSS_TOKEN_PROGRAM_ID = void 0;
exports.findStatePDA = findStatePDA;
exports.findMintAuthorityPDA = findMintAuthorityPDA;
exports.findFreezeAuthorityPDA = findFreezeAuthorityPDA;
exports.findPermanentDelegatePDA = findPermanentDelegatePDA;
exports.findMinterInfoPDA = findMinterInfoPDA;
exports.findBlacklistEntryPDA = findBlacklistEntryPDA;
exports.findExtraAccountMetaListPDA = findExtraAccountMetaListPDA;
exports.createMintWithExtensions = createMintWithExtensions;
exports.getOrCreateTokenAccount = getOrCreateTokenAccount;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
exports.SSS_TOKEN_PROGRAM_ID = new web3_js_1.PublicKey("6NMdvUa2n4WSLPx9yz7V9edFx9VQqWr5KUDZQGPK3GDL");
// Transfer hook program ID — SSS-2 blacklist enforcement
exports.TRANSFER_HOOK_PROGRAM_ID = new web3_js_1.PublicKey("C6psRvWLQ4PyiRcx7KZw5giAhNFtTMLn2foBaToJ36V");
// ─── PDA derivation ───────────────────────────────────────────────────────────
function findStatePDA(mintPubkey) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("stablecoin"), mintPubkey.toBuffer()], exports.SSS_TOKEN_PROGRAM_ID);
}
function findMintAuthorityPDA(statePubkey) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("mint_authority"), statePubkey.toBuffer()], exports.SSS_TOKEN_PROGRAM_ID);
}
function findFreezeAuthorityPDA(statePubkey) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("freeze_authority"), statePubkey.toBuffer()], exports.SSS_TOKEN_PROGRAM_ID);
}
function findPermanentDelegatePDA(statePubkey) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("permanent_delegate"), statePubkey.toBuffer()], exports.SSS_TOKEN_PROGRAM_ID);
}
function findMinterInfoPDA(statePubkey, minterPubkey) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("minter"), statePubkey.toBuffer(), minterPubkey.toBuffer()], exports.SSS_TOKEN_PROGRAM_ID);
}
function findBlacklistEntryPDA(statePubkey, addressPubkey) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("blacklist"), statePubkey.toBuffer(), addressPubkey.toBuffer()], exports.SSS_TOKEN_PROGRAM_ID);
}
function findExtraAccountMetaListPDA(mintPubkey) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("extra-account-metas"), mintPubkey.toBuffer()], exports.TRANSFER_HOOK_PROGRAM_ID);
}
/**
 * Creates a Token-2022 mint with all required extensions pre-allocated.
 * Must be called before `initialize` on the SSS-token program.
 */
async function createMintWithExtensions(params) {
    const { connection, payer, mintKeypair, decimals, mintAuthority, freezeAuthority, enablePermanentDelegate, permanentDelegateKey, enableTransferHook, transferHookProgramId, defaultAccountFrozen, metadataPointerAuthority, } = params;
    const extensions = [spl_token_1.ExtensionType.MetadataPointer];
    if (defaultAccountFrozen) {
        extensions.push(spl_token_1.ExtensionType.DefaultAccountState);
    }
    if (enablePermanentDelegate) {
        extensions.push(spl_token_1.ExtensionType.PermanentDelegate);
    }
    if (enableTransferHook) {
        extensions.push(spl_token_1.ExtensionType.TransferHook);
    }
    extensions.push(spl_token_1.ExtensionType.MintCloseAuthority);
    const mintLen = (0, spl_token_1.getMintLen)(extensions);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);
    const tx = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: mintLen,
        lamports,
        programId: spl_token_1.TOKEN_2022_PROGRAM_ID,
    }), (0, spl_token_1.createInitializeMetadataPointerInstruction)(mintKeypair.publicKey, metadataPointerAuthority, mintKeypair.publicKey, // metadata stored in mint
    spl_token_1.TOKEN_2022_PROGRAM_ID));
    if (defaultAccountFrozen) {
        tx.add((0, spl_token_1.createInitializeDefaultAccountStateInstruction)(mintKeypair.publicKey, spl_token_1.AccountState.Frozen, spl_token_1.TOKEN_2022_PROGRAM_ID));
    }
    if (enablePermanentDelegate && permanentDelegateKey) {
        tx.add((0, spl_token_1.createInitializePermanentDelegateInstruction)(mintKeypair.publicKey, permanentDelegateKey, spl_token_1.TOKEN_2022_PROGRAM_ID));
    }
    if (enableTransferHook && transferHookProgramId) {
        tx.add((0, spl_token_1.createInitializeTransferHookInstruction)(mintKeypair.publicKey, mintAuthority, transferHookProgramId, spl_token_1.TOKEN_2022_PROGRAM_ID));
    }
    tx.add((0, spl_token_1.createInitializeMintCloseAuthorityInstruction)(mintKeypair.publicKey, mintAuthority, spl_token_1.TOKEN_2022_PROGRAM_ID), (0, spl_token_1.createInitializeMintInstruction)(mintKeypair.publicKey, decimals, mintAuthority, freezeAuthority, spl_token_1.TOKEN_2022_PROGRAM_ID));
    return (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [payer, mintKeypair]);
}
// ─── Token account helpers ────────────────────────────────────────────────────
async function getOrCreateTokenAccount(connection, payer, mint, owner) {
    const ata = (0, spl_token_1.getAssociatedTokenAddressSync)(mint, owner, false, spl_token_1.TOKEN_2022_PROGRAM_ID);
    const info = await connection.getAccountInfo(ata);
    if (!info) {
        const tx = new web3_js_1.Transaction().add((0, spl_token_1.createAssociatedTokenAccountInstruction)(payer.publicKey, ata, owner, mint, spl_token_1.TOKEN_2022_PROGRAM_ID));
        await (0, web3_js_1.sendAndConfirmTransaction)(connection, tx, [payer]);
    }
    return ata;
}
