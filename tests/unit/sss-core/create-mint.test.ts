import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  provider,
  coreProgram,
  hookProgram,
  admin,
  createSSS1Mint,
  createSSS2Mint,
  findConfigPda,
} from "../../helpers/setup";
import { TOKEN_2022_PROGRAM_ID } from "../../helpers/constants";

describe("create-mint", () => {
  it("creates SSS-1 mint with metadata", async () => {
    const { mintKeypair, configPda } = await createSSS1Mint(
      "Test USD",
      "TUSD",
      6
    );

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.mint.toBase58()).to.equal(
      mintKeypair.publicKey.toBase58()
    );
    expect(config.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(config.preset).to.deep.equal({ sss1: {} });
  });

  it("creates SSS-2 mint with PermanentDelegate + TransferHook + DefaultAccountState", async () => {
    const treasuryKeypair = Keypair.generate();
    const { mintKeypair, configPda } = await createSSS2Mint(
      treasuryKeypair.publicKey,
      "Regulated USD",
      "RUSD",
      6
    );

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.preset).to.deep.equal({ sss2: {} });
    expect(config.transferHookProgram.toBase58()).to.equal(
      hookProgram.programId.toBase58()
    );
    expect(config.treasury.toBase58()).to.equal(
      treasuryKeypair.publicKey.toBase58()
    );
  });

  it("rejects invalid preset (preset=99)", async () => {
    const mintKeypair = Keypair.generate();
    const [configPda] = findConfigPda(mintKeypair.publicKey);

    try {
      await coreProgram.methods
        .createMint({
          name: "Bad",
          symbol: "BAD",
          uri: "",
          decimals: 6,
          preset: 99,
          transferHookProgram: null,
          treasury: null,
        })
        .accounts({
          admin: admin.publicKey,
          mint: mintKeypair.publicKey,
          config: configPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
      expect(err.toString()).to.include("InvalidPreset");
    }
  });

  it("rejects name too long (33 chars)", async () => {
    const mintKeypair = Keypair.generate();
    const [configPda] = findConfigPda(mintKeypair.publicKey);
    const longName = "A".repeat(33);

    try {
      await coreProgram.methods
        .createMint({
          name: longName,
          symbol: "TST",
          uri: "",
          decimals: 6,
          preset: 0,
          transferHookProgram: null,
          treasury: null,
        })
        .accounts({
          admin: admin.publicKey,
          mint: mintKeypair.publicKey,
          config: configPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
      expect(err.toString()).to.include("NameTooLong");
    }
  });

  it("rejects symbol too long (11 chars)", async () => {
    const mintKeypair = Keypair.generate();
    const [configPda] = findConfigPda(mintKeypair.publicKey);
    const longSymbol = "S".repeat(11);

    try {
      await coreProgram.methods
        .createMint({
          name: "Valid Name",
          symbol: longSymbol,
          uri: "",
          decimals: 6,
          preset: 0,
          transferHookProgram: null,
          treasury: null,
        })
        .accounts({
          admin: admin.publicKey,
          mint: mintKeypair.publicKey,
          config: configPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
      expect(err.toString()).to.include("SymbolTooLong");
    }
  });

  it("rejects URI too long (201 chars)", async () => {
    const mintKeypair = Keypair.generate();
    const [configPda] = findConfigPda(mintKeypair.publicKey);
    const longUri = "U".repeat(201);

    try {
      await coreProgram.methods
        .createMint({
          name: "Valid",
          symbol: "VLD",
          uri: longUri,
          decimals: 6,
          preset: 0,
          transferHookProgram: null,
          treasury: null,
        })
        .accounts({
          admin: admin.publicKey,
          mint: mintKeypair.publicKey,
          config: configPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
      expect(err.toString()).to.include("UriTooLong");
    }
  });

  it("rejects SSS-2 without transferHookProgram", async () => {
    const mintKeypair = Keypair.generate();
    const [configPda] = findConfigPda(mintKeypair.publicKey);
    const treasury = Keypair.generate().publicKey;

    try {
      await coreProgram.methods
        .createMint({
          name: "No Hook",
          symbol: "NHK",
          uri: "",
          decimals: 6,
          preset: 1,
          transferHookProgram: null,
          treasury,
        })
        .accounts({
          admin: admin.publicKey,
          mint: mintKeypair.publicKey,
          config: configPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
      expect(err.toString()).to.include("TransferHookRequired");
    }
  });

  it("rejects SSS-2 without treasury", async () => {
    const mintKeypair = Keypair.generate();
    const [configPda] = findConfigPda(mintKeypair.publicKey);

    try {
      await coreProgram.methods
        .createMint({
          name: "No Treasury",
          symbol: "NTR",
          uri: "",
          decimals: 6,
          preset: 1,
          transferHookProgram: hookProgram.programId,
          treasury: null,
        })
        .accounts({
          admin: admin.publicKey,
          mint: mintKeypair.publicKey,
          config: configPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err).to.exist;
      expect(err.toString()).to.include("TreasuryRequired");
    }
  });

  it("sets correct config fields for SSS-1", async () => {
    const { mintKeypair, configPda } = await createSSS1Mint("My USD", "MUSD", 6);
    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);

    expect(config.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(config.mint.toBase58()).to.equal(mintKeypair.publicKey.toBase58());
    expect(config.preset).to.deep.equal({ sss1: {} });
    expect(config.paused).to.equal(false);
    expect(config.transferHookProgram.toBase58()).to.equal(
      PublicKey.default.toBase58()
    );
    expect(config.treasury.toBase58()).to.equal(PublicKey.default.toBase58());
  });

  it("sets correct config fields for SSS-2", async () => {
    const treasury = Keypair.generate().publicKey;
    const { mintKeypair, configPda } = await createSSS2Mint(
      treasury,
      "Stable",
      "STB",
      6
    );
    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);

    expect(config.preset).to.deep.equal({ sss2: {} });
    expect(config.paused).to.equal(false);
    expect(config.transferHookProgram.toBase58()).to.equal(
      hookProgram.programId.toBase58()
    );
    expect(config.treasury.toBase58()).to.equal(treasury.toBase58());
  });

  it("config.totalMinted and totalBurned start at 0", async () => {
    const { configPda } = await createSSS1Mint("Zero USD", "ZUSD", 6);
    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);

    expect(config.totalMinted.toNumber()).to.equal(0);
    expect(config.totalBurned.toNumber()).to.equal(0);
  });

  it("config.totalSeized starts at 0 for SSS-2", async () => {
    const treasury = Keypair.generate().publicKey;
    const { configPda } = await createSSS2Mint(treasury, "Seized USD", "SUSD", 6);
    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);

    expect(config.totalSeized.toNumber()).to.equal(0);
  });

  it("config.pendingAdmin starts as default pubkey", async () => {
    const { configPda } = await createSSS1Mint("Pending USD", "PUSD", 6);
    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);

    expect(config.pendingAdmin.toBase58()).to.equal(
      PublicKey.default.toBase58()
    );
  });

  it("emits MintCreated event", async () => {
    const mintKeypair = Keypair.generate();
    const [configPda] = findConfigPda(mintKeypair.publicKey);

    const txSig = await coreProgram.methods
      .createMint({
        name: "Event USD",
        symbol: "EVNT",
        uri: "",
        decimals: 6,
        preset: 0,
        transferHookProgram: null,
        treasury: null,
      })
      .accounts({
        admin: admin.publicKey,
        mint: mintKeypair.publicKey,
        config: configPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    await provider.connection.confirmTransaction(txSig, "confirmed");
    const tx = await provider.connection.getTransaction(txSig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const logs = tx?.meta?.logMessages || [];
    const hasEvent = logs.some((l) => l.includes("Program data:"));
    expect(hasEvent, "MintCreated event should be emitted in logs").to.be.true;
  });

  it("creates SSS-3 mint (same extensions as SSS-2)", async () => {
    const mintKeypair = Keypair.generate();
    const [configPda] = findConfigPda(mintKeypair.publicKey);
    const treasury = Keypair.generate().publicKey;

    await coreProgram.methods
      .createMint({
        name: "Confidential USD",
        symbol: "CUSD",
        uri: "",
        decimals: 6,
        preset: 2,
        transferHookProgram: hookProgram.programId,
        treasury,
      })
      .accounts({
        admin: admin.publicKey,
        mint: mintKeypair.publicKey,
        config: configPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();

    const config = await coreProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.preset).to.deep.equal({ sss3: {} });
    expect(config.transferHookProgram.toBase58()).to.equal(
      hookProgram.programId.toBase58()
    );
    expect(config.treasury.toBase58()).to.equal(treasury.toBase58());
  });
});
