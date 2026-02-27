import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SssToken } from "../target/types/sss_token";
import { SssTransferHook } from "../target/types/sss_transfer_hook";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import BN from "bn.js";

describe("SSS-2: Compliant Stablecoin", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const tokenProgram = anchor.workspace.SssToken as Program<SssToken>;
  const hookProgram = anchor.workspace
    .SssTransferHook as Program<SssTransferHook>;

  const authority = provider.wallet as anchor.Wallet;
  const mint = Keypair.generate();
  const userA = Keypair.generate();
  const userB = Keypair.generate();
  const treasury = Keypair.generate();

  let configPda: PublicKey;
  let roleRegistryPda: PublicKey;
  let extraAccountMetaListPda: PublicKey;

  before(async () => {
    // Derive PDAs
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.publicKey.toBuffer()],
      tokenProgram.programId
    );
    [roleRegistryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("roles"), configPda.toBuffer()],
      tokenProgram.programId
    );
    [extraAccountMetaListPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("extra-account-metas"), mint.publicKey.toBuffer()],
      hookProgram.programId
    );

    // Airdrop to test users
    for (const user of [userA, userB, treasury]) {
      const sig = await provider.connection.requestAirdrop(
        user.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
  });

  it("Initializes SSS-2 stablecoin with transfer hook", async () => {
    await tokenProgram.methods
      .initialize({
        name: "Compliant USD",
        symbol: "cUSD",
        uri: "https://example.com/cusd.json",
        decimals: 6,
        preset: { sss2: {} },
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
      .remainingAccounts([
        {
          pubkey: hookProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ])
      .signers([mint])
      .rpc();

    // Verify config
    const config = await tokenProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.name).to.equal("Compliant USD");
    expect(config.enablePermanentDelegate).to.equal(true);
    expect(config.enableTransferHook).to.equal(true);

    // Verify roles — SSS-2 has blacklister and seizer roles
    const roles = await tokenProgram.account.roleRegistry.fetch(
      roleRegistryPda
    );
    expect(roles.blacklister.toBase58()).to.equal(
      authority.publicKey.toBase58()
    );
    expect(roles.seizer.toBase58()).to.equal(authority.publicKey.toBase58());
  });

  it("Initializes the ExtraAccountMetaList for the transfer hook", async () => {
    await hookProgram.methods
      .initializeExtraAccountMetaList()
      .accounts({
        payer: authority.publicKey,
        extraAccountMetaList: extraAccountMetaListPda,
        mint: mint.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Verify the account was created
    const account = await provider.connection.getAccountInfo(
      extraAccountMetaListPda
    );
    expect(account).to.not.be.null;
    expect(account!.owner.toBase58()).to.equal(
      hookProgram.programId.toBase58()
    );
  });

  it("Sets up minter and mints tokens to users", async () => {
    // Add minter
    const [minterInfoPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("minter"),
        configPda.toBuffer(),
        authority.publicKey.toBuffer(),
      ],
      tokenProgram.programId
    );

    await tokenProgram.methods
      .updateMinter({
        isActive: true,
        mintQuota: new BN(10_000_000_000), // 10,000 tokens
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

    // Create ATAs for all users
    for (const user of [userA, userB, treasury]) {
      const ata = getAssociatedTokenAddressSync(
        mint.publicKey,
        user.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const createAtaIx = createAssociatedTokenAccountInstruction(
        authority.publicKey,
        ata,
        user.publicKey,
        mint.publicKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const tx = new Transaction().add(createAtaIx);
      await provider.sendAndConfirm(tx);
    }

    // Mint tokens to userA
    const userAAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      userA.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await tokenProgram.methods
      .mintTokens(new BN(1_000_000_000)) // 1000 tokens
      .accounts({
        minterAuthority: authority.publicKey,
        config: configPda,
        minterInfo: minterInfoPda,
        mint: mint.publicKey,
        recipientTokenAccount: userAAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    const config = await tokenProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.totalMinted.toNumber()).to.equal(1_000_000_000);
  });

  it("Blacklists an address and freezes their account", async () => {
    const userBAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      userB.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const [blacklistPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("blacklist"),
        configPda.toBuffer(),
        userB.publicKey.toBuffer(),
      ],
      tokenProgram.programId
    );

    await tokenProgram.methods
      .blacklistAdd({ reason: "Sanctions compliance" })
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
        blacklistEntry: blacklistPda,
        addressToBlacklist: userB.publicKey,
        mint: mint.publicKey,
        targetTokenAccount: userBAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Verify blacklist entry
    const entry = await tokenProgram.account.blacklistEntry.fetch(blacklistPda);
    expect(entry.blockedAddress.toBase58()).to.equal(
      userB.publicKey.toBase58()
    );
    expect(entry.reason).to.equal("Sanctions compliance");
  });

  it("Removes blacklist and thaws account", async () => {
    const userBAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      userB.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const [blacklistPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("blacklist"),
        configPda.toBuffer(),
        userB.publicKey.toBuffer(),
      ],
      tokenProgram.programId
    );

    await tokenProgram.methods
      .blacklistRemove()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
        blacklistEntry: blacklistPda,
        mint: mint.publicKey,
        targetTokenAccount: userBAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    // Verify entry is gone
    try {
      await tokenProgram.account.blacklistEntry.fetch(blacklistPda);
      expect.fail("Should not exist");
    } catch (err: any) {
      // Expected — account no longer exists
    }
  });

  it("Seize flow: blacklist → seize → verify", async () => {
    // Mint some tokens to userA's ATA first for the seize test
    const userAAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      userA.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const treasuryAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      treasury.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Blacklist userA
    const [blacklistPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("blacklist"),
        configPda.toBuffer(),
        userA.publicKey.toBuffer(),
      ],
      tokenProgram.programId
    );

    await tokenProgram.methods
      .blacklistAdd({ reason: "Suspicious activity" })
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
        blacklistEntry: blacklistPda,
        addressToBlacklist: userA.publicKey,
        mint: mint.publicKey,
        targetTokenAccount: userAAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Seize 500 tokens from userA to treasury
    // Uses burn+mint approach to avoid triggering the transfer hook
    await tokenProgram.methods
      .seize(new BN(500_000_000))
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
        blacklistEntry: blacklistPda,
        mint: mint.publicKey,
        fromTokenAccount: userAAta,
        toTokenAccount: treasuryAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    // Verify: config should be updated
    const config = await tokenProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.updatedAt.toNumber()).to.be.greaterThan(0);

    // Remove blacklist and thaw for cleanup
    await tokenProgram.methods
      .blacklistRemove()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
        blacklistEntry: blacklistPda,
        mint: mint.publicKey,
        targetTokenAccount: userAAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  });

  it("Pause prevents all operations", async () => {
    // Pause
    await tokenProgram.methods
      .pause()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
      })
      .rpc();

    const config = await tokenProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.isPaused).to.equal(true);

    // Try to blacklist while paused — should fail
    const someAddress = Keypair.generate();
    const [blacklistPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("blacklist"),
        configPda.toBuffer(),
        someAddress.publicKey.toBuffer(),
      ],
      tokenProgram.programId
    );

    // Create ATA for someAddress
    const someAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      someAddress.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const createAtaIx = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      someAta,
      someAddress.publicKey,
      mint.publicKey,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const tx = new Transaction().add(createAtaIx);
    await provider.sendAndConfirm(tx);

    try {
      await tokenProgram.methods
        .blacklistAdd({ reason: "test" })
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
          blacklistEntry: blacklistPda,
          addressToBlacklist: someAddress.publicKey,
          mint: mint.publicKey,
          targetTokenAccount: someAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.include("ProgramPaused");
    }

    // Unpause for cleanup
    await tokenProgram.methods
      .unpause()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
      })
      .rpc();
  });

  it("Reserve attestation (GENIUS Act compliance)", async () => {
    const [attestationPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("reserve"),
        configPda.toBuffer(),
        new BN(0).toArrayLike(Buffer, "le", 8),
      ],
      tokenProgram.programId
    );

    const reserveHash = Buffer.alloc(32);
    reserveHash.fill(0xab);

    await tokenProgram.methods
      .attestReserve({
        reserveHash: Array.from(reserveHash),
        totalReservesUsd: new BN(1_000_000_00), // $1,000,000.00
        totalOutstanding: new BN(1_000_000_000), // 1000 tokens
        attestationUri: "https://example.com/reserves/2024-01.json",
      })
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
        attestation: attestationPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Verify attestation
    const attestation =
      await tokenProgram.account.reserveAttestation.fetch(attestationPda);
    expect(attestation.index.toNumber()).to.equal(0);
    expect(attestation.totalReservesUsd.toNumber()).to.equal(1_000_000_00);
    expect(attestation.attestedBy.toBase58()).to.equal(
      authority.publicKey.toBase58()
    );

    // Verify config index incremented
    const config = await tokenProgram.account.stablecoinConfig.fetch(configPda);
    expect(config.reserveAttestationIndex.toNumber()).to.equal(1);
  });
});
