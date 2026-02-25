import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedWithTransferHookInstruction,
} from "@solana/spl-token";
import { expect } from "chai";
import { SssCore } from "../target/types/sss_core";
import { SssTransferHook } from "../target/types/sss_transfer_hook";
import {
  createSss2Mint,
  createTokenAccount,
  deriveRolePda,
  deriveBlacklistPda,
  deriveExtraAccountMetasPda,
  grantRole,
  fetchConfig,
  getTokenBalance,
  airdropSol,
  ROLE_ADMIN,
  ROLE_MINTER,
  ROLE_FREEZER,
  CreateSss2MintResult,
} from "./helpers";

describe("Transfer Hook", () => {
  const provider = anchor.AnchorProvider.env();
  provider.opts.commitment = "confirmed";
  anchor.setProvider(provider);

  const coreProgram = anchor.workspace.SssCore as Program<SssCore>;
  const hookProgram = anchor.workspace
    .SssTransferHook as Program<SssTransferHook>;

  let mintResult: CreateSss2MintResult;
  let minterRolePda: PublicKey;
  let freezerRolePda: PublicKey;

  // Token accounts
  let aliceAta: PublicKey;
  let bobAta: PublicKey;
  let charlieAta: PublicKey;
  let daveAta: PublicKey;

  // Keypairs
  const minter = Keypair.generate();
  const freezer = Keypair.generate();
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const charlie = Keypair.generate();
  const dave = Keypair.generate();
  const nonAdmin = Keypair.generate();

  const DECIMALS = 6;
  const MINT_AMOUNT = 50_000_000; // 50 tokens

  before(async () => {
    // Fund all test accounts
    await Promise.all([
      airdropSol(provider.connection, minter.publicKey, 5),
      airdropSol(provider.connection, freezer.publicKey, 5),
      airdropSol(provider.connection, alice.publicKey, 5),
      airdropSol(provider.connection, bob.publicKey, 5),
      airdropSol(provider.connection, charlie.publicKey, 5),
      airdropSol(provider.connection, dave.publicKey, 5),
      airdropSol(provider.connection, nonAdmin.publicKey, 5),
    ]);
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Initialize ExtraAccountMetas
  // ─────────────────────────────────────────────────────────────

  describe("Initialize ExtraAccountMetas", () => {
    it("creates SSS-2 mint with ExtraAccountMetas PDA initialized", async () => {
      mintResult = await createSss2Mint(provider, coreProgram, hookProgram, {
        name: "Hook Test USD",
        symbol: "hUSD",
        uri: "https://example.com/husd.json",
        decimals: DECIMALS,
        supplyCap: null,
      });

      // Verify config was created with preset 2
      const config = await fetchConfig(coreProgram, mintResult.configPda);
      expect(config.preset).to.equal(2);
      expect(config.mint.toBase58()).to.equal(
        mintResult.mint.publicKey.toBase58(),
      );

      // Verify ExtraAccountMetas PDA exists and is owned by the hook program
      const extraMetasInfo = await provider.connection.getAccountInfo(
        mintResult.extraAccountMetasPda,
      );
      expect(extraMetasInfo).to.not.be.null;
      expect(extraMetasInfo!.owner.toBase58()).to.equal(
        hookProgram.programId.toBase58(),
      );
      expect(extraMetasInfo!.data.length).to.be.greaterThan(0);
    });

    it("derives ExtraAccountMetas PDA with correct seeds", async () => {
      const [expectedPda] = deriveExtraAccountMetasPda(
        mintResult.mint.publicKey,
        hookProgram.programId,
      );
      expect(mintResult.extraAccountMetasPda.toBase58()).to.equal(
        expectedPda.toBase58(),
      );
    });

    it("rejects duplicate ExtraAccountMetas initialization", async () => {
      const [extraAccountMetasPda] = deriveExtraAccountMetasPda(
        mintResult.mint.publicKey,
        hookProgram.programId,
      );

      try {
        await hookProgram.methods
          .initializeExtraAccountMetas()
          .accountsPartial({
            payer: provider.wallet.publicKey,
            extraAccountMetas: extraAccountMetasPda,
            mint: mintResult.mint.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should reject duplicate initialization");
      } catch (err: any) {
        // PDA already exists — SystemProgram.createAccount fails
        expect(err).to.exist;
        expect(err.toString()).to.not.include("Should reject");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Setup roles and token accounts (shared for transfer tests)
  // ─────────────────────────────────────────────────────────────

  describe("Transfer Hook Setup", () => {
    it("grants minter and freezer roles", async () => {
      minterRolePda = await grantRole(
        coreProgram,
        mintResult.configPda,
        mintResult.adminRolePda,
        minter.publicKey,
        ROLE_MINTER,
      );
      freezerRolePda = await grantRole(
        coreProgram,
        mintResult.configPda,
        mintResult.adminRolePda,
        freezer.publicKey,
        ROLE_FREEZER,
      );
    });

    it("creates and thaws token accounts for all participants", async () => {
      // Create ATAs (they start frozen due to DefaultAccountState)
      aliceAta = await createTokenAccount(
        provider,
        mintResult.mint.publicKey,
        alice.publicKey,
      );
      bobAta = await createTokenAccount(
        provider,
        mintResult.mint.publicKey,
        bob.publicKey,
      );
      charlieAta = await createTokenAccount(
        provider,
        mintResult.mint.publicKey,
        charlie.publicKey,
      );
      daveAta = await createTokenAccount(
        provider,
        mintResult.mint.publicKey,
        dave.publicKey,
      );

      // Thaw all accounts
      for (const ata of [aliceAta, bobAta, charlieAta, daveAta]) {
        await coreProgram.methods
          .thawAccount()
          .accountsPartial({
            freezer: freezer.publicKey,
            config: mintResult.configPda,
            freezerRole: freezerRolePda,
            mint: mintResult.mint.publicKey,
            tokenAccount: ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([freezer])
          .rpc();
      }

      // Mint tokens to alice and charlie for transfer tests
      await coreProgram.methods
        .mintTokens(new BN(MINT_AMOUNT))
        .accountsPartial({
          minter: minter.publicKey,
          config: mintResult.configPda,
          minterRole: minterRolePda,
          mint: mintResult.mint.publicKey,
          to: aliceAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      await coreProgram.methods
        .mintTokens(new BN(MINT_AMOUNT))
        .accountsPartial({
          minter: minter.publicKey,
          config: mintResult.configPda,
          minterRole: minterRolePda,
          mint: mintResult.mint.publicKey,
          to: charlieAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      const aliceBalance = await getTokenBalance(
        provider.connection,
        aliceAta,
      );
      expect(aliceBalance.toString()).to.equal(MINT_AMOUNT.toString());
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Transfer succeeds for non-blacklisted accounts
  // ─────────────────────────────────────────────────────────────

  describe("Transfer succeeds for non-blacklisted", () => {
    it("allows transfer between two non-blacklisted accounts", async () => {
      const transferAmount = BigInt(5_000_000); // 5 tokens

      const transferIx =
        await createTransferCheckedWithTransferHookInstruction(
          provider.connection,
          aliceAta,
          mintResult.mint.publicKey,
          bobAta,
          alice.publicKey,
          transferAmount,
          DECIMALS,
          undefined,
          "confirmed",
          TOKEN_2022_PROGRAM_ID,
        );

      const tx = new Transaction().add(transferIx);
      await provider.sendAndConfirm(tx, [alice]);

      const aliceBalance = await getTokenBalance(
        provider.connection,
        aliceAta,
      );
      const bobBalance = await getTokenBalance(provider.connection, bobAta);

      expect(aliceBalance.toString()).to.equal("45000000"); // 50M - 5M
      expect(bobBalance.toString()).to.equal("5000000");
    });

    it("allows multiple sequential transfers", async () => {
      // Bob transfers to Dave
      const transferAmount = BigInt(2_000_000); // 2 tokens

      const transferIx =
        await createTransferCheckedWithTransferHookInstruction(
          provider.connection,
          bobAta,
          mintResult.mint.publicKey,
          daveAta,
          bob.publicKey,
          transferAmount,
          DECIMALS,
          undefined,
          "confirmed",
          TOKEN_2022_PROGRAM_ID,
        );

      const tx = new Transaction().add(transferIx);
      await provider.sendAndConfirm(tx, [bob]);

      const bobBalance = await getTokenBalance(provider.connection, bobAta);
      const daveBalance = await getTokenBalance(provider.connection, daveAta);

      expect(bobBalance.toString()).to.equal("3000000"); // 5M - 2M
      expect(daveBalance.toString()).to.equal("2000000");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Blacklist add
  // ─────────────────────────────────────────────────────────────

  describe("Blacklist add", () => {
    it("admin adds charlie to blacklist with reason", async () => {
      const [blacklistPda] = deriveBlacklistPda(
        mintResult.mint.publicKey,
        charlie.publicKey,
        hookProgram.programId,
      );

      await hookProgram.methods
        .addToBlacklist("OFAC sanctioned entity")
        .accountsPartial({
          authority: provider.wallet.publicKey,
          adminRole: mintResult.adminRolePda,
          mint: mintResult.mint.publicKey,
          address: charlie.publicKey,
          blacklistEntry: blacklistPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Verify blacklist entry data
      const entry =
        await hookProgram.account.blacklistEntry.fetch(blacklistPda);
      expect(entry.mint.toBase58()).to.equal(
        mintResult.mint.publicKey.toBase58(),
      );
      expect(entry.address.toBase58()).to.equal(charlie.publicKey.toBase58());
      expect(entry.addedBy.toBase58()).to.equal(
        provider.wallet.publicKey.toBase58(),
      );
      expect(entry.reason).to.equal("OFAC sanctioned entity");
      expect(entry.addedAt.toNumber()).to.be.greaterThan(0);
    });

    it("admin adds dave to blacklist", async () => {
      const [blacklistPda] = deriveBlacklistPda(
        mintResult.mint.publicKey,
        dave.publicKey,
        hookProgram.programId,
      );

      await hookProgram.methods
        .addToBlacklist("Suspicious activity detected")
        .accountsPartial({
          authority: provider.wallet.publicKey,
          adminRole: mintResult.adminRolePda,
          mint: mintResult.mint.publicKey,
          address: dave.publicKey,
          blacklistEntry: blacklistPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const entry =
        await hookProgram.account.blacklistEntry.fetch(blacklistPda);
      expect(entry.address.toBase58()).to.equal(dave.publicKey.toBase58());
      expect(entry.reason).to.equal("Suspicious activity detected");
    });

    it("rejects blacklist add from non-admin", async () => {
      const randomTarget = Keypair.generate();
      const [blacklistPda] = deriveBlacklistPda(
        mintResult.mint.publicKey,
        randomTarget.publicKey,
        hookProgram.programId,
      );

      // Derive where the non-admin's admin role PDA *would* be
      const [fakeAdminRole] = deriveRolePda(
        mintResult.configPda,
        nonAdmin.publicKey,
        ROLE_ADMIN,
        coreProgram.programId,
      );

      try {
        await hookProgram.methods
          .addToBlacklist("Unauthorized attempt")
          .accountsPartial({
            authority: nonAdmin.publicKey,
            adminRole: fakeAdminRole,
            mint: mintResult.mint.publicKey,
            address: randomTarget.publicKey,
            blacklistEntry: blacklistPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([nonAdmin])
          .rpc();
        expect.fail("Non-admin should not be able to add to blacklist");
      } catch (err: any) {
        expect(err).to.exist;
        expect(err.toString()).to.not.include("should not be able to add");
      }
    });

    it("rejects blacklist add with reason exceeding 128 characters", async () => {
      const randomTarget = Keypair.generate();
      const [blacklistPda] = deriveBlacklistPda(
        mintResult.mint.publicKey,
        randomTarget.publicKey,
        hookProgram.programId,
      );

      const longReason = "x".repeat(129);

      try {
        await hookProgram.methods
          .addToBlacklist(longReason)
          .accountsPartial({
            authority: provider.wallet.publicKey,
            adminRole: mintResult.adminRolePda,
            mint: mintResult.mint.publicKey,
            address: randomTarget.publicKey,
            blacklistEntry: blacklistPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should reject reason exceeding 128 characters");
      } catch (err: any) {
        expect(err).to.exist;
        expect(err.toString()).to.not.include("Should reject reason");
      }
    });

    it("rejects duplicate blacklist entry for same address", async () => {
      // Charlie is already blacklisted — try to add again
      const [blacklistPda] = deriveBlacklistPda(
        mintResult.mint.publicKey,
        charlie.publicKey,
        hookProgram.programId,
      );

      try {
        await hookProgram.methods
          .addToBlacklist("Duplicate attempt")
          .accountsPartial({
            authority: provider.wallet.publicKey,
            adminRole: mintResult.adminRolePda,
            mint: mintResult.mint.publicKey,
            address: charlie.publicKey,
            blacklistEntry: blacklistPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should reject duplicate blacklist entry");
      } catch (err: any) {
        // Anchor #[account(init)] fails because PDA already exists
        expect(err).to.exist;
        expect(err.toString()).to.not.include("Should reject duplicate");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Transfer blocked for blacklisted address
  // ─────────────────────────────────────────────────────────────

  describe("Transfer blocked for blacklisted address", () => {
    it("blocks transfer FROM blacklisted sender (charlie)", async () => {
      try {
        const transferIx =
          await createTransferCheckedWithTransferHookInstruction(
            provider.connection,
            charlieAta,
            mintResult.mint.publicKey,
            bobAta,
            charlie.publicKey,
            BigInt(1_000_000),
            DECIMALS,
            undefined,
            "confirmed",
            TOKEN_2022_PROGRAM_ID,
          );

        const tx = new Transaction().add(transferIx);
        await provider.sendAndConfirm(tx, [charlie]);
        expect.fail("Should block transfer from blacklisted sender");
      } catch (err: any) {
        // Transfer hook rejects with SenderBlacklisted (error code 6000)
        expect(err).to.exist;
        expect(err.toString()).to.not.include("Should block transfer from");
      }
    });

    it("blocks transfer TO blacklisted receiver (charlie)", async () => {
      try {
        const transferIx =
          await createTransferCheckedWithTransferHookInstruction(
            provider.connection,
            aliceAta,
            mintResult.mint.publicKey,
            charlieAta,
            alice.publicKey,
            BigInt(1_000_000),
            DECIMALS,
            undefined,
            "confirmed",
            TOKEN_2022_PROGRAM_ID,
          );

        const tx = new Transaction().add(transferIx);
        await provider.sendAndConfirm(tx, [alice]);
        expect.fail("Should block transfer to blacklisted receiver");
      } catch (err: any) {
        // Transfer hook rejects with ReceiverBlacklisted (error code 6001)
        expect(err).to.exist;
        expect(err.toString()).to.not.include("Should block transfer to");
      }
    });

    it("blocks transfer FROM blacklisted dave", async () => {
      try {
        const transferIx =
          await createTransferCheckedWithTransferHookInstruction(
            provider.connection,
            daveAta,
            mintResult.mint.publicKey,
            aliceAta,
            dave.publicKey,
            BigInt(500_000),
            DECIMALS,
            undefined,
            "confirmed",
            TOKEN_2022_PROGRAM_ID,
          );

        const tx = new Transaction().add(transferIx);
        await provider.sendAndConfirm(tx, [dave]);
        expect.fail("Should block transfer from blacklisted dave");
      } catch (err: any) {
        expect(err).to.exist;
        expect(err.toString()).to.not.include("Should block transfer from");
      }
    });

    it("confirms non-blacklisted transfers still work while blacklist is active", async () => {
      // Alice to Bob should still succeed — neither is blacklisted
      const transferAmount = BigInt(1_000_000);
      const aliceBalanceBefore = await getTokenBalance(
        provider.connection,
        aliceAta,
      );

      const transferIx =
        await createTransferCheckedWithTransferHookInstruction(
          provider.connection,
          aliceAta,
          mintResult.mint.publicKey,
          bobAta,
          alice.publicKey,
          transferAmount,
          DECIMALS,
          undefined,
          "confirmed",
          TOKEN_2022_PROGRAM_ID,
        );

      const tx = new Transaction().add(transferIx);
      await provider.sendAndConfirm(tx, [alice]);

      const aliceBalanceAfter = await getTokenBalance(
        provider.connection,
        aliceAta,
      );
      const bobBalance = await getTokenBalance(provider.connection, bobAta);

      expect(
        (aliceBalanceBefore - aliceBalanceAfter).toString(),
      ).to.equal(transferAmount.toString());
      expect(Number(bobBalance)).to.be.greaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Blacklist remove
  // ─────────────────────────────────────────────────────────────

  describe("Blacklist remove", () => {
    it("rejects blacklist removal from non-admin", async () => {
      const [blacklistPda] = deriveBlacklistPda(
        mintResult.mint.publicKey,
        charlie.publicKey,
        hookProgram.programId,
      );

      const [fakeAdminRole] = deriveRolePda(
        mintResult.configPda,
        nonAdmin.publicKey,
        ROLE_ADMIN,
        coreProgram.programId,
      );

      try {
        await hookProgram.methods
          .removeFromBlacklist()
          .accountsPartial({
            authority: nonAdmin.publicKey,
            adminRole: fakeAdminRole,
            mint: mintResult.mint.publicKey,
            blacklistEntry: blacklistPda,
          })
          .signers([nonAdmin])
          .rpc();
        expect.fail("Non-admin should not be able to remove from blacklist");
      } catch (err: any) {
        expect(err).to.exist;
        expect(err.toString()).to.not.include("should not be able to remove");
      }
    });

    it("admin removes charlie from blacklist", async () => {
      const [blacklistPda] = deriveBlacklistPda(
        mintResult.mint.publicKey,
        charlie.publicKey,
        hookProgram.programId,
      );

      await hookProgram.methods
        .removeFromBlacklist()
        .accountsPartial({
          authority: provider.wallet.publicKey,
          adminRole: mintResult.adminRolePda,
          mint: mintResult.mint.publicKey,
          blacklistEntry: blacklistPda,
        })
        .rpc();

      // Verify the blacklist entry account is closed
      const entryInfo =
        await provider.connection.getAccountInfo(blacklistPda);
      expect(entryInfo).to.be.null;
    });

    it("charlie can transfer again after removal from blacklist", async () => {
      const charlieBalanceBefore = await getTokenBalance(
        provider.connection,
        charlieAta,
      );
      const bobBalanceBefore = await getTokenBalance(
        provider.connection,
        bobAta,
      );

      const transferAmount = BigInt(1_000_000);

      const transferIx =
        await createTransferCheckedWithTransferHookInstruction(
          provider.connection,
          charlieAta,
          mintResult.mint.publicKey,
          bobAta,
          charlie.publicKey,
          transferAmount,
          DECIMALS,
          undefined,
          "confirmed",
          TOKEN_2022_PROGRAM_ID,
        );

      const tx = new Transaction().add(transferIx);
      await provider.sendAndConfirm(tx, [charlie]);

      const charlieBalanceAfter = await getTokenBalance(
        provider.connection,
        charlieAta,
      );
      const bobBalanceAfter = await getTokenBalance(
        provider.connection,
        bobAta,
      );

      expect(
        (charlieBalanceBefore - charlieBalanceAfter).toString(),
      ).to.equal(transferAmount.toString());
      expect(
        (bobBalanceAfter - bobBalanceBefore).toString(),
      ).to.equal(transferAmount.toString());
    });

    it("others can transfer TO charlie after removal", async () => {
      const bobBalanceBefore = await getTokenBalance(
        provider.connection,
        bobAta,
      );
      const charlieBalanceBefore = await getTokenBalance(
        provider.connection,
        charlieAta,
      );

      const transferAmount = BigInt(500_000);

      const transferIx =
        await createTransferCheckedWithTransferHookInstruction(
          provider.connection,
          bobAta,
          mintResult.mint.publicKey,
          charlieAta,
          bob.publicKey,
          transferAmount,
          DECIMALS,
          undefined,
          "confirmed",
          TOKEN_2022_PROGRAM_ID,
        );

      const tx = new Transaction().add(transferIx);
      await provider.sendAndConfirm(tx, [bob]);

      const bobBalanceAfter = await getTokenBalance(
        provider.connection,
        bobAta,
      );
      const charlieBalanceAfter = await getTokenBalance(
        provider.connection,
        charlieAta,
      );

      expect(
        (bobBalanceBefore - bobBalanceAfter).toString(),
      ).to.equal(transferAmount.toString());
      expect(
        (charlieBalanceAfter - charlieBalanceBefore).toString(),
      ).to.equal(transferAmount.toString());
    });

    it("dave remains blacklisted while charlie was removed", async () => {
      // Dave should still be blocked
      try {
        const transferIx =
          await createTransferCheckedWithTransferHookInstruction(
            provider.connection,
            daveAta,
            mintResult.mint.publicKey,
            aliceAta,
            dave.publicKey,
            BigInt(100_000),
            DECIMALS,
            undefined,
            "confirmed",
            TOKEN_2022_PROGRAM_ID,
          );

        const tx = new Transaction().add(transferIx);
        await provider.sendAndConfirm(tx, [dave]);
        expect.fail("Dave should still be blacklisted");
      } catch (err: any) {
        expect(err).to.exist;
        expect(err.toString()).to.not.include("should still be blacklisted");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Transfer hook fallback
  // ─────────────────────────────────────────────────────────────

  describe("Transfer hook fallback", () => {
    it("fallback rejects non-Execute instruction discriminators", async () => {
      // The fallback handler only accepts the Execute variant of the
      // TransferHookInstruction enum. Any other discriminator (e.g.
      // Initialize = 0) should return InvalidInstructionData.
      //
      // SPL TransferHookInstruction::Initialize discriminator:
      //   [0x00] as first byte (big-endian u8 tag)
      // Full layout: u8 tag (0) + u64 mint auth + u64 ... but we only
      // need enough to trigger the non-Execute match arm.
      //
      // Build a raw instruction targeting the hook program with an
      // Initialize discriminator (tag = 0). The fallback parses the
      // first byte to determine instruction type.
      const hookProgramId = hookProgram.programId;

      // TransferHookInstruction layout: first byte is the tag
      // Execute = 4 (with u64 amount), Initialize = 0
      // We send tag=0 with some dummy data to trigger the fallback's
      // non-Execute match arm.
      const data = Buffer.alloc(9);
      data.writeUInt8(0, 0); // tag = Initialize (not Execute)
      // Remaining 8 bytes are dummy (would be part of Initialize args)

      // Provide the minimum accounts the fallback expects — it will
      // parse the discriminator before validating accounts, so the
      // accounts list just needs to be non-empty enough to not crash
      // before the match statement. We pass the hook's expected accounts.
      const [extraAccountMetasPda] = deriveExtraAccountMetasPda(
        mintResult.mint.publicKey,
        hookProgramId,
      );
      const [senderBlacklist] = deriveBlacklistPda(
        mintResult.mint.publicKey,
        alice.publicKey,
        hookProgramId,
      );
      const [receiverBlacklist] = deriveBlacklistPda(
        mintResult.mint.publicKey,
        bob.publicKey,
        hookProgramId,
      );

      const ix = new TransactionInstruction({
        programId: hookProgramId,
        keys: [
          { pubkey: aliceAta, isSigner: false, isWritable: false },
          {
            pubkey: mintResult.mint.publicKey,
            isSigner: false,
            isWritable: false,
          },
          { pubkey: bobAta, isSigner: false, isWritable: false },
          { pubkey: alice.publicKey, isSigner: false, isWritable: false },
          {
            pubkey: extraAccountMetasPda,
            isSigner: false,
            isWritable: false,
          },
          { pubkey: senderBlacklist, isSigner: false, isWritable: false },
          {
            pubkey: receiverBlacklist,
            isSigner: false,
            isWritable: false,
          },
        ],
        data,
      });

      try {
        const tx = new Transaction().add(ix);
        await provider.sendAndConfirm(tx, []);
        expect.fail("Fallback should reject non-Execute discriminator");
      } catch (err: any) {
        // The hook's fallback match arm returns ProgramError::InvalidInstructionData
        expect(err).to.exist;
        expect(err.toString()).to.not.include("should reject non-Execute");
      }
    });

    it("fallback processes valid Execute instruction via transfer", async () => {
      // The normal createTransferCheckedWithTransferHookInstruction flow
      // exercises the fallback's Execute path. We verify it works by
      // performing a standard transfer — Token-2022 uses the SPL
      // interface discriminator (not Anchor's), which routes through
      // the fallback → Execute → transfer_hook handler.
      const aliceBalanceBefore = await getTokenBalance(
        provider.connection,
        aliceAta,
      );

      const transferAmount = BigInt(1_000_000);
      const transferIx =
        await createTransferCheckedWithTransferHookInstruction(
          provider.connection,
          aliceAta,
          mintResult.mint.publicKey,
          bobAta,
          alice.publicKey,
          transferAmount,
          DECIMALS,
          undefined,
          "confirmed",
          TOKEN_2022_PROGRAM_ID,
        );

      const tx = new Transaction().add(transferIx);
      await provider.sendAndConfirm(tx, [alice]);

      const aliceBalanceAfter = await getTokenBalance(
        provider.connection,
        aliceAta,
      );

      // If fallback's Execute path failed, this transfer would revert
      expect(
        (aliceBalanceBefore - aliceBalanceAfter).toString(),
      ).to.equal(transferAmount.toString());
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Blacklist entry data integrity
  // ─────────────────────────────────────────────────────────────

  describe("Blacklist entry data integrity", () => {
    it("re-blacklisting an address after removal creates fresh entry", async () => {
      // Remove dave from blacklist first
      const [daveBlacklistPda] = deriveBlacklistPda(
        mintResult.mint.publicKey,
        dave.publicKey,
        hookProgram.programId,
      );

      await hookProgram.methods
        .removeFromBlacklist()
        .accountsPartial({
          authority: provider.wallet.publicKey,
          adminRole: mintResult.adminRolePda,
          mint: mintResult.mint.publicKey,
          blacklistEntry: daveBlacklistPda,
        })
        .rpc();

      // Verify removed
      const removedInfo =
        await provider.connection.getAccountInfo(daveBlacklistPda);
      expect(removedInfo).to.be.null;

      // Re-add with different reason
      await hookProgram.methods
        .addToBlacklist("Re-flagged by compliance")
        .accountsPartial({
          authority: provider.wallet.publicKey,
          adminRole: mintResult.adminRolePda,
          mint: mintResult.mint.publicKey,
          address: dave.publicKey,
          blacklistEntry: daveBlacklistPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Verify new entry has updated reason
      const entry =
        await hookProgram.account.blacklistEntry.fetch(daveBlacklistPda);
      expect(entry.reason).to.equal("Re-flagged by compliance");
      expect(entry.address.toBase58()).to.equal(dave.publicKey.toBase58());
    });

    it("blacklist reason can be exactly 128 characters (max)", async () => {
      const target = Keypair.generate();
      const [blacklistPda] = deriveBlacklistPda(
        mintResult.mint.publicKey,
        target.publicKey,
        hookProgram.programId,
      );

      const maxReason = "A".repeat(128);

      await hookProgram.methods
        .addToBlacklist(maxReason)
        .accountsPartial({
          authority: provider.wallet.publicKey,
          adminRole: mintResult.adminRolePda,
          mint: mintResult.mint.publicKey,
          address: target.publicKey,
          blacklistEntry: blacklistPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const entry =
        await hookProgram.account.blacklistEntry.fetch(blacklistPda);
      expect(entry.reason).to.equal(maxReason);
      expect(entry.reason.length).to.equal(128);

      // Clean up
      await hookProgram.methods
        .removeFromBlacklist()
        .accountsPartial({
          authority: provider.wallet.publicKey,
          adminRole: mintResult.adminRolePda,
          mint: mintResult.mint.publicKey,
          blacklistEntry: blacklistPda,
        })
        .rpc();
    });
  });
});
