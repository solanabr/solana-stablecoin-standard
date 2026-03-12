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

describe("SSS-1: Minimal Stablecoin", () => {
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

  it("Initializes SSS-1 stablecoin", async () => {
    const tx = await program.methods
      .initialize({
        name: "Test USD",
        symbol: "TUSD",
        uri: "https://example.com/metadata.json",
        decimals: 6,
        preset: { sss1: {} },
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
    expect(config.name).to.equal("Test USD");
    expect(config.symbol).to.equal("TUSD");
    expect(config.decimals).to.equal(6);
    expect(config.masterAuthority.toBase58()).to.equal(
      authority.publicKey.toBase58()
    );
    expect(config.isPaused).to.equal(false);
    expect(config.enablePermanentDelegate).to.equal(false);
    expect(config.enableTransferHook).to.equal(false);
    expect(config.totalMinted.toNumber()).to.equal(0);
    expect(config.totalBurned.toNumber()).to.equal(0);

    // Verify role registry
    const roles = await program.account.roleRegistry.fetch(roleRegistryPda);
    expect(roles.masterAuthority.toBase58()).to.equal(
      authority.publicKey.toBase58()
    );
    expect(roles.pauser.toBase58()).to.equal(authority.publicKey.toBase58());
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
        recipientBlacklist: null,
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
        recipientBlacklist: null,
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
        burnTokenAccount: authorityAta,
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

  it("Pauses the stablecoin", async () => {
    await program.methods
      .pause()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
      })
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.isPaused).to.equal(true);
  });

  it("Fails to mint when paused", async () => {
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
          recipientBlacklist: null,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.include("ProgramPaused");
    }
  });

  it("Unpauses the stablecoin", async () => {
    await program.methods
      .unpause()
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
      })
      .rpc();

    const config = await program.account.stablecoinConfig.fetch(configPda);
    expect(config.isPaused).to.equal(false);
  });

  it("Fails SSS-2 instructions on SSS-1 preset", async () => {
    const someAddress = Keypair.generate();

    const [blacklistPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("blacklist"),
        configPda.toBuffer(),
        someAddress.publicKey.toBuffer(),
      ],
      program.programId
    );

    // Create a token account for the address first
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
    const tx = new anchor.web3.Transaction().add(createAtaIx);
    await provider.sendAndConfirm(tx);

    try {
      await program.methods
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
      expect(err.error?.errorCode?.code || err.message).to.include(
        "BlacklistNotEnabled"
      );
    }
  });

  it("Rejects minting beyond quota", async () => {
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

    // Already minted 600M (500 + 100). Quota is 1000M. Try to mint 500M more = 1100M > 1000M quota
    try {
      await program.methods
        .mintTokens(new BN(500_000_000))
        .accounts({
          minterAuthority: authority.publicKey,
          config: configPda,
          minterInfo: minterInfoPda,
          mint: mint.publicKey,
          recipientTokenAccount: authorityAta,
          recipientBlacklist: null,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.include(
        "MintQuotaExceeded"
      );
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

  // ---------------------------------------------------------------
  // Unauthorized Access Tests (negative path)
  // ---------------------------------------------------------------

  it("Rejects pause from non-pauser", async () => {
    // Assign pauser to a specific key, then try to pause with a different one
    const designatedPauser = Keypair.generate();
    const sigAirdrop = await provider.connection.requestAirdrop(
      designatedPauser.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sigAirdrop);

    // Set pauser to designatedPauser
    await program.methods
      .updateRoles({
        role: { pauser: {} },
        newHolder: designatedPauser.publicKey,
      })
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        roleRegistry: roleRegistryPda,
      })
      .rpc();

    // Now try to pause with the authority wallet (which is no longer the pauser)
    // Master authority should still work because of fallback
    // Instead test with a completely random keypair
    const impostor = Keypair.generate();
    const sigImpostor = await provider.connection.requestAirdrop(
      impostor.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sigImpostor);

    try {
      await program.methods
        .pause()
        .accounts({
          authority: impostor.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
        })
        .signers([impostor])
        .rpc();

      expect.fail("Non-pauser should not be able to pause");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.include("Unauthorized");
    }

    // Restore pauser to authority
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

  it("Rejects transfer_authority from non-master", async () => {
    const impostor = Keypair.generate();
    const newAuth = Keypair.generate();
    const sigImpostor = await provider.connection.requestAirdrop(
      impostor.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sigImpostor);

    try {
      await program.methods
        .transferAuthority()
        .accounts({
          authority: impostor.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
          newAuthority: newAuth.publicKey,
        })
        .signers([impostor, newAuth])
        .rpc();

      expect.fail("Non-master should not be able to transfer authority");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.include("Unauthorized");
    }
  });

  it("Rejects update_roles from non-master", async () => {
    const impostor = Keypair.generate();
    const sigImpostor = await provider.connection.requestAirdrop(
      impostor.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sigImpostor);

    try {
      await program.methods
        .updateRoles({
          role: { pauser: {} },
          newHolder: impostor.publicKey,
        })
        .accounts({
          authority: impostor.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
        })
        .signers([impostor])
        .rpc();

      expect.fail("Non-master should not be able to update roles");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.include("Unauthorized");
    }
  });

  it("Rejects update_minter from non-master", async () => {
    const impostor = Keypair.generate();
    const sigImpostor = await provider.connection.requestAirdrop(
      impostor.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sigImpostor);

    const [minterInfoPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("minter"),
        configPda.toBuffer(),
        impostor.publicKey.toBuffer(),
      ],
      program.programId
    );

    try {
      await program.methods
        .updateMinter({
          isActive: true,
          mintQuota: new BN(999_999_999_999),
        })
        .accounts({
          authority: impostor.publicKey,
          config: configPda,
          roleRegistry: roleRegistryPda,
          minterInfo: minterInfoPda,
          minterWallet: impostor.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([impostor])
        .rpc();

      expect.fail("Non-master should not be able to create minters");
    } catch (err: any) {
      expect(err.error?.errorCode?.code || err.message).to.include("Unauthorized");
    }
  });
});
