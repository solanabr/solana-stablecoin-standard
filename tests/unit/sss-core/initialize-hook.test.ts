import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { findHookConfigPda, findExtraAccountMetaListPda } from "@sss/sdk";
import { TOKEN_2022_PROGRAM_ID } from "../../helpers/constants";
import {
  provider,
  coreProgram,
  hookProgram,
  admin,
  createSSS1Mint,
  createSSS2Mint,
  airdropSol,
} from "../../helpers/setup";

describe("sss-core: initialize_hook", () => {
  let configPda: PublicKey;
  let mintKeypair: Keypair;
  let treasuryKeypair: Keypair;

  beforeEach(async () => {
    treasuryKeypair = Keypair.generate();
    await airdropSol(treasuryKeypair.publicKey);
    const result = await createSSS2Mint(treasuryKeypair.publicKey);
    mintKeypair = result.mintKeypair;
    configPda = result.configPda;
  });

  it("admin initializes hook config and extra account metas", async () => {
    const [hookConfig] = findHookConfigPda(mintKeypair.publicKey);
    const [extraAccountMetaList] = findExtraAccountMetaListPda(mintKeypair.publicKey);

    const tx = await coreProgram.methods
      .initializeHook()
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        mint: mintKeypair.publicKey,
        hookConfig,
        extraAccountMetaList,
        transferHookProgram: hookProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    expect(tx).to.be.a("string");
  });

  it("hook config PDA is created on transfer hook program", async () => {
    const [hookConfig] = findHookConfigPda(mintKeypair.publicKey);
    const [extraAccountMetaList] = findExtraAccountMetaListPda(mintKeypair.publicKey);

    await coreProgram.methods
      .initializeHook()
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        mint: mintKeypair.publicKey,
        hookConfig,
        extraAccountMetaList,
        transferHookProgram: hookProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const acctInfo = await provider.connection.getAccountInfo(hookConfig);
    expect(acctInfo).to.not.be.null;
    expect(acctInfo!.owner.toBase58()).to.equal(hookProgram.programId.toBase58());
  });

  it("extra account meta list is created", async () => {
    const [hookConfig] = findHookConfigPda(mintKeypair.publicKey);
    const [extraAccountMetaList] = findExtraAccountMetaListPda(mintKeypair.publicKey);

    await coreProgram.methods
      .initializeHook()
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        mint: mintKeypair.publicKey,
        hookConfig,
        extraAccountMetaList,
        transferHookProgram: hookProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const acctInfo = await provider.connection.getAccountInfo(extraAccountMetaList);
    expect(acctInfo).to.not.be.null;
  });

  it("rejects non-admin", async () => {
    const random = Keypair.generate();
    await airdropSol(random.publicKey);
    const [hookConfig] = findHookConfigPda(mintKeypair.publicKey);
    const [extraAccountMetaList] = findExtraAccountMetaListPda(mintKeypair.publicKey);

    try {
      await coreProgram.methods
        .initializeHook()
        .accounts({
          payer: random.publicKey,
          admin: random.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          hookConfig,
          extraAccountMetaList,
          transferHookProgram: hookProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([random])
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("rejects duplicate initialization", async () => {
    const [hookConfig] = findHookConfigPda(mintKeypair.publicKey);
    const [extraAccountMetaList] = findExtraAccountMetaListPda(mintKeypair.publicKey);

    await coreProgram.methods
      .initializeHook()
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        mint: mintKeypair.publicKey,
        hookConfig,
        extraAccountMetaList,
        transferHookProgram: hookProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    try {
      await coreProgram.methods
        .initializeHook()
        .accounts({
          payer: admin.publicKey,
          admin: admin.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          hookConfig,
          extraAccountMetaList,
          transferHookProgram: hookProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("rejects SSS-1 mint (no transfer hook)", async () => {
    const sss1Result = await createSSS1Mint();
    const [hookConfig] = findHookConfigPda(sss1Result.mintKeypair.publicKey);
    const [extraAccountMetaList] = findExtraAccountMetaListPda(sss1Result.mintKeypair.publicKey);

    try {
      await coreProgram.methods
        .initializeHook()
        .accounts({
          payer: admin.publicKey,
          admin: admin.publicKey,
          config: sss1Result.configPda,
          mint: sss1Result.mintKeypair.publicKey,
          hookConfig,
          extraAccountMetaList,
          transferHookProgram: hookProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have failed");
    } catch (error) {
      expect(error).to.exist;
    }
  });

  it("hook config authority is set to config PDA", async () => {
    const [hookConfig] = findHookConfigPda(mintKeypair.publicKey);
    const [extraAccountMetaList] = findExtraAccountMetaListPda(mintKeypair.publicKey);

    await coreProgram.methods
      .initializeHook()
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        mint: mintKeypair.publicKey,
        hookConfig,
        extraAccountMetaList,
        transferHookProgram: hookProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const hookConfigAcct = await hookProgram.account.hookConfig.fetch(hookConfig);
    expect(hookConfigAcct.authority.toBase58()).to.equal(configPda.toBase58());
  });

  it("hook config mint matches", async () => {
    const [hookConfig] = findHookConfigPda(mintKeypair.publicKey);
    const [extraAccountMetaList] = findExtraAccountMetaListPda(mintKeypair.publicKey);

    await coreProgram.methods
      .initializeHook()
      .accounts({
        payer: admin.publicKey,
        admin: admin.publicKey,
        config: configPda,
        mint: mintKeypair.publicKey,
        hookConfig,
        extraAccountMetaList,
        transferHookProgram: hookProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const hookConfigAcct = await hookProgram.account.hookConfig.fetch(hookConfig);
    expect(hookConfigAcct.mint.toBase58()).to.equal(mintKeypair.publicKey.toBase58());
  });
});
