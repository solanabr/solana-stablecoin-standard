import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Stablecoin } from "../target/types/stablecoin";
import { TransferHook } from "../target/types/transfer_hook";
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

describe("Solana Stablecoin Standard", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const stablecoinProgram = anchor.workspace
    .Stablecoin as Program<Stablecoin>;
  const transferHookProgram = anchor.workspace
    .TransferHook as Program<TransferHook>;

  const authority = provider.wallet as anchor.Wallet;
  const mintKeypair = Keypair.generate();
  const masterMinter = Keypair.generate();
  const pauser = Keypair.generate();
  const blacklister = Keypair.generate();
  const minter = Keypair.generate();
  const recipient = Keypair.generate();
  const recipient2 = Keypair.generate();

  // PDAs
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mintKeypair.publicKey.toBuffer()],
    stablecoinProgram.programId
  );

  const [mintAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("authority"), mintKeypair.publicKey.toBuffer()],
    stablecoinProgram.programId
  );

  const [minterPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("minter"),
      mintKeypair.publicKey.toBuffer(),
      minter.publicKey.toBuffer(),
    ],
    stablecoinProgram.programId
  );

  // Helper to airdrop SOL
  async function airdrop(pubkey: PublicKey, amount = 10 * LAMPORTS_PER_SOL) {
    const sig = await provider.connection.requestAirdrop(pubkey, amount);
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  // Helper to create ATA
  async function createATA(
    owner: PublicKey,
    payer: Keypair | anchor.Wallet
  ): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const ix = createAssociatedTokenAccountInstruction(
      payer instanceof Keypair ? payer.publicKey : payer.publicKey,
      ata,
      owner,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    );
    const tx = new anchor.web3.Transaction().add(ix);
    if (payer instanceof Keypair) {
      await provider.sendAndConfirm(tx, [payer]);
    } else {
      await provider.sendAndConfirm(tx);
    }
    return ata;
  }

  before(async () => {
    await airdrop(masterMinter.publicKey);
    await airdrop(pauser.publicKey);
    await airdrop(blacklister.publicKey);
    await airdrop(minter.publicKey);
    await airdrop(recipient.publicKey);
    await airdrop(recipient2.publicKey);
  });

  // ============== SSS-1 Tests ==============
  describe("SSS-1 (Minimal Preset)", () => {
    const sss1Mint = Keypair.generate();
    const [sss1Config] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), sss1Mint.publicKey.toBuffer()],
      stablecoinProgram.programId
    );
    const [sss1Authority] = PublicKey.findProgramAddressSync(
      [Buffer.from("authority"), sss1Mint.publicKey.toBuffer()],
      stablecoinProgram.programId
    );

    it("creates SSS-1 mint with correct extensions", async () => {
      const params = {
        preset: { sss1: {} },
        name: "TestUSD",
        symbol: "TUSD",
        uri: "https://example.com/tusd.json",
        decimals: 6,
        enablePermanentDelegate: null,
        enableTransferHook: null,
        enableConfidentialTransfers: null,
        defaultAccountFrozen: null,
        masterMinter: masterMinter.publicKey,
        pauser: pauser.publicKey,
        blacklister: null,
        auditorElgamalPubkey: null,
      };

      await stablecoinProgram.methods
        .initialize(params)
        .accounts({
          authority: authority.publicKey,
          mint: sss1Mint.publicKey,
          config: sss1Config,
          mintAuthority: sss1Authority,
          transferHookProgram: null,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([sss1Mint])
        .rpc();

      // Verify config
      const config = await stablecoinProgram.account.stablecoinConfig.fetch(
        sss1Config
      );
      expect(config.name).to.equal("TestUSD");
      expect(config.symbol).to.equal("TUSD");
      expect(config.decimals).to.equal(6);
      expect(config.enableTransferHook).to.be.false;
      expect(config.enablePermanentDelegate).to.be.false;
      expect(config.enableConfidentialTransfers).to.be.false;
      expect(config.isPaused).to.be.false;
      expect(config.totalMinted.toNumber()).to.equal(0);
      expect(config.totalBurned.toNumber()).to.equal(0);
      expect(config.owner.toString()).to.equal(
        authority.publicKey.toString()
      );
      expect(config.masterMinter.toString()).to.equal(
        masterMinter.publicKey.toString()
      );
    });

    it("adds a minter with allowance", async () => {
      const [minterPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          sss1Mint.publicKey.toBuffer(),
          minter.publicKey.toBuffer(),
        ],
        stablecoinProgram.programId
      );

      await stablecoinProgram.methods
        .addMinter(minter.publicKey, new anchor.BN(1_000_000_000))
        .accounts({
          authority: masterMinter.publicKey,
          config: sss1Config,
          minterAllowance: minterPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([masterMinter])
        .rpc();

      const minterAccount =
        await stablecoinProgram.account.minterAllowance.fetch(minterPda);
      expect(minterAccount.allowance.toNumber()).to.equal(1_000_000_000);
      expect(minterAccount.isActive).to.be.true;
      expect(minterAccount.totalMinted.toNumber()).to.equal(0);
    });

    it("mints within allowance", async () => {
      // Create recipient ATA
      const recipientAta = getAssociatedTokenAddressSync(
        sss1Mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const ix = createAssociatedTokenAccountInstruction(
        authority.publicKey,
        recipientAta,
        recipient.publicKey,
        sss1Mint.publicKey,
        TOKEN_2022_PROGRAM_ID
      );
      await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix));

      const [minterPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          sss1Mint.publicKey.toBuffer(),
          minter.publicKey.toBuffer(),
        ],
        stablecoinProgram.programId
      );

      await stablecoinProgram.methods
        .mintTokens(new anchor.BN(500_000_000))
        .accounts({
          minter: minter.publicKey,
          config: sss1Config,
          minterAllowance: minterPda,
          mint: sss1Mint.publicKey,
          mintAuthority: sss1Authority,
          recipientTokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      // Verify minter allowance decreased
      const minterAccount =
        await stablecoinProgram.account.minterAllowance.fetch(minterPda);
      expect(minterAccount.allowance.toNumber()).to.equal(500_000_000);
      expect(minterAccount.totalMinted.toNumber()).to.equal(500_000_000);

      // Verify config total_minted increased
      const config = await stablecoinProgram.account.stablecoinConfig.fetch(
        sss1Config
      );
      expect(config.totalMinted.toNumber()).to.equal(500_000_000);
    });

    it("fails when allowance exceeded", async () => {
      const recipientAta = getAssociatedTokenAddressSync(
        sss1Mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const [minterPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          sss1Mint.publicKey.toBuffer(),
          minter.publicKey.toBuffer(),
        ],
        stablecoinProgram.programId
      );

      try {
        await stablecoinProgram.methods
          .mintTokens(new anchor.BN(999_000_000_000))
          .accounts({
            minter: minter.publicKey,
            config: sss1Config,
            minterAllowance: minterPda,
            mint: sss1Mint.publicKey,
            mintAuthority: sss1Authority,
            recipientTokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("AllowanceExceeded");
      }
    });

    it("burns tokens", async () => {
      // Minter needs tokens to burn
      const minterAta = getAssociatedTokenAddressSync(
        sss1Mint.publicKey,
        minter.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const ix = createAssociatedTokenAccountInstruction(
        authority.publicKey,
        minterAta,
        minter.publicKey,
        sss1Mint.publicKey,
        TOKEN_2022_PROGRAM_ID
      );
      await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix));

      const [minterPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          sss1Mint.publicKey.toBuffer(),
          minter.publicKey.toBuffer(),
        ],
        stablecoinProgram.programId
      );

      // Mint to minter
      await stablecoinProgram.methods
        .mintTokens(new anchor.BN(100_000_000))
        .accounts({
          minter: minter.publicKey,
          config: sss1Config,
          minterAllowance: minterPda,
          mint: sss1Mint.publicKey,
          mintAuthority: sss1Authority,
          recipientTokenAccount: minterAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      // Burn
      await stablecoinProgram.methods
        .burnTokens(new anchor.BN(50_000_000))
        .accounts({
          burner: minter.publicKey,
          config: sss1Config,
          minterAllowance: minterPda,
          mint: sss1Mint.publicKey,
          burnerTokenAccount: minterAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      const config = await stablecoinProgram.account.stablecoinConfig.fetch(
        sss1Config
      );
      expect(config.totalBurned.toNumber()).to.equal(50_000_000);
    });

    it("pauses and prevents minting", async () => {
      await stablecoinProgram.methods
        .pause()
        .accounts({
          pauser: pauser.publicKey,
          config: sss1Config,
        })
        .signers([pauser])
        .rpc();

      const config = await stablecoinProgram.account.stablecoinConfig.fetch(
        sss1Config
      );
      expect(config.isPaused).to.be.true;

      // Try to mint while paused
      const recipientAta = getAssociatedTokenAddressSync(
        sss1Mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const [minterPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          sss1Mint.publicKey.toBuffer(),
          minter.publicKey.toBuffer(),
        ],
        stablecoinProgram.programId
      );

      try {
        await stablecoinProgram.methods
          .mintTokens(new anchor.BN(100))
          .accounts({
            minter: minter.publicKey,
            config: sss1Config,
            minterAllowance: minterPda,
            mint: sss1Mint.publicKey,
            mintAuthority: sss1Authority,
            recipientTokenAccount: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("TokenPaused");
      }
    });

    it("unpauses", async () => {
      await stablecoinProgram.methods
        .unpause()
        .accounts({
          pauser: pauser.publicKey,
          config: sss1Config,
        })
        .signers([pauser])
        .rpc();

      const config = await stablecoinProgram.account.stablecoinConfig.fetch(
        sss1Config
      );
      expect(config.isPaused).to.be.false;
    });

    it("freezes and thaws an account", async () => {
      const recipientAta = getAssociatedTokenAddressSync(
        sss1Mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      await stablecoinProgram.methods
        .freezeAccount()
        .accounts({
          authority: authority.publicKey,
          config: sss1Config,
          mint: sss1Mint.publicKey,
          mintAuthority: sss1Authority,
          tokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Thaw
      await stablecoinProgram.methods
        .thawAccount()
        .accounts({
          authority: authority.publicKey,
          config: sss1Config,
          mint: sss1Mint.publicKey,
          mintAuthority: sss1Authority,
          tokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    });

    it("two-step ownership transfer works", async () => {
      const newOwner = Keypair.generate();
      await airdrop(newOwner.publicKey);

      await stablecoinProgram.methods
        .transferOwnership(newOwner.publicKey)
        .accounts({
          owner: authority.publicKey,
          config: sss1Config,
        })
        .rpc();

      let config = await stablecoinProgram.account.stablecoinConfig.fetch(
        sss1Config
      );
      expect(config.pendingOwner.toString()).to.equal(
        newOwner.publicKey.toString()
      );

      await stablecoinProgram.methods
        .acceptOwnership()
        .accounts({
          newOwner: newOwner.publicKey,
          config: sss1Config,
        })
        .signers([newOwner])
        .rpc();

      config = await stablecoinProgram.account.stablecoinConfig.fetch(
        sss1Config
      );
      expect(config.owner.toString()).to.equal(
        newOwner.publicKey.toString()
      );
      expect(config.pendingOwner).to.be.null;

      // Transfer back for subsequent tests
      await stablecoinProgram.methods
        .transferOwnership(authority.publicKey)
        .accounts({
          owner: newOwner.publicKey,
          config: sss1Config,
        })
        .signers([newOwner])
        .rpc();

      await stablecoinProgram.methods
        .acceptOwnership()
        .accounts({
          newOwner: authority.publicKey,
          config: sss1Config,
        })
        .rpc();
    });

    it("blacklist fails on SSS-1 (feature not enabled)", async () => {
      const [blacklistPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("blacklist"),
          sss1Mint.publicKey.toBuffer(),
          recipient.publicKey.toBuffer(),
        ],
        stablecoinProgram.programId
      );

      try {
        await stablecoinProgram.methods
          .blacklistAdd("test")
          .accounts({
            blacklister: authority.publicKey,
            config: sss1Config,
            mint: sss1Mint.publicKey,
            wallet: recipient.publicKey,
            blacklistEntry: blacklistPda,
            mintAuthority: sss1Authority,
            walletTokenAccount: null,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("FeatureNotEnabled");
      }
    });
  });

  // ============== SSS-2 Tests ==============
  describe("SSS-2 (Compliant Preset)", () => {
    const sss2Mint = Keypair.generate();
    const [sss2Config] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), sss2Mint.publicKey.toBuffer()],
      stablecoinProgram.programId
    );
    const [sss2Authority] = PublicKey.findProgramAddressSync(
      [Buffer.from("authority"), sss2Mint.publicKey.toBuffer()],
      stablecoinProgram.programId
    );

    it("creates SSS-2 mint with transfer hook + permanent delegate", async () => {
      const params = {
        preset: { sss2: {} },
        name: "ComplianceUSD",
        symbol: "CUSD",
        uri: "https://example.com/cusd.json",
        decimals: 6,
        enablePermanentDelegate: null,
        enableTransferHook: null,
        enableConfidentialTransfers: null,
        defaultAccountFrozen: null,
        masterMinter: masterMinter.publicKey,
        pauser: pauser.publicKey,
        blacklister: blacklister.publicKey,
        auditorElgamalPubkey: null,
      };

      await stablecoinProgram.methods
        .initialize(params)
        .accounts({
          authority: authority.publicKey,
          mint: sss2Mint.publicKey,
          config: sss2Config,
          mintAuthority: sss2Authority,
          transferHookProgram: transferHookProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([sss2Mint])
        .rpc();

      const config = await stablecoinProgram.account.stablecoinConfig.fetch(
        sss2Config
      );
      expect(config.name).to.equal("ComplianceUSD");
      expect(config.enableTransferHook).to.be.true;
      expect(config.enablePermanentDelegate).to.be.true;
      expect(config.enableConfidentialTransfers).to.be.false;
      expect(config.blacklister.toString()).to.equal(
        blacklister.publicKey.toString()
      );
    });

    it("initializes transfer hook extra account meta list", async () => {
      const [extraAccountMetaList] = PublicKey.findProgramAddressSync(
        [Buffer.from("extra-account-metas"), sss2Mint.publicKey.toBuffer()],
        transferHookProgram.programId
      );

      await transferHookProgram.methods
        .initializeExtraAccountMetaList()
        .accounts({
          payer: authority.publicKey,
          extraAccountMetaList,
          mint: sss2Mint.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    it("adds minter and mints tokens", async () => {
      const [minterPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          sss2Mint.publicKey.toBuffer(),
          minter.publicKey.toBuffer(),
        ],
        stablecoinProgram.programId
      );

      await stablecoinProgram.methods
        .addMinter(minter.publicKey, new anchor.BN(10_000_000_000))
        .accounts({
          authority: masterMinter.publicKey,
          config: sss2Config,
          minterAllowance: minterPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([masterMinter])
        .rpc();

      // Create recipient ATA
      const recipientAta = getAssociatedTokenAddressSync(
        sss2Mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const ix = createAssociatedTokenAccountInstruction(
        authority.publicKey,
        recipientAta,
        recipient.publicKey,
        sss2Mint.publicKey,
        TOKEN_2022_PROGRAM_ID
      );
      await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix));

      // Mint
      await stablecoinProgram.methods
        .mintTokens(new anchor.BN(5_000_000_000))
        .accounts({
          minter: minter.publicKey,
          config: sss2Config,
          minterAllowance: minterPda,
          mint: sss2Mint.publicKey,
          mintAuthority: sss2Authority,
          recipientTokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      const config = await stablecoinProgram.account.stablecoinConfig.fetch(
        sss2Config
      );
      expect(config.totalMinted.toNumber()).to.equal(5_000_000_000);
    });

    it("adds address to blacklist", async () => {
      const [blacklistPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("blacklist"),
          sss2Mint.publicKey.toBuffer(),
          recipient.publicKey.toBuffer(),
        ],
        stablecoinProgram.programId
      );

      const recipientAta = getAssociatedTokenAddressSync(
        sss2Mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      await stablecoinProgram.methods
        .blacklistAdd("OFAC match")
        .accounts({
          blacklister: blacklister.publicKey,
          config: sss2Config,
          mint: sss2Mint.publicKey,
          wallet: recipient.publicKey,
          blacklistEntry: blacklistPda,
          mintAuthority: sss2Authority,
          walletTokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([blacklister])
        .rpc();

      const entry = await stablecoinProgram.account.blacklistEntry.fetch(
        blacklistPda
      );
      expect(entry.reason).to.equal("OFAC match");
      expect(entry.wallet.toString()).to.equal(
        recipient.publicKey.toString()
      );
      expect(entry.blacklistedBy.toString()).to.equal(
        blacklister.publicKey.toString()
      );
    });

    it("seizes tokens from blacklisted account", async () => {
      const recipientAta = getAssociatedTokenAddressSync(
        sss2Mint.publicKey,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Create treasury ATA
      const treasuryAta = getAssociatedTokenAddressSync(
        sss2Mint.publicKey,
        authority.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const ix = createAssociatedTokenAccountInstruction(
        authority.publicKey,
        treasuryAta,
        authority.publicKey,
        sss2Mint.publicKey,
        TOKEN_2022_PROGRAM_ID
      );
      await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix));

      const [blacklistPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("blacklist"),
          sss2Mint.publicKey.toBuffer(),
          recipient.publicKey.toBuffer(),
        ],
        stablecoinProgram.programId
      );

      // First thaw the account so we can seize
      await stablecoinProgram.methods
        .thawAccount()
        .accounts({
          authority: authority.publicKey,
          config: sss2Config,
          mint: sss2Mint.publicKey,
          mintAuthority: sss2Authority,
          tokenAccount: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Compute transfer hook extra accounts for seize
      // The transfer authority is the mint_authority PDA (permanent delegate)
      const [extraAccountMetaList] = PublicKey.findProgramAddressSync(
        [Buffer.from("extra-account-metas"), sss2Mint.publicKey.toBuffer()],
        transferHookProgram.programId
      );

      // Source blacklist PDA: derived from ["blacklist", mint, authority_of_transfer]
      // Since permanent delegate (sss2Authority) is the transfer authority,
      // this PDA won't exist (nobody blacklisted the PDA), which is correct
      const [sourceBlacklistForDelegate] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("blacklist"),
          sss2Mint.publicKey.toBuffer(),
          sss2Authority.toBuffer(),
        ],
        stablecoinProgram.programId
      );

      // Dest blacklist PDA: derived from dest token account owner
      const [destBlacklist] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("blacklist"),
          sss2Mint.publicKey.toBuffer(),
          authority.publicKey.toBuffer(),
        ],
        stablecoinProgram.programId
      );

      await stablecoinProgram.methods
        .seize(new anchor.BN(1_000_000_000))
        .accounts({
          owner: authority.publicKey,
          config: sss2Config,
          mint: sss2Mint.publicKey,
          mintAuthority: sss2Authority,
          blacklistEntry: blacklistPda,
          targetWallet: recipient.publicKey,
          sourceTokenAccount: recipientAta,
          treasuryTokenAccount: treasuryAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: extraAccountMetaList, isSigner: false, isWritable: false },
          { pubkey: transferHookProgram.programId, isSigner: false, isWritable: false },
          { pubkey: stablecoinProgram.programId, isSigner: false, isWritable: false },
          { pubkey: sss2Config, isSigner: false, isWritable: false },
          { pubkey: sourceBlacklistForDelegate, isSigner: false, isWritable: false },
          { pubkey: destBlacklist, isSigner: false, isWritable: false },
        ])
        .rpc();
    });

    it("removes address from blacklist", async () => {
      const [blacklistPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("blacklist"),
          sss2Mint.publicKey.toBuffer(),
          recipient.publicKey.toBuffer(),
        ],
        stablecoinProgram.programId
      );

      await stablecoinProgram.methods
        .blacklistRemove()
        .accounts({
          blacklister: blacklister.publicKey,
          config: sss2Config,
          mint: sss2Mint.publicKey,
          wallet: recipient.publicKey,
          blacklistEntry: blacklistPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([blacklister])
        .rpc();

      // Verify PDA is closed
      const info = await provider.connection.getAccountInfo(blacklistPda);
      expect(info).to.be.null;
    });
  });

  // ============== Role Tests ==============
  describe("Roles", () => {
    const roleMint = Keypair.generate();
    const [roleConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), roleMint.publicKey.toBuffer()],
      stablecoinProgram.programId
    );
    const [roleAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("authority"), roleMint.publicKey.toBuffer()],
      stablecoinProgram.programId
    );

    before(async () => {
      const params = {
        preset: { sss1: {} },
        name: "RoleTestUSD",
        symbol: "RTUSD",
        uri: "https://example.com/rtusd.json",
        decimals: 6,
        enablePermanentDelegate: null,
        enableTransferHook: null,
        enableConfidentialTransfers: null,
        defaultAccountFrozen: null,
        masterMinter: masterMinter.publicKey,
        pauser: pauser.publicKey,
        blacklister: null,
        auditorElgamalPubkey: null,
      };

      await stablecoinProgram.methods
        .initialize(params)
        .accounts({
          authority: authority.publicKey,
          mint: roleMint.publicKey,
          config: roleConfig,
          mintAuthority: roleAuthority,
          transferHookProgram: null,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([roleMint])
        .rpc();
    });

    it("owner can assign pauser role", async () => {
      const newPauser = Keypair.generate();
      const roleBytes = Buffer.from("pauser");
      const [rolePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          roleMint.publicKey.toBuffer(),
          roleBytes,
          newPauser.publicKey.toBuffer(),
        ],
        stablecoinProgram.programId
      );

      await stablecoinProgram.methods
        .assignRole({ pauser: {} }, newPauser.publicKey)
        .accounts({
          authority: authority.publicKey,
          config: roleConfig,
          roleAssignment: rolePda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const assignment =
        await stablecoinProgram.account.roleAssignment.fetch(rolePda);
      expect(assignment.assignee.toString()).to.equal(
        newPauser.publicKey.toString()
      );

      // Verify config updated
      const config = await stablecoinProgram.account.stablecoinConfig.fetch(
        roleConfig
      );
      expect(config.pauser.toString()).to.equal(
        newPauser.publicKey.toString()
      );
    });

    it("minter cannot assign roles", async () => {
      const newBlacklister = Keypair.generate();
      const roleBytes = Buffer.from("blacklister");
      const [rolePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          roleMint.publicKey.toBuffer(),
          roleBytes,
          newBlacklister.publicKey.toBuffer(),
        ],
        stablecoinProgram.programId
      );

      try {
        await stablecoinProgram.methods
          .assignRole({ blacklister: {} }, newBlacklister.publicKey)
          .accounts({
            authority: minter.publicKey,
            config: roleConfig,
            roleAssignment: rolePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });

    it("updates minter allowance", async () => {
      const [minterPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          roleMint.publicKey.toBuffer(),
          minter.publicKey.toBuffer(),
        ],
        stablecoinProgram.programId
      );

      // First add a minter
      await stablecoinProgram.methods
        .addMinter(minter.publicKey, new anchor.BN(100))
        .accounts({
          authority: masterMinter.publicKey,
          config: roleConfig,
          minterAllowance: minterPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([masterMinter])
        .rpc();

      // Update allowance
      await stablecoinProgram.methods
        .updateMinterAllowance(new anchor.BN(999))
        .accounts({
          authority: masterMinter.publicKey,
          config: roleConfig,
          minterAllowance: minterPda,
        })
        .signers([masterMinter])
        .rpc();

      const ma = await stablecoinProgram.account.minterAllowance.fetch(
        minterPda
      );
      expect(ma.allowance.toNumber()).to.equal(999);
    });
  });
});
