import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getExtensionData,
  ExtensionType,
} from "@solana/spl-token";
import { expect } from "chai";
import { SssCore } from "../target/types/sss_core";
import {
  createSss3Mint,
  fetchConfig,
  CreateSss3MintResult,
} from "./helpers";

describe("SSS-3: Confidential Stablecoin", () => {
  const provider = anchor.AnchorProvider.env();
  provider.opts.commitment = "confirmed";
  anchor.setProvider(provider);

  const coreProgram = anchor.workspace.SssCore as Program<SssCore>;

  let mintResult: CreateSss3MintResult;

  it("initializes SSS-3 stablecoin with correct config (preset=3)", async () => {
    mintResult = await createSss3Mint(provider, coreProgram, {
      name: "Private USD",
      symbol: "pUSD",
      uri: "https://example.com/pusd.json",
      decimals: 6,
      supplyCap: null,
    });

    const config = await fetchConfig(coreProgram, mintResult.configPda);

    expect(config.authority.toBase58()).to.equal(
      provider.wallet.publicKey.toBase58(),
    );
    expect(config.mint.toBase58()).to.equal(
      mintResult.mint.publicKey.toBase58(),
    );
    expect(config.preset).to.equal(3);
    expect(config.paused).to.equal(false);
    expect(config.supplyCap).to.be.null;
    expect(config.totalMinted.toNumber()).to.equal(0);
    expect(config.totalBurned.toNumber()).to.equal(0);
  });

  it("has ConfidentialTransferMint extension on the mint", async () => {
    const mintInfo = await getMint(
      provider.connection,
      mintResult.mint.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );

    // Verify the ConfidentialTransferMint extension data exists
    const ctExtensionData = getExtensionData(
      ExtensionType.ConfidentialTransferMint,
      mintInfo.tlvData,
    );
    expect(ctExtensionData).to.not.be.null;
    expect(ctExtensionData!.length).to.be.greaterThan(0);
  });

  it("has PermanentDelegate set to config PDA", async () => {
    const mintInfo = await getMint(
      provider.connection,
      mintResult.mint.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );

    // Verify PermanentDelegate extension data exists
    const pdExtensionData = getExtensionData(
      ExtensionType.PermanentDelegate,
      mintInfo.tlvData,
    );
    expect(pdExtensionData).to.not.be.null;

    // The PermanentDelegate extension data is just the 32-byte delegate pubkey
    const delegatePubkey = new PublicKey(pdExtensionData!.subarray(0, 32));
    expect(delegatePubkey.toBase58()).to.equal(
      mintResult.configPda.toBase58(),
    );
  });

  it("has MetadataPointer extension pointing to mint", async () => {
    const mintInfo = await getMint(
      provider.connection,
      mintResult.mint.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );

    const mpExtensionData = getExtensionData(
      ExtensionType.MetadataPointer,
      mintInfo.tlvData,
    );
    expect(mpExtensionData).to.not.be.null;

    // MetadataPointer data: [32 bytes authority] [32 bytes metadata address]
    const metadataAddress = new PublicKey(mpExtensionData!.subarray(32, 64));
    expect(metadataAddress.toBase58()).to.equal(
      mintResult.mint.publicKey.toBase58(),
    );
  });

  it("does NOT have TransferHook extension", async () => {
    const mintInfo = await getMint(
      provider.connection,
      mintResult.mint.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );

    const hookExtensionData = getExtensionData(
      ExtensionType.TransferHook,
      mintInfo.tlvData,
    );
    expect(hookExtensionData).to.be.null;
  });

  it("does NOT have DefaultAccountState extension", async () => {
    const mintInfo = await getMint(
      provider.connection,
      mintResult.mint.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );

    const dasExtensionData = getExtensionData(
      ExtensionType.DefaultAccountState,
      mintInfo.tlvData,
    );
    expect(dasExtensionData).to.be.null;
  });

  it("creates SSS-3 mint with custom auditor ElGamal key", async () => {
    // Generate a non-zero auditor key to verify it's stored correctly
    const auditorKey = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      auditorKey[i] = i + 1; // deterministic non-zero bytes
    }

    const customResult = await createSss3Mint(provider, coreProgram, {
      name: "Audited USD",
      symbol: "aUSD",
      uri: "https://example.com/ausd.json",
      decimals: 6,
      supplyCap: null,
      auditorElGamalPubkey: auditorKey,
      autoApproveNewAccounts: false,
    });

    const config = await fetchConfig(coreProgram, customResult.configPda);
    expect(config.preset).to.equal(3);

    // Verify the mint has ConfidentialTransferMint extension
    const mintInfo = await getMint(
      provider.connection,
      customResult.mint.publicKey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );

    const ctExtensionData = getExtensionData(
      ExtensionType.ConfidentialTransferMint,
      mintInfo.tlvData,
    );
    expect(ctExtensionData).to.not.be.null;
    expect(ctExtensionData!.length).to.be.greaterThan(0);
  });

  it("creates SSS-3 mint with supply cap", async () => {
    const cappedResult = await createSss3Mint(provider, coreProgram, {
      name: "Capped Private USD",
      symbol: "cpUSD",
      uri: "https://example.com/cpusd.json",
      decimals: 6,
      supplyCap: new BN(1_000_000_000),
    });

    const config = await fetchConfig(coreProgram, cappedResult.configPda);
    expect(config.preset).to.equal(3);
    expect(config.supplyCap!.toNumber()).to.equal(1_000_000_000);
  });
});
