import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { SssToken } from "../target/types/sss_token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("SSS-1: minimal stablecoin lifecycle", () => {
  const rawProvider = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    rawProvider.connection,
    rawProvider.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;
  const authority = provider.wallet as anchor.Wallet;

  let mint: Keypair;
  let stablecoinConfig: PublicKey;
  let roleManager: PublicKey;
  let minterInfo: PublicKey;

  const minter = Keypair.generate();
  const recipient = Keypair.generate();
  const DECIMALS = 6;
  const MINT_AMOUNT = 1_000_000; // 1 token (6 decimals)

  function pdas(mintKey: PublicKey) {
    const [config] = PublicKey.findProgramAddressSync(
      [Buffer.from("stablecoin"), mintKey.toBuffer()],
      program.programId
    );
    const [roles] = PublicKey.findProgramAddressSync(
      [Buffer.from("roles"), config.toBuffer()],
      program.programId
    );
    return { config, roles };
  }

  before(async () => {
    await provider.connection.requestAirdrop(minter.publicKey, 2e9);
    await provider.connection.requestAirdrop(recipient.publicKey, 2e9);
    await new Promise((r) => setTimeout(r, 1000));
  });

  it("initialize SSS-1 token", async () => {
    mint = Keypair.generate();
    const { config, roles } = pdas(mint.publicKey);
    stablecoinConfig = config;
    roleManager = roles;

    await program.methods
      .initialize({
        name: "TestUSD",
        symbol: "TUSD",
        uri: "https://example.com/tusd.json",
        decimals: DECIMALS,
        enablePermanentDelegate: false,
        enableTransferHook: false,
        enableDefaultFrozen: false,
        transferHookProgramId: null,
      })
      .accountsPartial({
        authority: authority.publicKey,
        mint: mint.publicKey,
        stablecoinConfig,
        roleManager,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();

    const cfg = await program.account.stablecoinConfig.fetch(stablecoinConfig);
    expect(cfg.name).to.equal("TestUSD");
    expect(cfg.symbol).to.equal("TUSD");
    expect(cfg.decimals).to.equal(DECIMALS);
    expect(cfg.paused).to.be.false;
    expect(cfg.enablePermanentDelegate).to.be.false;
    expect(cfg.totalMinted.toNumber()).to.equal(0);
  });

  it("add minter with quota", async () => {
    const [info] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("minter"),
        stablecoinConfig.toBuffer(),
        minter.publicKey.toBuffer(),
      ],
      program.programId
    );
    minterInfo = info;

    await program.methods
      .addMinter(minter.publicKey, new BN(10_000_000))
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig,
        roleManager,
        minterInfo,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const mi = await program.account.minterInfo.fetch(minterInfo);
    expect(mi.minter.toBase58()).to.equal(minter.publicKey.toBase58());
    expect(mi.quota.toNumber()).to.equal(10_000_000);
    expect(mi.minted.toNumber()).to.equal(0);

    const rm = await program.account.roleManager.fetch(roleManager);
    expect(rm.minters.map((k: PublicKey) => k.toBase58())).to.include(
      minter.publicKey.toBase58()
    );
  });

  it("mint tokens to recipient", async () => {
    const recipientATA = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .mintTokens(new BN(MINT_AMOUNT))
      .accountsPartial({
        minter: minter.publicKey,
        stablecoinConfig,
        roleManager,
        minterInfo,
        mint: mint.publicKey,
        recipientTokenAccount: recipientATA,
        recipient: recipient.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([minter])
      .rpc();

    const account = await getAccount(
      provider.connection,
      recipientATA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(Number(account.amount)).to.equal(MINT_AMOUNT);

    const cfg = await program.account.stablecoinConfig.fetch(stablecoinConfig);
    expect(cfg.totalMinted.toNumber()).to.equal(MINT_AMOUNT);
  });

  it("minter quota exceeded error", async () => {
    const recipientATA = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    try {
      await program.methods
        .mintTokens(new BN(100_000_000))
        .accountsPartial({
          minter: minter.publicKey,
          stablecoinConfig,
          roleManager,
          minterInfo,
          mint: mint.publicKey,
          recipientTokenAccount: recipientATA,
          recipient: recipient.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([minter])
        .rpc();
      expect.fail("should have thrown QuotaExceeded");
    } catch (e: any) {
      expect(e.error?.errorCode?.code).to.equal("QuotaExceeded");
    }
  });

  it("burn tokens", async () => {
    const burner = Keypair.generate();
    await provider.connection.requestAirdrop(burner.publicKey, 2e9);
    await new Promise((r) => setTimeout(r, 1000));

    await program.methods
      .addRole({ burner: {} }, burner.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig,
        roleManager,
      })
      .rpc();

    const burnerATA = getAssociatedTokenAddressSync(
      mint.publicKey,
      burner.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const [burnerMinterInfo] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("minter"),
        stablecoinConfig.toBuffer(),
        minter.publicKey.toBuffer(),
      ],
      program.programId
    );

    const recipientATA = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .mintTokens(new BN(500_000))
      .accountsPartial({
        minter: minter.publicKey,
        stablecoinConfig,
        roleManager,
        minterInfo,
        mint: mint.publicKey,
        recipientTokenAccount: burnerATA,
        recipient: burner.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([minter])
      .rpc();

    await program.methods
      .burnTokens(new BN(500_000))
      .accountsPartial({
        burner: burner.publicKey,
        stablecoinConfig,
        roleManager,
        mint: mint.publicKey,
        burnerTokenAccount: burnerATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([burner])
      .rpc();

    const cfg = await program.account.stablecoinConfig.fetch(stablecoinConfig);
    expect(cfg.totalBurned.toNumber()).to.equal(500_000);
  });

  it("freeze and thaw account", async () => {
    const recipientATA = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .freezeAccount()
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig,
        roleManager,
        mint: mint.publicKey,
        tokenAccount: recipientATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    let account = await getAccount(
      provider.connection,
      recipientATA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(account.isFrozen).to.be.true;

    await program.methods
      .thawAccount()
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig,
        roleManager,
        mint: mint.publicKey,
        tokenAccount: recipientATA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    account = await getAccount(
      provider.connection,
      recipientATA,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(account.isFrozen).to.be.false;
  });

  it("pause blocks minting", async () => {
    const pauser = Keypair.generate();
    await provider.connection.requestAirdrop(pauser.publicKey, 2e9);
    await new Promise((r) => setTimeout(r, 1000));

    await program.methods
      .addRole({ pauser: {} }, pauser.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig,
        roleManager,
      })
      .rpc();

    await program.methods
      .pause()
      .accountsPartial({
        pauser: pauser.publicKey,
        stablecoinConfig,
        roleManager,
      })
      .signers([pauser])
      .rpc();

    const recipientATA = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    try {
      await program.methods
        .mintTokens(new BN(100))
        .accountsPartial({
          minter: minter.publicKey,
          stablecoinConfig,
          roleManager,
          minterInfo,
          mint: mint.publicKey,
          recipientTokenAccount: recipientATA,
          recipient: recipient.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([minter])
        .rpc();
      expect.fail("should have thrown Paused");
    } catch (e: any) {
      expect(e.error?.errorCode?.code).to.equal("Paused");
    }

    await program.methods
      .unpause()
      .accountsPartial({
        pauser: pauser.publicKey,
        stablecoinConfig,
        roleManager,
      })
      .signers([pauser])
      .rpc();

    const cfg = await program.account.stablecoinConfig.fetch(stablecoinConfig);
    expect(cfg.paused).to.be.false;
  });

  it("transfer authority", async () => {
    const newAuthority = Keypair.generate();

    await program.methods
      .transferAuthority(newAuthority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        stablecoinConfig,
      })
      .rpc();

    const cfg = await program.account.stablecoinConfig.fetch(stablecoinConfig);
    expect(cfg.authority.toBase58()).to.equal(newAuthority.publicKey.toBase58());

    await program.methods
      .transferAuthority(authority.publicKey)
      .accountsPartial({
        authority: newAuthority.publicKey,
        stablecoinConfig,
      })
      .signers([newAuthority])
      .rpc();
  });
});
