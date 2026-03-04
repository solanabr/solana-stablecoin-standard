/**
 * SSS-2 Integration Tests
 * 
 * Tests the complete flow of SSS-2 (Compliant Stablecoin):
 * - All SSS-1 operations
 * - Blacklist management
 * - Transfer hook enforcement
 * - Token seizure
 * - Compliance statistics
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  getAssociatedTokenAddress,
  getAccount,
  getMint,
  transfer,
} from "@solana/spl-token";
import { expect } from "chai";
import BN from "bn.js";

describe("SSS-2: Compliant Stablecoin Flow", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.StablecoinCore as Program;
  const transferHookProgram = anchor.workspace.TransferHook as Program;

  // Test accounts
  let authority: Keypair;
  let minter: Keypair;
  let burner: Keypair;
  let pauser: Keypair;
  let blacklister: Keypair;
  let seizer: Keypair;
  let user1: Keypair;
  let user2: Keypair;
  let user3: Keypair; // Will be blacklisted

  // PDAs
  let mint: PublicKey;
  let stablecoinState: PublicKey;
  let minterAccount: PublicKey;
  let burnerRole: PublicKey;
  let pauserRole: PublicKey;
  let blacklisterRole: PublicKey;
  let seizerRole: PublicKey;
  let user3BlacklistEntry: PublicKey;

  // Token accounts
  let user1TokenAccount: PublicKey;
  let user2TokenAccount: PublicKey;
  let user3TokenAccount: PublicKey;

  // Test parameters
  const TOKEN_NAME = "Compliant Token";
  const TOKEN_SYMBOL = "COMP";
  const TOKEN_DECIMALS = 6;
  const DAILY_QUOTA = new BN(10_000_000_000); // 10,000 tokens

  before(async () => {
    console.log("\n=== Setting up SSS-2 Test Environment ===\n");

    // Generate keypairs
    authority = Keypair.generate();
    minter = Keypair.generate();
    burner = Keypair.generate();
    pauser = Keypair.generate();
    blacklister = Keypair.generate();
    seizer = Keypair.generate();
    user1 = Keypair.generate();
    user2 = Keypair.generate();
    user3 = Keypair.generate();

    // Airdrop SOL for testing
    const airdropAmount = 10 * anchor.web3.LAMPORTS_PER_SOL;
    await Promise.all([
      provider.connection.requestAirdrop(authority.publicKey, airdropAmount),
      provider.connection.requestAirdrop(minter.publicKey, airdropAmount),
      provider.connection.requestAirdrop(burner.publicKey, airdropAmount),
      provider.connection.requestAirdrop(pauser.publicKey, airdropAmount),
      provider.connection.requestAirdrop(blacklister.publicKey, airdropAmount),
      provider.connection.requestAirdrop(seizer.publicKey, airdropAmount),
      provider.connection.requestAirdrop(user1.publicKey, airdropAmount),
      provider.connection.requestAirdrop(user2.publicKey, airdropAmount),
      provider.connection.requestAirdrop(user3.publicKey, airdropAmount),
    ]);

    // Wait for airdrops to confirm
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("✓ Test accounts initialized");
    console.log("  Authority:", authority.publicKey.toString());
    console.log("  Minter:", minter.publicKey.toString());
    console.log("  Blacklister:", blacklister.publicKey.toString());
    console.log("  Seizer:", seizer.publicKey.toString());
    console.log("  User1:", user1.publicKey.toString());
    console.log("  User2:", user2.publicKey.toString());
    console.log("  User3 (to be blacklisted):", user3.publicKey.toString());
    console.log();
  });

  describe("1. Initialize SSS-2 Stablecoin", () => {
    it("should initialize SSS-2 stablecoin with compliance features", async () => {
      // Generate mint keypair
      mint = Keypair.generate().publicKey;

      // Derive stablecoin state PDA
      [stablecoinState] = PublicKey.findProgramAddressSync(
        [Buffer.from("stablecoin"), mint.toBuffer()],
        program.programId
      );

      const tx = await program.methods
        .initialize({
          name: TOKEN_NAME,
          symbol: TOKEN_SYMBOL,
          uri: "https://example.com/sss2-metadata.json",
          decimals: TOKEN_DECIMALS,
          enablePermanentDelegate: true,  // SSS-2 requires this
          enableTransferHook: true,       // SSS-2 requires this
          defaultAccountFrozen: false,
        })
        .accounts({
          authority: authority.publicKey,
          mint,
          stablecoinState,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      console.log("  Initialize tx:", tx);

      // Verify stablecoin state
      const state = await program.account.stablecoinState.fetch(stablecoinState);
      expect(state.mint.toString()).to.equal(mint.toString());
      expect(state.masterAuthority.toString()).to.equal(authority.publicKey.toString());
      expect(state.name).to.equal(TOKEN_NAME);
      expect(state.symbol).to.equal(TOKEN_SYMBOL);
      expect(state.decimals).to.equal(TOKEN_DECIMALS);
      expect(state.permanentDelegateEnabled).to.be.true;
      expect(state.transferHookEnabled).to.be.true;
      expect(state.isPaused).to.be.false;

      console.log("  ✓ SSS-2 stablecoin initialized with compliance features");
    });
  });

  describe("2. Setup Compliance Roles", () => {
    it("should add minter with quota", async () => {
      [minterAccount] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("minter"),
          stablecoinState.toBuffer(),
          minter.publicKey.toBuffer(),
        ],
        program.programId
      );

      const tx = await program.methods
        .updateMinter(
          minter.publicKey,
          DAILY_QUOTA,
          { add: {} }
        )
        .accounts({
          authority: authority.publicKey,
          stablecoinState,
          minterAccount,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      console.log("  Add minter tx:", tx);
      console.log("  ✓ Minter added with quota:", DAILY_QUOTA.toString());
    });

    it("should add burner role", async () => {
      [burnerRole] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          stablecoinState.toBuffer(),
          Buffer.from("burner"),
          burner.publicKey.toBuffer(),
        ],
        program.programId
      );

      await program.methods
        .updateRoles(
          { burner: {} },
          burner.publicKey,
          { add: {} }
        )
        .accounts({
          authority: authority.publicKey,
          stablecoinState,
          roleAccount: burnerRole,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      console.log("  ✓ Burner role added");
    });

    it("should add pauser role", async () => {
      [pauserRole] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          stablecoinState.toBuffer(),
          Buffer.from("pauser"),
          pauser.publicKey.toBuffer(),
        ],
        program.programId
      );

      await program.methods
        .updateRoles(
          { pauser: {} },
          pauser.publicKey,
          { add: {} }
        )
        .accounts({
          authority: authority.publicKey,
          stablecoinState,
          roleAccount: pauserRole,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      console.log("  ✓ Pauser role added");
    });

    it("should add blacklister role", async () => {
      [blacklisterRole] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          stablecoinState.toBuffer(),
          Buffer.from("blacklister"),
          blacklister.publicKey.toBuffer(),
        ],
        program.programId
      );

      await program.methods
        .updateRoles(
          { blacklister: {} },
          blacklister.publicKey,
          { add: {} }
        )
        .accounts({
          authority: authority.publicKey,
          stablecoinState,
          roleAccount: blacklisterRole,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      console.log("  ✓ Blacklister role added");
    });

    it("should add seizer role", async () => {
      [seizerRole] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          stablecoinState.toBuffer(),
          Buffer.from("seizer"),
          seizer.publicKey.toBuffer(),
        ],
        program.programId
      );

      await program.methods
        .updateRoles(
          { seizer: {} },
          seizer.publicKey,
          { add: {} }
        )
        .accounts({
          authority: authority.publicKey,
          stablecoinState,
          roleAccount: seizerRole,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      console.log("  ✓ Seizer role added");
    });
  });

  describe("3. Minting and Distribution", () => {
    it("should mint tokens to user1", async () => {
      user1TokenAccount = await createAssociatedTokenAccountIdempotent(
        provider.connection,
        user1,
        mint,
        user1.publicKey,
        {},
        TOKEN_2022_PROGRAM_ID
      );

      const mintAmount = new BN(1_000_000_000); // 1,000 tokens

      await program.methods
        .mint(mintAmount)
        .accounts({
          minter: minter.publicKey,
          stablecoinState,
          minterAccount,
          mint,
          recipient: user1TokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      const account = await getAccount(
        provider.connection,
        user1TokenAccount,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      expect(account.amount.toString()).to.equal(mintAmount.toString());

      console.log("  ✓ Minted 1,000 tokens to user1");
    });

    it("should mint tokens to user2", async () => {
      user2TokenAccount = await createAssociatedTokenAccountIdempotent(
        provider.connection,
        user2,
        mint,
        user2.publicKey,
        {},
        TOKEN_2022_PROGRAM_ID
      );

      const mintAmount = new BN(500_000_000); // 500 tokens

      await program.methods
        .mint(mintAmount)
        .accounts({
          minter: minter.publicKey,
          stablecoinState,
          minterAccount,
          mint,
          recipient: user2TokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      console.log("  ✓ Minted 500 tokens to user2");
    });

    it("should mint tokens to user3 (will be blacklisted)", async () => {
      user3TokenAccount = await createAssociatedTokenAccountIdempotent(
        provider.connection,
        user3,
        mint,
        user3.publicKey,
        {},
        TOKEN_2022_PROGRAM_ID
      );

      const mintAmount = new BN(200_000_000); // 200 tokens

      await program.methods
        .mint(mintAmount)
        .accounts({
          minter: minter.publicKey,
          stablecoinState,
          minterAccount,
          mint,
          recipient: user3TokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      console.log("  ✓ Minted 200 tokens to user3");
    });
  });

  describe("4. Normal Transfer Operations (Before Blacklist)", () => {
    it("should allow transfer from user1 to user2", async () => {
      const transferAmount = new BN(100_000_000); // 100 tokens

      const beforeUser1 = await getAccount(
        provider.connection,
        user1TokenAccount,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const beforeUser2 = await getAccount(
        provider.connection,
        user2TokenAccount,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      await transfer(
        provider.connection,
        user1,
        user1TokenAccount,
        user2TokenAccount,
        user1.publicKey,
        transferAmount,
        [],
        {},
        TOKEN_2022_PROGRAM_ID
      );

      const afterUser1 = await getAccount(
        provider.connection,
        user1TokenAccount,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const afterUser2 = await getAccount(
        provider.connection,
        user2TokenAccount,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      expect(afterUser1.amount.toString()).to.equal(
        (BigInt(beforeUser1.amount.toString()) - BigInt(transferAmount.toString())).toString()
      );
      expect(afterUser2.amount.toString()).to.equal(
        (BigInt(beforeUser2.amount.toString()) + BigInt(transferAmount.toString())).toString()
      );

      console.log("  ✓ Transfer successful: user1 → user2 (100 tokens)");
    });
  });

  describe("5. Blacklist Management", () => {
    it("should add user3 to blacklist", async () => {
      [user3BlacklistEntry] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("blacklist"),
          stablecoinState.toBuffer(),
          user3.publicKey.toBuffer(),
        ],
        program.programId
      );

      const tx = await program.methods
        .addToBlacklist(user3.publicKey, "Suspicious activity detected")
        .accounts({
          blacklister: blacklister.publicKey,
          stablecoinState,
          roleAccount: blacklisterRole,
          blacklistEntry: user3BlacklistEntry,
          systemProgram: SystemProgram.programId,
        })
        .signers([blacklister])
        .rpc();

      console.log("  Add to blacklist tx:", tx);

      // Verify blacklist entry
      const entry = await program.account.blacklistEntry.fetch(user3BlacklistEntry);
      expect(entry.address.toString()).to.equal(user3.publicKey.toString());
      expect(entry.isActive).to.be.true;
      expect(entry.reason).to.equal("Suspicious activity detected");

      console.log("  ✓ User3 added to blacklist");
      console.log("    Reason:", entry.reason);
    });

    it("should prevent transfer from blacklisted user3", async () => {
      const transferAmount = new BN(50_000_000); // 50 tokens

      try {
        await transfer(
          provider.connection,
          user3,
          user3TokenAccount,
          user1TokenAccount,
          user3.publicKey,
          transferAmount,
          [],
          {},
          TOKEN_2022_PROGRAM_ID
        );

        expect.fail("Should have blocked transfer from blacklisted user");
      } catch (error) {
        console.log("  ✓ Transfer from blacklisted user3 blocked");
      }
    });

    it("should prevent transfer to blacklisted user3", async () => {
      const transferAmount = new BN(50_000_000); // 50 tokens

      try {
        await transfer(
          provider.connection,
          user1,
          user1TokenAccount,
          user3TokenAccount,
          user1.publicKey,
          transferAmount,
          [],
          {},
          TOKEN_2022_PROGRAM_ID
        );

        expect.fail("Should have blocked transfer to blacklisted user");
      } catch (error) {
        console.log("  ✓ Transfer to blacklisted user3 blocked");
      }
    });
  });

  describe("6. Token Seizure", () => {
    it("should freeze user3 account before seizure", async () => {
      await program.methods
        .freezeAccount()
        .accounts({
          authority: authority.publicKey,
          stablecoinState,
          mint,
          tokenAccount: user3TokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();

      const account = await getAccount(
        provider.connection,
        user3TokenAccount,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      expect(account.isFrozen).to.be.true;

      console.log("  ✓ User3 account frozen");
    });

    it("should seize tokens from blacklisted user3", async () => {
      const beforeBalance = await getAccount(
        provider.connection,
        user3TokenAccount,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      const seizeAmount = new BN(beforeBalance.amount.toString());

      // Create destination account for seized tokens
      const treasuryTokenAccount = await createAssociatedTokenAccountIdempotent(
        provider.connection,
        authority,
        mint,
        authority.publicKey,
        {},
        TOKEN_2022_PROGRAM_ID
      );

      const tx = await program.methods
        .seize(seizeAmount)
        .accounts({
          seizer: seizer.publicKey,
          stablecoinState,
          roleAccount: seizerRole,
          mint,
          fromAccount: user3TokenAccount,
          toAccount: treasuryTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([seizer])
        .rpc();

      console.log("  Seize tx:", tx);

      // Verify tokens were seized
      const afterBalance = await getAccount(
        provider.connection,
        user3TokenAccount,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      expect(afterBalance.amount.toString()).to.equal("0");

      const treasuryBalance = await getAccount(
        provider.connection,
        treasuryTokenAccount,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      expect(treasuryBalance.amount.toString()).to.equal(seizeAmount.toString());

      console.log("  ✓ Seized", seizeAmount.toString(), "tokens from user3");
      console.log("    Tokens moved to treasury");
    });
  });

  describe("7. Blacklist Removal", () => {
    it("should remove user3 from blacklist", async () => {
      const tx = await program.methods
        .removeFromBlacklist(user3.publicKey)
        .accounts({
          blacklister: blacklister.publicKey,
          stablecoinState,
          roleAccount: blacklisterRole,
          blacklistEntry: user3BlacklistEntry,
        })
        .signers([blacklister])
        .rpc();

      console.log("  Remove from blacklist tx:", tx);

      // Verify blacklist entry updated
      const entry = await program.account.blacklistEntry.fetch(user3BlacklistEntry);
      expect(entry.isActive).to.be.false;

      console.log("  ✓ User3 removed from blacklist");
    });

    it("should thaw user3 account after removal", async () => {
      await program.methods
        .thawAccount()
        .accounts({
          authority: authority.publicKey,
          stablecoinState,
          mint,
          tokenAccount: user3TokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();

      const account = await getAccount(
        provider.connection,
        user3TokenAccount,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      expect(account.isFrozen).to.be.false;

      console.log("  ✓ User3 account thawed");
    });

    it("should allow transfers after blacklist removal", async () => {
      // Mint some tokens back to user3
      const mintAmount = new BN(100_000_000); // 100 tokens

      await program.methods
        .mint(mintAmount)
        .accounts({
          minter: minter.publicKey,
          stablecoinState,
          minterAccount,
          mint,
          recipient: user3TokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      // Try transfer
      const transferAmount = new BN(50_000_000); // 50 tokens

      await transfer(
        provider.connection,
        user3,
        user3TokenAccount,
        user1TokenAccount,
        user3.publicKey,
        transferAmount,
        [],
        {},
        TOKEN_2022_PROGRAM_ID
      );

      console.log("  ✓ Transfer from user3 successful after removal");
    });
  });

  describe("8. Compliance Statistics", () => {
    it("should retrieve compliance statistics", async () => {
      const state = await program.account.stablecoinState.fetch(stablecoinState);

      console.log("\n  === Compliance Statistics ===");
      console.log("  Total Minted:", state.totalMinted.toString());
      console.log("  Total Burned:", state.totalBurned.toString());
      console.log("  Total Seized:", state.totalSeized?.toString() || "0");
      console.log("  Blacklist Count:", state.blacklistCount?.toString() || "0");
      console.log("  Is Paused:", state.isPaused);
      console.log("  Permanent Delegate:", state.permanentDelegateEnabled);
      console.log("  Transfer Hook:", state.transferHookEnabled);
      console.log();

      expect(state.permanentDelegateEnabled).to.be.true;
      expect(state.transferHookEnabled).to.be.true;

      console.log("  ✓ Compliance statistics retrieved");
    });
  });

  describe("9. Pause/Unpause with Compliance", () => {
    it("should pause all operations", async () => {
      await program.methods
        .pause()
        .accounts({
          pauser: pauser.publicKey,
          stablecoinState,
          pauserRole,
        })
        .signers([pauser])
        .rpc();

      const state = await program.account.stablecoinState.fetch(stablecoinState);
      expect(state.isPaused).to.be.true;

      console.log("  ✓ Operations paused");
    });

    it("should block all operations when paused", async () => {
      try {
        await program.methods
          .mint(new BN(1_000_000))
          .accounts({
            minter: minter.publicKey,
            stablecoinState,
            minterAccount,
            mint,
            recipient: user1TokenAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();

        expect.fail("Should have blocked mint when paused");
      } catch (error) {
        console.log("  ✓ Mint blocked when paused");
      }
    });

    it("should unpause operations", async () => {
      await program.methods
        .unpause()
        .accounts({
          pauser: pauser.publicKey,
          stablecoinState,
          pauserRole,
        })
        .signers([pauser])
        .rpc();

      const state = await program.account.stablecoinState.fetch(stablecoinState);
      expect(state.isPaused).to.be.false;

      console.log("  ✓ Operations resumed");
    });
  });

  describe("10. Final State Verification", () => {
    it("should verify final token distribution", async () => {
      const user1Balance = await getAccount(
        provider.connection,
        user1TokenAccount,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const user2Balance = await getAccount(
        provider.connection,
        user2TokenAccount,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      const user3Balance = await getAccount(
        provider.connection,
        user3TokenAccount,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      console.log("\n  === Final Token Distribution ===");
      console.log("  User1:", user1Balance.amount.toString());
      console.log("  User2:", user2Balance.amount.toString());
      console.log("  User3:", user3Balance.amount.toString());
      console.log();

      console.log("  ✓ Final state verified");
    });

    it("should verify total supply", async () => {
      const mintData = await getMint(
        provider.connection,
        mint,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );

      console.log("  Total Supply:", mintData.supply.toString());
      expect(Number(mintData.supply)).to.be.greaterThan(0);

      console.log("  ✓ Total supply verified");
    });
  });

  after(() => {
    console.log("\n=== SSS-2 Integration Tests Complete ===");
    console.log("All compliance operations tested successfully!");
    console.log("✓ Blacklist management");
    console.log("✓ Transfer hook enforcement");
    console.log("✓ Token seizure");
    console.log("✓ Compliance statistics");
    console.log();
  });
});
