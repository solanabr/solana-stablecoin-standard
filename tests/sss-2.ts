import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  addExtraAccountMetasForExecute,
  getAccount,
} from "@solana/spl-token";
import { SssCore } from "../target/types/sss_core";
import { SssHook } from "../target/types/sss_hook";
import {
  PRESET_COMPLIANT,
  StablecoinCtx,
  airdrop,
  initializeStablecoin,
  createAta,
  configureMinter,
  mintTokens,
  findConfigPda,
  findMintAuthorityPda,
  findHookConfigPda,
  findExtraAccountMetaListPda,
  findBlacklistEntryPda,
} from "./helpers";

describe("SSS-2 (Compliant Preset)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const coreProgram = anchor.workspace.sssCore as Program<SssCore>;
  const hookProgram = anchor.workspace.sssHook as Program<SssHook>;
  const authority = (provider.wallet as anchor.Wallet).payer;

  let stablecoin: StablecoinCtx;

  // ── Initialize SSS-2 ────────────────────────────────────────────────────

  describe("initialize SSS-2", () => {
    it("initializes an SSS-2 stablecoin with transfer hook", async () => {
      stablecoin = await initializeStablecoin(
        coreProgram,
        provider,
        PRESET_COMPLIANT,
        hookProgram.programId
      );

      const config = await coreProgram.account.stablecoinConfig.fetch(
        stablecoin.configPda
      );

      assert.equal(config.preset, PRESET_COMPLIANT);
      assert.ok(config.mint.equals(stablecoin.mint.publicKey));
    });

    it("rejects SSS-2 without hook program", async () => {
      const mint = Keypair.generate();
      const [configPda] = findConfigPda(mint.publicKey, coreProgram.programId);
      const [mintAuthorityPda] = findMintAuthorityPda(
        mint.publicKey,
        coreProgram.programId
      );

      try {
        await coreProgram.methods
          .initialize({
            preset: PRESET_COMPLIANT,
            name: "Test",
            symbol: "TST",
            uri: "",
            decimals: 6,
          })
          .accounts({
            authority: authority.publicKey,
            mint: mint.publicKey,
            config: configPda,
            mintAuthority: mintAuthorityPda,
            hookProgram: null,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([mint])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "HookProgramRequired");
      }
    });
  });

  // ── Transfer Hook Initialization ─────────────────────────────────────────

  describe("initialize hook", () => {
    let hookConfigPda: PublicKey;
    let extraAccountMetaListPda: PublicKey;

    it("initializes the transfer hook for the SSS-2 mint", async () => {
      [hookConfigPda] = findHookConfigPda(
        stablecoin.mint.publicKey,
        hookProgram.programId
      );
      [extraAccountMetaListPda] = findExtraAccountMetaListPda(
        stablecoin.mint.publicKey,
        hookProgram.programId
      );

      await hookProgram.methods
        .initializeHook()
        .accounts({
          authority: authority.publicKey,
          mint: stablecoin.mint.publicKey,
          stablecoinConfig: stablecoin.configPda,
          hookConfig: hookConfigPda,
          extraAccountMetaList: extraAccountMetaListPda,
          coreProgram: coreProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const hookConfig = await hookProgram.account.hookConfig.fetch(
        hookConfigPda
      );

      assert.ok(hookConfig.mint.equals(stablecoin.mint.publicKey));
      assert.ok(hookConfig.stablecoinConfig.equals(stablecoin.configPda));
      assert.ok(hookConfig.coreProgram.equals(coreProgram.programId));
    });
  });

  // ── SSS-2: Thaw (needed for frozen-by-default accounts), Mint, Seize ────

  describe("SSS-2 mint flow (thaw → mint → seize)", () => {
    let minter: Keypair;
    let minterStatePda: PublicKey;
    let userAta: PublicKey;
    let user: Keypair;

    before(async () => {
      minter = Keypair.generate();
      user = Keypair.generate();
      await airdrop(provider, minter.publicKey);
      await airdrop(provider, user.publicKey);

      // Configure minter
      minterStatePda = await configureMinter(
        coreProgram,
        stablecoin,
        minter.publicKey,
        new anchor.BN(10_000_000_000)
      );
    });

    it("creates ATA (frozen by default on SSS-2), then thaws it", async () => {
      userAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        user.publicKey
      );

      // Thaw the account so it can receive tokens
      await coreProgram.methods
        .thawAccount()
        .accounts({
          signer: authority.publicKey,
          config: stablecoin.configPda,
          mint: stablecoin.mint.publicKey,
          targetTokenAccount: userAta,
          mintAuthority: stablecoin.mintAuthorityPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    });

    it("mints tokens to thawed account", async () => {
      await mintTokens(
        coreProgram,
        stablecoin,
        minter,
        userAta,
        new anchor.BN(500_000_000), // 500 tokens
        minterStatePda
      );

      const config = await coreProgram.account.stablecoinConfig.fetch(
        stablecoin.configPda
      );
      assert.ok(config.totalMinted.eq(new anchor.BN(500_000_000)));
    });

    it("seizes tokens via permanent delegate (SSS-2 only)", async function () {
      // Create authority's ATA for receiving seized tokens
      const authorityAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        authority.publicKey
      );

      // Thaw authority's ATA too
      await coreProgram.methods
        .thawAccount()
        .accounts({
          signer: authority.publicKey,
          config: stablecoin.configPda,
          mint: stablecoin.mint.publicKey,
          targetTokenAccount: authorityAta,
          mintAuthority: stablecoin.mintAuthorityPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // For SSS-2, transfer_checked triggers the transfer hook.
      // Token-2022 expects remaining accounts for the hook in this order:
      //   extra_account_meta_list, ...resolved_extra_accounts, hook_program

      const [extraAccountMetaListPda] = findExtraAccountMetaListPda(
        stablecoin.mint.publicKey,
        hookProgram.programId
      );

      // Use SPL helper to resolve extra accounts from the on-chain meta list
      const transferIx = new anchor.web3.TransactionInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        keys: [
          { pubkey: userAta, isSigner: false, isWritable: true },
          { pubkey: stablecoin.mint.publicKey, isSigner: false, isWritable: false },
          { pubkey: authorityAta, isSigner: false, isWritable: true },
          { pubkey: stablecoin.mintAuthorityPda, isSigner: false, isWritable: false },
        ],
        data: Buffer.alloc(0),
      });

      await addExtraAccountMetasForExecute(
        provider.connection,
        transferIx,
        hookProgram.programId,
        userAta,
        stablecoin.mint.publicKey,
        authorityAta,
        stablecoin.mintAuthorityPda,
        BigInt(100_000_000),
      );

      // The helper adds accounts in order: resolved_extras, hook_program, extra_meta_list
      // This is the order Token-2022's transfer_checked expects.
      const hookRemainingAccounts = transferIx.keys.slice(4).map(k => ({
        pubkey: k.pubkey,
        isSigner: false,
        isWritable: k.isWritable,
      }));

      await coreProgram.methods
        .seize(new anchor.BN(100_000_000)) // seize 100 tokens
        .accounts({
          authority: authority.publicKey,
          config: stablecoin.configPda,
          mint: stablecoin.mint.publicKey,
          sourceTokenAccount: userAta,
          destinationTokenAccount: authorityAta,
          mintAuthority: stablecoin.mintAuthorityPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts(hookRemainingAccounts)
        .rpc();

      // Verify tokens were actually seized
      const sourceAccount = await getAccount(
        provider.connection,
        userAta,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const destAccount = await getAccount(
        provider.connection,
        authorityAta,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      // 500M minted - 100M seized = 400M remaining
      assert.equal(sourceAccount.amount.toString(), "400000000");
      assert.equal(destAccount.amount.toString(), "100000000");

      // Verify total_seized is tracked on-chain
      const config = await coreProgram.account.stablecoinConfig.fetch(
        stablecoin.configPda
      );
      assert.ok(config.totalSeized.eq(new anchor.BN(100_000_000)));
    });
  });

  // ── Blacklist Management ─────────────────────────────────────────────────

  describe("blacklist (add / remove)", () => {
    let targetWallet: Keypair;
    let blacklistEntryPda: PublicKey;

    before(async () => {
      targetWallet = Keypair.generate();
      [blacklistEntryPda] = findBlacklistEntryPda(
        stablecoin.mint.publicKey,
        targetWallet.publicKey,
        hookProgram.programId
      );
    });

    it("adds a wallet to the blacklist", async () => {
      await hookProgram.methods
        .addToBlacklist(targetWallet.publicKey, "Suspicious activity")
        .accounts({
          blacklister: authority.publicKey,
          mint: stablecoin.mint.publicKey,
          stablecoinConfig: stablecoin.configPda,
          blacklistEntry: blacklistEntryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const entry = await hookProgram.account.blacklistEntry.fetch(
        blacklistEntryPda
      );

      assert.ok(entry.wallet.equals(targetWallet.publicKey));
      assert.equal(entry.blacklisted, true);
      assert.equal(entry.reason, "Suspicious activity");
      assert.ok(entry.blacklistedBy.equals(authority.publicKey));
    });

    it("removes a wallet from the blacklist", async () => {
      await hookProgram.methods
        .removeFromBlacklist()
        .accounts({
          blacklister: authority.publicKey,
          mint: stablecoin.mint.publicKey,
          stablecoinConfig: stablecoin.configPda,
          blacklistEntry: blacklistEntryPda,
        })
        .rpc();

      const entry = await hookProgram.account.blacklistEntry.fetch(
        blacklistEntryPda
      );

      assert.equal(entry.blacklisted, false);
    });

    it("non-blacklister cannot add to blacklist", async () => {
      const attacker = Keypair.generate();
      await airdrop(provider, attacker.publicKey);

      const otherWallet = Keypair.generate();
      const [otherEntryPda] = findBlacklistEntryPda(
        stablecoin.mint.publicKey,
        otherWallet.publicKey,
        hookProgram.programId
      );

      try {
        await hookProgram.methods
          .addToBlacklist(otherWallet.publicKey, "Hacked")
          .accounts({
            blacklister: attacker.publicKey,
            mint: stablecoin.mint.publicKey,
            stablecoinConfig: stablecoin.configPda,
            blacklistEntry: otherEntryPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "NotBlacklister");
      }
    });

    it("rejects reason longer than 64 characters", async () => {
      const otherWallet = Keypair.generate();
      const [otherEntryPda] = findBlacklistEntryPda(
        stablecoin.mint.publicKey,
        otherWallet.publicKey,
        hookProgram.programId
      );

      try {
        await hookProgram.methods
          .addToBlacklist(
            otherWallet.publicKey,
            "A".repeat(65) // 65 chars, max is 64
          )
          .accounts({
            blacklister: authority.publicKey,
            mint: stablecoin.mint.publicKey,
            stablecoinConfig: stablecoin.configPda,
            blacklistEntry: otherEntryPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "ReasonTooLong");
      }
    });
  });

  // ── Transfer Hook Enforcement ───────────────────────────────────────────

  describe("transfer hook blocks blacklisted transfers", () => {
    let sender: Keypair;
    let receiver: Keypair;
    let senderAta: PublicKey;
    let receiverAta: PublicKey;
    let minterStatePda: PublicKey;

    before(async () => {
      // Create fresh SSS-2 stablecoin for this test group
      stablecoin = await initializeStablecoin(
        coreProgram,
        provider,
        PRESET_COMPLIANT,
        hookProgram.programId
      );

      // Initialize hook
      const [hookConfigPda] = findHookConfigPda(
        stablecoin.mint.publicKey,
        hookProgram.programId
      );
      const [eamPda] = findExtraAccountMetaListPda(
        stablecoin.mint.publicKey,
        hookProgram.programId
      );

      await hookProgram.methods
        .initializeHook()
        .accounts({
          authority: authority.publicKey,
          mint: stablecoin.mint.publicKey,
          stablecoinConfig: stablecoin.configPda,
          hookConfig: hookConfigPda,
          extraAccountMetaList: eamPda,
          coreProgram: coreProgram.programId,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Set up sender and receiver
      sender = Keypair.generate();
      receiver = Keypair.generate();
      await airdrop(provider, sender.publicKey);
      await airdrop(provider, receiver.publicKey);

      // Create and thaw ATAs
      senderAta = await createAta(provider, stablecoin.mint.publicKey, sender.publicKey);
      receiverAta = await createAta(provider, stablecoin.mint.publicKey, receiver.publicKey);

      // Thaw both
      for (const ata of [senderAta, receiverAta]) {
        await coreProgram.methods
          .thawAccount()
          .accounts({
            signer: authority.publicKey,
            config: stablecoin.configPda,
            mint: stablecoin.mint.publicKey,
            targetTokenAccount: ata,
            mintAuthority: stablecoin.mintAuthorityPda,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
      }

      // Configure minter and mint to sender
      const minter = Keypair.generate();
      await airdrop(provider, minter.publicKey);
      minterStatePda = await configureMinter(
        coreProgram,
        stablecoin,
        minter.publicKey,
        new anchor.BN(1_000_000_000)
      );
      await mintTokens(
        coreProgram,
        stablecoin,
        minter,
        senderAta,
        new anchor.BN(500_000_000),
        minterStatePda
      );
    });

    it("blacklisted receiver cannot receive tokens via transfer_checked", async () => {
      // Blacklist the receiver
      const [blacklistEntryPda] = findBlacklistEntryPda(
        stablecoin.mint.publicKey,
        receiver.publicKey,
        hookProgram.programId
      );

      await hookProgram.methods
        .addToBlacklist(receiver.publicKey, "Compliance block")
        .accounts({
          blacklister: authority.publicKey,
          mint: stablecoin.mint.publicKey,
          stablecoinConfig: stablecoin.configPda,
          blacklistEntry: blacklistEntryPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Attempt transfer via Token-2022 transfer_checked — should fail via hook
      const { createTransferCheckedInstruction } = await import("@solana/spl-token");
      const transferIx = createTransferCheckedInstruction(
        senderAta,
        stablecoin.mint.publicKey,
        receiverAta,
        sender.publicKey,
        500_000_000n,
        6, // decimals
        [],
        TOKEN_2022_PROGRAM_ID
      );

      // Resolve hook extra accounts
      await addExtraAccountMetasForExecute(
        provider.connection,
        transferIx,
        hookProgram.programId,
        senderAta,
        stablecoin.mint.publicKey,
        receiverAta,
        sender.publicKey,
        BigInt(500_000_000),
      );

      const tx = new anchor.web3.Transaction().add(transferIx);
      try {
        await provider.sendAndConfirm(tx, [sender]);
        assert.fail("Transfer to blacklisted receiver should have failed");
      } catch (e: any) {
        // Hook error code 6000 (Blacklisted) = 0x1770
        assert.include(e.toString(), "0x1770");
      }

      // Verify sender balance unchanged
      const sourceAccount = await getAccount(
        provider.connection,
        senderAta,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      assert.equal(sourceAccount.amount.toString(), "500000000");
    });

    it("transfer succeeds after removing from blacklist", async () => {
      const [blacklistEntryPda] = findBlacklistEntryPda(
        stablecoin.mint.publicKey,
        receiver.publicKey,
        hookProgram.programId
      );

      // Remove from blacklist
      await hookProgram.methods
        .removeFromBlacklist()
        .accounts({
          blacklister: authority.publicKey,
          mint: stablecoin.mint.publicKey,
          stablecoinConfig: stablecoin.configPda,
          blacklistEntry: blacklistEntryPda,
        })
        .rpc();

      // Now transfer should succeed
      const { createTransferCheckedInstruction } = await import("@solana/spl-token");
      const transferIx = createTransferCheckedInstruction(
        senderAta,
        stablecoin.mint.publicKey,
        receiverAta,
        sender.publicKey,
        100_000_000n,
        6,
        [],
        TOKEN_2022_PROGRAM_ID
      );

      await addExtraAccountMetasForExecute(
        provider.connection,
        transferIx,
        hookProgram.programId,
        senderAta,
        stablecoin.mint.publicKey,
        receiverAta,
        sender.publicKey,
        BigInt(100_000_000),
      );

      const tx = new anchor.web3.Transaction().add(transferIx);
      await provider.sendAndConfirm(tx, [sender]);

      // Verify balances
      const sourceAccount = await getAccount(
        provider.connection,
        senderAta,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const destAccount = await getAccount(
        provider.connection,
        receiverAta,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      assert.equal(sourceAccount.amount.toString(), "400000000"); // 500M - 100M
      assert.equal(destAccount.amount.toString(), "100000000");
    });

    it("pause blocks transfers via transfer hook", async () => {
      // Pause the contract
      await coreProgram.methods
        .pause()
        .accounts({
          pauser: authority.publicKey,
          config: stablecoin.configPda,
        })
        .rpc();

      // Attempt transfer — hook should reject with ContractPaused
      const { createTransferCheckedInstruction } = await import("@solana/spl-token");
      const transferIx = createTransferCheckedInstruction(
        senderAta,
        stablecoin.mint.publicKey,
        receiverAta,
        sender.publicKey,
        50_000_000n,
        6,
        [],
        TOKEN_2022_PROGRAM_ID
      );

      await addExtraAccountMetasForExecute(
        provider.connection,
        transferIx,
        hookProgram.programId,
        senderAta,
        stablecoin.mint.publicKey,
        receiverAta,
        sender.publicKey,
        BigInt(50_000_000),
      );

      const tx = new anchor.web3.Transaction().add(transferIx);
      try {
        await provider.sendAndConfirm(tx, [sender]);
        assert.fail("Transfer while paused should have failed");
      } catch (e: any) {
        // Hook error code 6001 (ContractPaused) = 0x1771
        assert.include(e.toString(), "0x1771");
      }

      // Verify sender balance unchanged
      const sourceAccount = await getAccount(
        provider.connection,
        senderAta,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      assert.equal(sourceAccount.amount.toString(), "400000000");

      // Unpause for remaining tests
      await coreProgram.methods
        .unpause()
        .accounts({
          pauser: authority.publicKey,
          config: stablecoin.configPda,
        })
        .rpc();
    });
  });

  // ── Multi-Minter ─────────────────────────────────────────────────────────

  describe("multi-minter quota isolation", () => {
    let minterA: Keypair;
    let minterB: Keypair;
    let minterAState: PublicKey;
    let minterBState: PublicKey;
    let recipientAta: PublicKey;

    before(async () => {
      // Fresh stablecoin for isolation
      stablecoin = await initializeStablecoin(
        coreProgram,
        provider,
        PRESET_COMPLIANT,
        hookProgram.programId
      );

      minterA = Keypair.generate();
      minterB = Keypair.generate();
      await airdrop(provider, minterA.publicKey);
      await airdrop(provider, minterB.publicKey);

      minterAState = await configureMinter(
        coreProgram,
        stablecoin,
        minterA.publicKey,
        new anchor.BN(100_000_000)
      );

      minterBState = await configureMinter(
        coreProgram,
        stablecoin,
        minterB.publicKey,
        new anchor.BN(200_000_000)
      );

      recipientAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        authority.publicKey
      );

      // Thaw for SSS-2
      await coreProgram.methods
        .thawAccount()
        .accounts({
          signer: authority.publicKey,
          config: stablecoin.configPda,
          mint: stablecoin.mint.publicKey,
          targetTokenAccount: recipientAta,
          mintAuthority: stablecoin.mintAuthorityPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    });

    it("minter A uses their own quota", async () => {
      await mintTokens(
        coreProgram,
        stablecoin,
        minterA,
        recipientAta,
        new anchor.BN(80_000_000),
        minterAState
      );

      const stateA = await coreProgram.account.minterState.fetch(minterAState);
      assert.ok(stateA.mintedAmount.eq(new anchor.BN(80_000_000)));
    });

    it("minter B quota is independent", async () => {
      await mintTokens(
        coreProgram,
        stablecoin,
        minterB,
        recipientAta,
        new anchor.BN(150_000_000),
        minterBState
      );

      const stateB = await coreProgram.account.minterState.fetch(minterBState);
      assert.ok(stateB.mintedAmount.eq(new anchor.BN(150_000_000)));

      // A's state unchanged
      const stateA = await coreProgram.account.minterState.fetch(minterAState);
      assert.ok(stateA.mintedAmount.eq(new anchor.BN(80_000_000)));
    });

    it("global total_minted tracks combined", async () => {
      const config = await coreProgram.account.stablecoinConfig.fetch(
        stablecoin.configPda
      );
      assert.ok(config.totalMinted.eq(new anchor.BN(230_000_000)));
    });

    it("minter A cannot exceed their own quota", async () => {
      try {
        await mintTokens(
          coreProgram,
          stablecoin,
          minterA,
          recipientAta,
          new anchor.BN(21_000_000), // only 20M remaining
          minterAState
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "QuotaExceeded");
      }
    });
  });
});
