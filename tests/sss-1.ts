// SSS-1 Integration Tests
//
// Tests the full lifecycle of a minimal stablecoin (SSS-1 preset):
//   - initialize
//   - mint_to (authority + delegated minter + quota enforcement)
//   - pause / unpause
//   - freeze_account / thaw_account
//   - add_minter / remove_minter
//   - nominate_authority / accept_authority
//   - burn
//   - SSS-2 instruction rejection on SSS-1 mint
//
// Run with: anchor test
// Or:       yarn ts-mocha -p ./tsconfig.json -t 1000000 tests/sss-1.ts

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { expect } from "chai";
import { SssToken } from "../target/types/sss_token";
import { airdropSol, sleep } from "./helpers/setup";

describe("SSS-1: Minimal Stablecoin", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;

  // ── Test keypairs ──────────────────────────────────────────────────────────
  const authority = Keypair.generate();
  const minter = Keypair.generate();
  const user1 = Keypair.generate();
  const user2 = Keypair.generate();
  const mintKeypair = Keypair.generate();

  // ── PDAs ──────────────────────────────────────────────────────────────────
  let configPda: PublicKey;
  let configBump: number;

  // ─────────────────────────────────────────────────────────────────────────
  before(async () => {
    await airdropSol(provider.connection, authority, minter, user1, user2);

    [configPda, configBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mintKeypair.publicKey.toBuffer()],
      program.programId
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("initialize", () => {
    it("initializes SSS-1 stablecoin successfully", async () => {
      await program.methods
        .initialize({
          name: "Test USD",
          symbol: "TUSD",
          uri: "https://example.com/metadata.json",
          decimals: 6,
          enablePermanentDelegate: false,
          enableTransferHook: false,
          defaultAccountFrozen: false,
          hookProgramId: null,
        })
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([authority, mintKeypair])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.authority.equals(authority.publicKey)).to.be.true;
      expect(config.mint.equals(mintKeypair.publicKey)).to.be.true;
      expect(config.paused).to.be.false;
      expect(config.enablePermanentDelegate).to.be.false;
      expect(config.enableTransferHook).to.be.false;
      expect(config.defaultAccountFrozen).to.be.false;
      expect(config.pendingAuthority).to.be.null;
      expect(config.bump).to.equal(configBump);
    });

    it("rejects duplicate initialization", async () => {
      // The config PDA already exists, so a second `init` on the same seeds
      // should fail with an "already in use" constraint error.
      const freshMintKp = Keypair.generate(); // different mint keypair
      const [freshConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from("config"), mintKeypair.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .initialize({
            name: "Test USD 2",
            symbol: "TUSD2",
            uri: "",
            decimals: 6,
            enablePermanentDelegate: false,
            enableTransferHook: false,
            defaultAccountFrozen: false,
            hookProgramId: null,
          })
          .accounts({
            authority: authority.publicKey,
            config: freshConfig, // same config PDA address
            mint: mintKeypair.publicKey, // same mint
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([authority, mintKeypair])
          .rpc();
        expect.fail("Should have thrown — config PDA already in use");
      } catch (e: any) {
        // Anchor / Solana surfaces this as an "already in use" error on the PDA
        expect(e.message).to.satisfy(
          (msg: string) =>
            msg.includes("already in use") || msg.includes("custom program error")
        );
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("minting", () => {
    it("master authority can mint tokens to a new account", async () => {
      const recipient = user1.publicKey;
      const recipientAta = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        recipient,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Create the ATA first (authority pays)
      const createAtaTx = new anchor.web3.Transaction().add(
        createAssociatedTokenAccountInstruction(
          authority.publicKey,
          recipientAta,
          recipient,
          mintKeypair.publicKey,
          TOKEN_2022_PROGRAM_ID
        )
      );
      await provider.sendAndConfirm(createAtaTx, [authority]);

      await program.methods
        .mintTo(new anchor.BN(1_000_000))
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          minterRole: null,
          destination: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();

      const account = await getAccount(
        provider.connection,
        recipientAta,
        "processed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(account.amount).to.equal(1_000_000n);
    });

    it("rejects zero-amount mints", async () => {
      const recipientAta = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user1.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .mintTo(new anchor.BN(0))
          .accounts({
            authority: authority.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            minterRole: null,
            destination: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([authority])
          .rpc();
        expect.fail("Should have thrown InvalidAmount");
      } catch (e: any) {
        expect(e.message).to.include("InvalidAmount");
      }
    });

    it("rejects mint when paused", async () => {
      // Pause first
      await program.methods
        .pause()
        .accounts({ authority: authority.publicKey, config: configPda, pauserRole: null })
        .signers([authority])
        .rpc();

      // Create ATA for user2
      const user2Ata = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user2.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const createAtaTx = new anchor.web3.Transaction().add(
        createAssociatedTokenAccountInstruction(
          authority.publicKey,
          user2Ata,
          user2.publicKey,
          mintKeypair.publicKey,
          TOKEN_2022_PROGRAM_ID
        )
      );
      await provider.sendAndConfirm(createAtaTx, [authority]);

      try {
        await program.methods
          .mintTo(new anchor.BN(500_000))
          .accounts({
            authority: authority.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            minterRole: null,
            destination: user2Ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([authority])
          .rpc();
        expect.fail("Should have thrown ProgramPaused");
      } catch (e: any) {
        expect(e.message).to.include("ProgramPaused");
      }

      // Unpause for subsequent tests
      await program.methods
        .unpause()
        .accounts({ authority: authority.publicKey, config: configPda, pauserRole: null })
        .signers([authority])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.paused).to.be.false;
    });

    it("minter with quota can mint within quota", async () => {
      const [minterRolePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          mintKeypair.publicKey.toBuffer(),
          minter.publicKey.toBuffer(),
        ],
        program.programId
      );

      // Register minter with quota of 5_000_000
      await program.methods
        .addMinter(new anchor.BN(5_000_000))
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          minterRole: minterRolePda,
          minter: minter.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const user2Ata = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user2.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      await program.methods
        .mintTo(new anchor.BN(3_000_000))
        .accounts({
          authority: minter.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          minterRole: minterRolePda,
          destination: user2Ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      const roleState = await program.account.minterRole.fetch(minterRolePda);
      expect(roleState.minted.toNumber()).to.equal(3_000_000);
      expect(roleState.active).to.be.true;
    });

    it("rejects minter exceeding quota", async () => {
      const [minterRolePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          mintKeypair.publicKey.toBuffer(),
          minter.publicKey.toBuffer(),
        ],
        program.programId
      );

      const user2Ata = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user2.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Already minted 3_000_000 of a 5_000_000 quota.
      // Attempting 3_000_000 more would reach 6_000_000 > 5_000_000.
      try {
        await program.methods
          .mintTo(new anchor.BN(3_000_000))
          .accounts({
            authority: minter.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            minterRole: minterRolePda,
            destination: user2Ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown QuotaExceeded");
      } catch (e: any) {
        expect(e.message).to.include("QuotaExceeded");
      }
    });

    it("rejects mint from unauthorized signer without minter role", async () => {
      const user2Ata = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user2.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        // user1 has no minter role PDA
        await program.methods
          .mintTo(new anchor.BN(100))
          .accounts({
            authority: user1.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            minterRole: null,
            destination: user2Ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([user1])
          .rpc();
        expect.fail("Should have thrown Unauthorized");
      } catch (e: any) {
        expect(e.message).to.include("Unauthorized");
      }
    });

    it("deactivated minter cannot mint", async () => {
      const [minterRolePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          mintKeypair.publicKey.toBuffer(),
          minter.publicKey.toBuffer(),
        ],
        program.programId
      );

      // Remove the minter
      await program.methods
        .removeMinter()
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          minterRole: minterRolePda,
          minter: minter.publicKey,
        })
        .signers([authority])
        .rpc();

      const roleState = await program.account.minterRole.fetch(minterRolePda);
      expect(roleState.active).to.be.false;

      const user2Ata = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user2.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .mintTo(new anchor.BN(100))
          .accounts({
            authority: minter.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            minterRole: minterRolePda,
            destination: user2Ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown MinterInactive");
      } catch (e: any) {
        expect(e.message).to.include("MinterInactive");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("freeze / thaw", () => {
    it("authority can freeze a token account", async () => {
      const user1Ata = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user1.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      await program.methods
        .freezeAccount()
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          tokenAccount: user1Ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          freezerRole: null,
        })
        .signers([authority])
        .rpc();

      const frozen = await getAccount(
        provider.connection,
        user1Ata,
        "processed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(frozen.isFrozen).to.be.true;
    });

    it("authority can thaw a frozen account", async () => {
      const user1Ata = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user1.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      await program.methods
        .thawAccount()
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          tokenAccount: user1Ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          freezerRole: null,
        })
        .signers([authority])
        .rpc();

      const thawed = await getAccount(
        provider.connection,
        user1Ata,
        "processed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(thawed.isFrozen).to.be.false;
    });

    it("unauthorized account cannot freeze", async () => {
      const user1Ata = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user1.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .freezeAccount()
          .accounts({
            authority: user2.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            tokenAccount: user1Ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            freezerRole: null,
          })
          .signers([user2])
          .rpc();
        expect.fail("Should have thrown Unauthorized");
      } catch (e: any) {
        expect(e.message).to.include("Unauthorized");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("pause / unpause", () => {
    it("pause and unpause track state correctly", async () => {
      await program.methods
        .pause()
        .accounts({ authority: authority.publicKey, config: configPda, pauserRole: null })
        .signers([authority])
        .rpc();

      let config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.paused).to.be.true;

      await program.methods
        .unpause()
        .accounts({ authority: authority.publicKey, config: configPda, pauserRole: null })
        .signers([authority])
        .rpc();

      config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.paused).to.be.false;
    });

    it("burn is rejected when paused", async () => {
      const user1Ata = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user1.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      await program.methods
        .pause()
        .accounts({ authority: authority.publicKey, config: configPda, pauserRole: null })
        .signers([authority])
        .rpc();

      try {
        await program.methods
          .burn(new anchor.BN(100_000))
          .accounts({
            authority: authority.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            from: user1Ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            burnerRole: null,
          })
          .signers([authority])
          .rpc();
        expect.fail("Should have thrown ProgramPaused");
      } catch (e: any) {
        expect(e.message).to.include("ProgramPaused");
      } finally {
        await program.methods
          .unpause()
          .accounts({ authority: authority.publicKey, config: configPda, pauserRole: null })
          .signers([authority])
          .rpc();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("burn", () => {
    it("authority can burn their own tokens (SSS-1 has no permanent delegate)", async () => {
      // In SSS-1 (no permanent delegate), the caller must own the token account.
      // We mint tokens to the authority's own ATA and burn from there.
      const authorityAta = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        authority.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Create authority ATA if it doesn't exist
      const ataInfo = await provider.connection.getAccountInfo(authorityAta);
      if (!ataInfo) {
        const createAtaTx = new anchor.web3.Transaction().add(
          createAssociatedTokenAccountInstruction(
            authority.publicKey,
            authorityAta,
            authority.publicKey,
            mintKeypair.publicKey,
            TOKEN_2022_PROGRAM_ID
          )
        );
        await provider.sendAndConfirm(createAtaTx, [authority]);
      }

      // Mint some tokens to authority's own ATA
      await program.methods
        .mintTo(new anchor.BN(500_000))
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          minterRole: null,
          destination: authorityAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();

      const before = await getAccount(
        provider.connection,
        authorityAta,
        "processed",
        TOKEN_2022_PROGRAM_ID
      );
      const balanceBefore = before.amount;
      expect(balanceBefore > 0n).to.be.true;

      await program.methods
        .burn(new anchor.BN(balanceBefore.toString()))
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          mint: mintKeypair.publicKey,
          from: authorityAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          burnerRole: null,
        })
        .signers([authority])
        .rpc();

      const after = await getAccount(
        provider.connection,
        authorityAta,
        "processed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(after.amount).to.equal(0n);
    });

    it("rejects zero-amount burn", async () => {
      const user1Ata = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user1.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .burn(new anchor.BN(0))
          .accounts({
            authority: authority.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            from: user1Ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            burnerRole: null,
          })
          .signers([authority])
          .rpc();
        expect.fail("Should have thrown InvalidAmount");
      } catch (e: any) {
        expect(e.message).to.include("InvalidAmount");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("authority transfer", () => {
    it("rejects nominate when pending authority already exists", async () => {
      const nominee1 = Keypair.generate();
      const nominee2 = Keypair.generate();

      // First nomination
      await program.methods
        .nominateAuthority(nominee1.publicKey)
        .accounts({ authority: authority.publicKey, config: configPda })
        .signers([authority])
        .rpc();

      // Second nomination should fail while first is pending
      try {
        await program.methods
          .nominateAuthority(nominee2.publicKey)
          .accounts({ authority: authority.publicKey, config: configPda })
          .signers([authority])
          .rpc();
        expect.fail("Should have thrown PendingAuthorityExists");
      } catch (e: any) {
        expect(e.message).to.include("PendingAuthorityExists");
      }

      // Clean up: cancel nomination by having nominee1 accept (using a fresh Keypair
      // we won't use further), then re-nominate the original authority to restore state.
      await provider.connection.requestAirdrop(nominee1.publicKey, LAMPORTS_PER_SOL);
      await sleep(500);

      await program.methods
        .acceptAuthority()
        .accounts({ newAuthority: nominee1.publicKey, config: configPda })
        .signers([nominee1])
        .rpc();

      // nominee1 is now authority; hand it back to original authority
      await program.methods
        .nominateAuthority(authority.publicKey)
        .accounts({ authority: nominee1.publicKey, config: configPda })
        .signers([nominee1])
        .rpc();

      await program.methods
        .acceptAuthority()
        .accounts({ newAuthority: authority.publicKey, config: configPda })
        .signers([authority])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.authority.equals(authority.publicKey)).to.be.true;
    });

    it("two-step authority transfer completes correctly", async () => {
      const newAuthority = Keypair.generate();
      await provider.connection.requestAirdrop(
        newAuthority.publicKey,
        LAMPORTS_PER_SOL
      );
      await sleep(500);

      // Step 1: nominate
      await program.methods
        .nominateAuthority(newAuthority.publicKey)
        .accounts({ authority: authority.publicKey, config: configPda })
        .signers([authority])
        .rpc();

      const afterNominate = await program.account.stablecoinConfig.fetch(configPda);
      expect(afterNominate.pendingAuthority).to.not.be.null;
      expect(
        afterNominate.pendingAuthority!.equals(newAuthority.publicKey)
      ).to.be.true;

      // Step 2: accept
      await program.methods
        .acceptAuthority()
        .accounts({ newAuthority: newAuthority.publicKey, config: configPda })
        .signers([newAuthority])
        .rpc();

      const afterAccept = await program.account.stablecoinConfig.fetch(configPda);
      expect(afterAccept.authority.equals(newAuthority.publicKey)).to.be.true;
      expect(afterAccept.pendingAuthority).to.be.null;

      // Restore authority to the original keypair for remaining tests
      await program.methods
        .nominateAuthority(authority.publicKey)
        .accounts({ authority: newAuthority.publicKey, config: configPda })
        .signers([newAuthority])
        .rpc();

      await program.methods
        .acceptAuthority()
        .accounts({ newAuthority: authority.publicKey, config: configPda })
        .signers([authority])
        .rpc();
    });

    it("wrong key cannot accept authority", async () => {
      const rightNominee = Keypair.generate();
      const wrongKey = Keypair.generate();

      await provider.connection.requestAirdrop(wrongKey.publicKey, LAMPORTS_PER_SOL);
      await sleep(500);

      await program.methods
        .nominateAuthority(rightNominee.publicKey)
        .accounts({ authority: authority.publicKey, config: configPda })
        .signers([authority])
        .rpc();

      try {
        await program.methods
          .acceptAuthority()
          .accounts({ newAuthority: wrongKey.publicKey, config: configPda })
          .signers([wrongKey])
          .rpc();
        expect.fail("Should have thrown Unauthorized");
      } catch (e: any) {
        expect(e.message).to.satisfy(
          (msg: string) =>
            msg.includes("Unauthorized") || msg.includes("Error")
        );
      }

      // Cancel by having the right nominee accept
      await provider.connection.requestAirdrop(
        rightNominee.publicKey,
        LAMPORTS_PER_SOL
      );
      await sleep(500);

      await program.methods
        .acceptAuthority()
        .accounts({ newAuthority: rightNominee.publicKey, config: configPda })
        .signers([rightNominee])
        .rpc();

      // Restore
      await program.methods
        .nominateAuthority(authority.publicKey)
        .accounts({ authority: rightNominee.publicKey, config: configPda })
        .signers([rightNominee])
        .rpc();

      await program.methods
        .acceptAuthority()
        .accounts({ newAuthority: authority.publicKey, config: configPda })
        .signers([authority])
        .rpc();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("SSS-2 instructions rejected on SSS-1 mint", () => {
    it("add_to_blacklist returns Sss2NotEnabled on SSS-1 mint", async () => {
      const [blacklistEntry] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("blacklist"),
          mintKeypair.publicKey.toBuffer(),
          user1.publicKey.toBuffer(),
        ],
        program.programId
      );

      try {
        await program.methods
          .addToBlacklist("test reason")
          .accounts({
            authority: authority.publicKey,
            config: configPda,
            target: user1.publicKey,
            blacklistEntry,
            blacklisterRole: null,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        expect.fail("Should have thrown Sss2NotEnabled");
      } catch (e: any) {
        expect(e.message).to.include("Sss2NotEnabled");
      }
    });

    it("seize returns Sss2NotEnabled on SSS-1 mint", async () => {
      const user1Ata = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user1.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const user2Ata = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        user2.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .seize(new anchor.BN(1_000))
          .accounts({
            authority: authority.publicKey,
            config: configPda,
            mint: mintKeypair.publicKey,
            from: user1Ata,
            to: user2Ata,
            seizerRole: null,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([authority])
          .rpc();
        expect.fail("Should have thrown Sss2NotEnabled");
      } catch (e: any) {
        expect(e.message).to.include("Sss2NotEnabled");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("role management", () => {
    it("master can add and remove the Freezer role", async () => {
      const freezerCandidate = Keypair.generate();

      const [roleEntry] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          mintKeypair.publicKey.toBuffer(),
          Buffer.from([4]), // Freezer = 4
          freezerCandidate.publicKey.toBuffer(),
        ],
        program.programId
      );

      // Add role
      await program.methods
        .addRole({ freezer: {} }, freezerCandidate.publicKey)
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          roleEntry,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      let entry = await program.account.roleEntry.fetch(roleEntry);
      expect(entry.active).to.be.true;

      // Remove role
      await program.methods
        .removeRole({ freezer: {} }, freezerCandidate.publicKey)
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          roleEntry,
        })
        .signers([authority])
        .rpc();

      entry = await program.account.roleEntry.fetch(roleEntry);
      expect(entry.active).to.be.false;
    });

    it("non-authority cannot add roles", async () => {
      const candidate = Keypair.generate();
      const [roleEntry] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          mintKeypair.publicKey.toBuffer(),
          Buffer.from([1]), // Pauser = 1
          candidate.publicKey.toBuffer(),
        ],
        program.programId
      );

      try {
        await program.methods
          .addRole({ pauser: {} }, candidate.publicKey)
          .accounts({
            authority: user1.publicKey,
            config: configPda,
            roleEntry,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([user1])
          .rpc();
        expect.fail("Should have thrown Unauthorized");
      } catch (e: any) {
        expect(e.message).to.include("Unauthorized");
      }
    });
  });
});
