"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const anchor = __importStar(require("@coral-xyz/anchor"));
const chai_1 = require("chai");
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
describe("Solana Stablecoin Standard (SSS)", () => {
    anchor.setProvider(anchor.AnchorProvider.env());
    const provider = anchor.getProvider();
    // @ts-ignore
    const program = anchor.workspace.Sss;
    // @ts-ignore
    const transferHookProgram = anchor.workspace.TransferHook;
    // Accounts
    const masterAuthority = web3_js_1.Keypair.generate();
    const minter = web3_js_1.Keypair.generate();
    const blacklister = web3_js_1.Keypair.generate();
    const userA = web3_js_1.Keypair.generate();
    const userB = web3_js_1.Keypair.generate();
    const mintSss1 = web3_js_1.Keypair.generate();
    const mintSss2 = web3_js_1.Keypair.generate();
    const [configSss1] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("config"), mintSss1.publicKey.toBuffer()], program.programId);
    const [configSss2] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("config"), mintSss2.publicKey.toBuffer()], program.programId);
    const [roleSss1] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("role"), configSss1.toBuffer(), masterAuthority.publicKey.toBuffer()], program.programId);
    const [minterRoleSss1] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("role"), configSss1.toBuffer(), minter.publicKey.toBuffer()], program.programId);
    const [quotaSss1] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("quota"), configSss1.toBuffer(), minter.publicKey.toBuffer()], program.programId);
    before(async () => {
        // Airdrop SOL
        const airdrop = await provider.connection.requestAirdrop(masterAuthority.publicKey, 10 * 1e9);
        await provider.connection.confirmTransaction(airdrop);
        await provider.connection.requestAirdrop(minter.publicKey, 10 * 1e9);
        await provider.connection.requestAirdrop(blacklister.publicKey, 10 * 1e9);
    });
    describe("SSS-1 Minimal Stablecoin", () => {
        it("Initializes the Mint and Config correctly", async () => {
            const extensions = [];
            const mintLen = (0, spl_token_1.getMintLen)(extensions);
            const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);
            const tx = new anchor.web3.Transaction().add(web3_js_1.SystemProgram.createAccount({
                fromPubkey: masterAuthority.publicKey,
                newAccountPubkey: mintSss1.publicKey,
                space: mintLen,
                lamports,
                programId: spl_token_1.TOKEN_2022_PROGRAM_ID,
            }), (0, spl_token_1.createInitializeMintInstruction)(mintSss1.publicKey, 6, configSss1, configSss1, spl_token_1.TOKEN_2022_PROGRAM_ID));
            await provider.sendAndConfirm(tx, [masterAuthority, mintSss1]);
            // @ts-ignore
            await program.methods.initialize(false, false, false)
                .accounts({
                payer: masterAuthority.publicKey,
                config: configSss1,
                mint: mintSss1.publicKey,
                systemProgram: web3_js_1.SystemProgram.programId,
                tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
            })
                .signers([masterAuthority])
                .rpc();
            const configAccount = await program.account.stablecoinConfig.fetch(configSss1);
            chai_1.assert.ok(!configAccount.enablePermanentDelegate);
        });
        it("Grants Minter Role and Quota", async () => {
            // Update role
            // @ts-ignore
            await program.methods.updateRoles(minter.publicKey, true, false, false, false, false, false)
                .accounts({
                masterAuthority: masterAuthority.publicKey,
                config: configSss1,
                roleRegistry: minterRoleSss1,
                systemProgram: web3_js_1.SystemProgram.programId,
            })
                .signers([masterAuthority])
                .rpc();
            // Set Quota to 1000
            const BN = require('bn.js');
            // @ts-ignore
            await program.methods.updateQuota(minter.publicKey, new BN(1000))
                .accounts({
                masterAuthority: masterAuthority.publicKey,
                config: configSss1,
                quota: quotaSss1,
                systemProgram: web3_js_1.SystemProgram.programId,
            })
                .signers([masterAuthority])
                .rpc();
            const quotaAcc = await program.account.minterQuota.fetch(quotaSss1);
            chai_1.assert.equal(quotaAcc.limit.toNumber(), 1000);
        });
        it("Rejects mints exceeding quota", async () => {
            const BN = require('bn.js');
            try {
                // @ts-ignore
                await program.methods.mintToken(new BN(5000))
                    .accounts({
                    minter: minter.publicKey,
                    config: configSss1,
                    roleRegistry: minterRoleSss1,
                    quota: quotaSss1,
                    mint: mintSss1.publicKey,
                    to: mintSss1.publicKey, // dummy
                    tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
                })
                    .signers([minter])
                    .rpc();
                chai_1.assert.fail("Should have thrown QuotaExceeded error");
            }
            catch (err) {
                chai_1.assert.include(err.message, "QuotaExceeded");
            }
        });
    });
    describe("SSS-2 Compliant Stablecoin", () => {
        it("Validates transfer hook and delegate enablement at initialization", async () => {
            const extensions = [spl_token_1.ExtensionType.PermanentDelegate, spl_token_1.ExtensionType.TransferHook];
            const mintLen = (0, spl_token_1.getMintLen)(extensions);
            const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);
            const tx = new anchor.web3.Transaction().add(web3_js_1.SystemProgram.createAccount({
                fromPubkey: masterAuthority.publicKey,
                newAccountPubkey: mintSss2.publicKey,
                space: mintLen,
                lamports,
                programId: spl_token_1.TOKEN_2022_PROGRAM_ID,
            }), (0, spl_token_1.createInitializePermanentDelegateInstruction)(mintSss2.publicKey, configSss2, spl_token_1.TOKEN_2022_PROGRAM_ID), 
            // using empty hook program temporarily to validate SSS structure
            (0, spl_token_1.createInitializeTransferHookInstruction)(mintSss2.publicKey, configSss2, program.programId, spl_token_1.TOKEN_2022_PROGRAM_ID), (0, spl_token_1.createInitializeMintInstruction)(mintSss2.publicKey, 6, configSss2, configSss2, spl_token_1.TOKEN_2022_PROGRAM_ID));
            await provider.sendAndConfirm(tx, [masterAuthority, mintSss2]);
            // @ts-ignore
            await program.methods.initialize(true, true, false)
                .accounts({
                payer: masterAuthority.publicKey,
                config: configSss2,
                mint: mintSss2.publicKey,
                systemProgram: web3_js_1.SystemProgram.programId,
                tokenProgram: spl_token_1.TOKEN_2022_PROGRAM_ID,
            })
                .signers([masterAuthority])
                .rpc();
            const configAccount = await program.account.stablecoinConfig.fetch(configSss2);
            chai_1.assert.ok(configAccount.enableTransferHook);
            chai_1.assert.ok(configAccount.enablePermanentDelegate);
        });
        it("Adds a user to the blacklist correctly", async () => {
            const [blacklisterRole] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("role"), configSss2.toBuffer(), blacklister.publicKey.toBuffer()], program.programId);
            // Assign Blacklister Role
            // @ts-ignore
            await program.methods.updateRoles(blacklister.publicKey, false, false, false, true, false, false)
                .accounts({
                masterAuthority: masterAuthority.publicKey,
                config: configSss2,
                roleRegistry: blacklisterRole,
                systemProgram: web3_js_1.SystemProgram.programId,
            })
                .signers([masterAuthority])
                .rpc();
            const [blacklistRecord] = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("blacklist"), configSss2.toBuffer(), userA.publicKey.toBuffer()], program.programId);
            // Add to blacklist
            // @ts-ignore
            await program.methods.addToBlacklist(userA.publicKey, "Sanctions hit")
                .accounts({
                blacklister: blacklister.publicKey,
                config: configSss2,
                roleRegistry: blacklisterRole,
                blacklistRecord,
                systemProgram: web3_js_1.SystemProgram.programId,
            })
                .signers([blacklister])
                .rpc();
            const record = await program.account.blacklistRegistry.fetch(blacklistRecord);
            chai_1.assert.equal(record.reason, "Sanctions hit");
        });
    });
});
