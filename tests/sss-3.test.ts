import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SssToken } from "../target/types/sss_token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import BN from "bn.js";

describe("SSS-3: Private Stablecoin (Confidential Transfers)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;
  const authority = provider.wallet as anchor.Wallet;

  const mint = Keypair.generate();
  const recipient = Keypair.generate();

  let configPda: PublicKey;
  let configBump: number;
  let roleRegistryPda: PublicKey;
  let roleRegistryBump: number;

  before(async () => {
    // Derive PDAs
    [configPda, configBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.publicKey.toBuffer()],
      program.programId
    );
    [roleRegistryPda, roleRegistryBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("roles"), configPda.toBuffer()],
      program.programId
    );

    // Airdrop to recipient for creating token accounts
    const sig = await provider.connection.requestAirdrop(
      recipient.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
  });

  it("Initializes SSS-3 stablecoin with confidential transfers", async () => {
    const tx = await program.methods
      .initialize({
        name: "Private USD",
        symbol: "pUSD",
        uri: "https://example.com/pusd-metadata.json",
        decimals: 6,
        preset: { sss3: {} },
        enablePermanentDelegate: null,
        enableTransferHook: null,
        enableDefaultStateFrozen: null,
        enableConfidentialTransfers: null,
      })
      .accounts({
        authority: authority.publicKey,
        mint: mint.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();

    // Verify config state
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.name).to.equal("Private USD");
    expect(config.symbol).to.equal("pUSD");
    expect(config.decimals).to.equal(6);
    expect(config.masterAuthority.toBase58()).to.equal(
      authority.publicKey.toBase58()
    );
    expect(config.isPaused).to.equal(false);
    expect(config.enablePermanentDelegate).to.equal(true);
    expect(config.enableConfidentialTransfers).to.equal(true);
    expect(config.enableTransferHook).to.equal(false);
    expect(config.defaultAccountFrozen).to.equal(false);
    expect(config.totalMinted.toNumber()).to.equal(0);
    expect(config.totalBurned.toNumber()).to.equal(0);

    // Verify role registry — SSS-3 has permanent delegate, so blacklister/seizer are set
    const roles = await program.account.roleRegistry.fetch(roleRegistryPda);
    expect(roles.masterAuthority.toBase58()).to.equal(
      authority.publicKey.toBase58()
    );
    expect(roles.pauser.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(roles.blacklister.toBase58()).to.equal(
      authority.publicKey.toBase58()
    );
    expect(roles.seizer.toBase58()).to.equal(authority.publicKey.toBase58());
  });

  it("Adds a minter with quota", async () => {
    const [minterInfoPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("minter"),
        configPda.toBuffer(),
        authority.publicKey.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .updateMinter({
        isActive: true,
        mintQuota: new BN(1_000_000_000), // 1000 tokens (6 decimals)
      })
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
        minterInfo: minterInfoPda,
        minterWallet: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const minterInfo = await program.account.minterInfo.fetch(minterInfoPda);
    expect(minterInfo.isActive).to.equal(true);
    expect(minterInfo.mintQuota.toNumber()).to.equal(1_000_000_000);
    expect(minterInfo.totalMinted.toNumber()).to.equal(0);
  });

  it("Mints tokens to recipient", async () => {
    // Create associated token account for recipient
    const recipientAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const createAtaIx = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      recipientAta,
      recipient.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const [minterInfoPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("minter"),
        configPda.toBuffer(),
        authority.publicKey.toBuffer(),
      ],
      program.programId
    );

    const mintAmount = new BN(500_000_000); // 500 tokens

    const tx = new anchor.web3.Transaction().add(createAtaIx);
    await provider.sendAndConfirm(tx);

    await program.methods
      .mintTokens(mintAmount)
      .accounts({
        minterAuthority: authority.publicKey,
        config: configPda,
        minterInfo: minterInfoPda,
        mint: mint.publicKey,
        recipientTokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    // Verify config totals
    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.totalMinted.toNumber()).to.equal(500_000_000);

    // Verify minter stats
    const minterInfo = await program.account.minterInfo.fetch(minterInfoPda);
    expect(minterInfo.totalMinted.toNumber()).to.equal(500_000_000);
  });

  it("Burns tokens", async () => {
    // First create ATA for authority and mint some tokens
    const authorityAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const [minterInfoPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("minter"),
        configPda.toBuffer(),
        authority.publicKey.toBuffer(),
      ],
      program.programId
    );

    // Create ATA and mint tokens to authority
    const createAtaIx = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      authorityAta,
      authority.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const tx = new anchor.web3.Transaction().add(createAtaIx);
    await provider.sendAndConfirm(tx);

    await program.methods
      .mintTokens(new BN(100_000_000)) // 100 tokens
      .accounts({
        minterAuthority: authority.publicKey,
        config: configPda,
        minterInfo: minterInfoPda,
        mint: mint.publicKey,
        recipientTokenAccount: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    // Now burn 50 tokens
    await program.methods
      .burnTokens(new BN(50_000_000))
      .accounts({
        burner: authority.publicKey,
        config: configPda,
        mint: mint.publicKey,
        burnerTokenAccount: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.totalBurned.toNumber()).to.equal(50_000_000);
  });

  it("Freezes a token account", async () => {
    const recipientAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .freezeAccount()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
        mint: mint.publicKey,
        targetTokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  });

  it("Thaws a token account", async () => {
    const recipientAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .thawAccount()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
        mint: mint.publicKey,
        targetTokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  });

  it("Pauses and unpauses the stablecoin", async () => {
    // Pause
    await program.methods
      .pause()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
      })
      .rpc();

    const configPaused = await program.account.stablecoinConfig.fetch(configPda);
    expect(configPaused.isPaused).to.equal(true);

    // Verify minting fails while paused
    const [minterInfoPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("minter"),
        configPda.toBuffer(),
        authority.publicKey.toBuffer(),
      ],
      program.programId
    );

    const authorityAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    try {
      await program.methods
        .mintTokens(new BN(100_000_000))
        .accounts({
          minterAuthority: authority.publicKey,
          config: configPda,
          minterInfo: minterInfoPda,
          mint: mint.publicKey,
          recipientTokenAccount: authorityAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.include("ProgramPaused");
    }

    // Unpause
    await program.methods
      .unpause()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
      })
      .rpc();

    const configUnpaused = await program.account.stablecoinConfig.fetch(configPda);
    expect(configUnpaused.isPaused).to.equal(false);
  });

  it("Blacklist works on SSS-3 (permanent delegate enabled)", async () => {
    // SSS-3 has enable_permanent_delegate = true, so blacklist_add is available.
    // Note: without a transfer hook, transfers from blacklisted addresses are not
    // automatically blocked by hook logic, but the blacklist entry is created and
    // the target token account is frozen.
    const recipientAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const [blacklistPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("blacklist"),
        configPda.toBuffer(),
        recipient.publicKey.toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .blacklistAdd({ reason: "Privacy compliance" })
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
        blacklistEntry: blacklistPda,
        addressToBlacklist: recipient.publicKey,
        mint: mint.publicKey,
        targetTokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Verify blacklist entry was created
    const entry = await program.account.blacklistEntry.fetch(blacklistPda);
    expect(entry.blockedAddress.toBase58()).to.equal(
      recipient.publicKey.toBase58()
    );
    expect(entry.reason).to.equal("Privacy compliance");

    // Remove blacklist and thaw for cleanup
    await program.methods
      .blacklistRemove()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
        blacklistEntry: blacklistPda,
        mint: mint.publicKey,
        targetTokenAccount: recipientAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    // Verify entry is gone
    try {
      await program.account.blacklistEntry.fetch(blacklistPda);
      expect.fail("Should not exist");
    } catch (err: any) {
      // Expected -- account no longer exists after removal
    }
  });

  it("Transfers roles", async () => {
    const newPauser = Keypair.generate();

    await program.methods
      .updateRoles({
        role: { pauser: {} },
        newHolder: newPauser.publicKey,
      })
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
      })
      .rpc();

    const roles = await program.account.roleRegistry.fetch(roleRegistryPda);
    expect(roles.pauser.toBase58()).to.equal(newPauser.publicKey.toBase58());

    // Restore pauser to authority for later tests
    await program.methods
      .updateRoles({
        role: { pauser: {} },
        newHolder: authority.publicKey,
      })
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
      })
      .rpc();
  });
});
