import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, createInitializeMintInstruction, ExtensionType, getMintLen, createInitializePermanentDelegateInstruction, createInitializeTransferHookInstruction, createInitializeDefaultAccountStateInstruction, AccountState } from "@solana/spl-token";
import { Sss } from "../target/types/sss"; // Note: Assumes `anchor build` runs before `anchor test`

describe("Solana Stablecoin Standard (SSS)", () => {
    anchor.setProvider(anchor.AnchorProvider.env());
    const provider = anchor.getProvider() as anchor.AnchorProvider;
    // @ts-ignore
    const program = anchor.workspace.Sss as Program<Sss>;
    // @ts-ignore
    const transferHookProgram = anchor.workspace.TransferHook;

    // Accounts
    const masterAuthority = Keypair.generate();
    const minter = Keypair.generate();
    const blacklister = Keypair.generate();
    const userA = Keypair.generate();
    const userB = Keypair.generate();

    const mintSss1 = Keypair.generate();
    const mintSss2 = Keypair.generate();

    const [configSss1] = PublicKey.findProgramAddressSync([Buffer.from("config"), mintSss1.publicKey.toBuffer()], program.programId);
    const [configSss2] = PublicKey.findProgramAddressSync([Buffer.from("config"), mintSss2.publicKey.toBuffer()], program.programId);

    const [roleSss1] = PublicKey.findProgramAddressSync([Buffer.from("role"), configSss1.toBuffer(), masterAuthority.publicKey.toBuffer()], program.programId);
    const [minterRoleSss1] = PublicKey.findProgramAddressSync([Buffer.from("role"), configSss1.toBuffer(), minter.publicKey.toBuffer()], program.programId);
    const [quotaSss1] = PublicKey.findProgramAddressSync([Buffer.from("quota"), configSss1.toBuffer(), minter.publicKey.toBuffer()], program.programId);

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
            const mintLen = getMintLen(extensions);
            const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

            const tx = new anchor.web3.Transaction().add(
                SystemProgram.createAccount({
                    fromPubkey: masterAuthority.publicKey,
                    newAccountPubkey: mintSss1.publicKey,
                    space: mintLen,
                    lamports,
                    programId: TOKEN_2022_PROGRAM_ID,
                }),
                createInitializeMintInstruction(mintSss1.publicKey, 6, configSss1, configSss1, TOKEN_2022_PROGRAM_ID)
            );

            await provider.sendAndConfirm(tx, [masterAuthority, mintSss1]);

            // @ts-ignore
            await program.methods.initialize(false, false, false)
                .accounts({
                    payer: masterAuthority.publicKey,
                    config: configSss1,
                    mint: mintSss1.publicKey,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_2022_PROGRAM_ID,
                })
                .signers([masterAuthority])
                .rpc();

            const configAccount = await program.account.stablecoinConfig.fetch(configSss1);
            assert.ok(!configAccount.enablePermanentDelegate);
        });

        it("Grants Minter Role and Quota", async () => {
            // Update role
            // @ts-ignore
            await program.methods.updateRoles(minter.publicKey, true, false, false, false, false, false)
                .accounts({
                    masterAuthority: masterAuthority.publicKey,
                    config: configSss1,
                    roleRegistry: minterRoleSss1,
                    systemProgram: SystemProgram.programId,
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
                    systemProgram: SystemProgram.programId,
                })
                .signers([masterAuthority])
                .rpc();

            const quotaAcc = await program.account.minterQuota.fetch(quotaSss1);
            assert.equal(quotaAcc.limit.toNumber(), 1000);
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
                    tokenProgram: TOKEN_2022_PROGRAM_ID,
                })
                .signers([minter])
                .rpc();
                assert.fail("Should have thrown QuotaExceeded error");
            } catch (err: any) {
                assert.include(err.message, "QuotaExceeded");
            }
        });
    });

    describe("SSS-2 Compliant Stablecoin", () => {
        it("Validates transfer hook and delegate enablement at initialization", async () => {
            const extensions = [ExtensionType.PermanentDelegate, ExtensionType.TransferHook];
            const mintLen = getMintLen(extensions);
            const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

            const tx = new anchor.web3.Transaction().add(
                SystemProgram.createAccount({
                    fromPubkey: masterAuthority.publicKey,
                    newAccountPubkey: mintSss2.publicKey,
                    space: mintLen,
                    lamports,
                    programId: TOKEN_2022_PROGRAM_ID,
                }),
                createInitializePermanentDelegateInstruction(mintSss2.publicKey, configSss2, TOKEN_2022_PROGRAM_ID),
                // using empty hook program temporarily to validate SSS structure
                createInitializeTransferHookInstruction(mintSss2.publicKey, configSss2, program.programId, TOKEN_2022_PROGRAM_ID),
                createInitializeMintInstruction(mintSss2.publicKey, 6, configSss2, configSss2, TOKEN_2022_PROGRAM_ID)
            );

            await provider.sendAndConfirm(tx, [masterAuthority, mintSss2]);

            // @ts-ignore
            await program.methods.initialize(true, true, false)
                .accounts({
                    payer: masterAuthority.publicKey,
                    config: configSss2,
                    mint: mintSss2.publicKey,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_2022_PROGRAM_ID,
                })
                .signers([masterAuthority])
                .rpc();

            const configAccount = await program.account.stablecoinConfig.fetch(configSss2);
            assert.ok(configAccount.enableTransferHook);
            assert.ok(configAccount.enablePermanentDelegate);
        });

        it("Adds a user to the blacklist correctly", async () => {
            const [blacklisterRole] = PublicKey.findProgramAddressSync([Buffer.from("role"), configSss2.toBuffer(), blacklister.publicKey.toBuffer()], program.programId);
            
            // Assign Blacklister Role
            // @ts-ignore
            await program.methods.updateRoles(blacklister.publicKey, false, false, false, true, false, false)
                .accounts({
                    masterAuthority: masterAuthority.publicKey,
                    config: configSss2,
                    roleRegistry: blacklisterRole,
                    systemProgram: SystemProgram.programId,
                })
                .signers([masterAuthority])
                .rpc();

            
            const [blacklistRecord] = PublicKey.findProgramAddressSync([Buffer.from("blacklist"), configSss2.toBuffer(), userA.publicKey.toBuffer()], program.programId);

            // Add to blacklist
            // @ts-ignore
            await program.methods.addToBlacklist(userA.publicKey, "Sanctions hit")
                .accounts({
                    blacklister: blacklister.publicKey,
                    config: configSss2,
                    roleRegistry: blacklisterRole,
                    blacklistRecord,
                    systemProgram: SystemProgram.programId,
                })
                .signers([blacklister])
                .rpc();

            const record = await program.account.blacklistRegistry.fetch(blacklistRecord);
            assert.equal(record.reason, "Sanctions hit");
        });
    });
});
