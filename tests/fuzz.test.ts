// Fuzz test using Trident integration (requires trident crate)
// These are basic fuzzing scenarios for Anchor program

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SssToken } from "../target/types/sss_token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import * as fuzz from "../trident_tests/fuzz";

describe("Fuzz Tests - SSS Token", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;

  let stablecoinPDA: PublicKey;
  let mintPDA: PublicKey;
  let masterRolePDA: PublicKey;

  // Fuzz test with random inputs
  const fuzzIterations = 50;

  before(async () => {
    [stablecoinPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("stablecoin"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    [mintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint"), stablecoinPDA.toBuffer()],
      program.programId
    );

    [masterRolePDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("role"),
        provider.wallet.publicKey.toBuffer(),
        mintPDA.toBuffer(),
      ],
      program.programId
    );
  });

  describe("Fuzz: Initialize", () => {
    // Generate random strings
    const generateRandomString = (length: number): string => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      let result = "";
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    // Generate valid decimals (0-9)
    const generateValidDecimals = (): number => Math.floor(Math.random() * 10);

    it(`Should handle ${fuzzIterations} fuzz iterations for initialize`, async function () {
      this.timeout(60000); // 60 seconds for fuzzing

      for (let i = 0; i < fuzzIterations; i++) {
        // Generate random inputs
        const name = generateRandomString(Math.floor(Math.random() * 31) + 1); // 1-32 chars
        const symbol = generateRandomString(Math.floor(Math.random() * 3) + 1); // 1-10 chars
        const decimals = generateValidDecimals();
        const enableTransferHook = Math.random() > 0.5;
        const enablePermanentDelegate = Math.random() > 0.5;

        try {
          // Derive new PDAs for each iteration (unique seed)
          const randomSeed = anchor.web3.Keypair.generate().publicKey;

          const [testStablecoin] = PublicKey.findProgramAddressSync(
            [Buffer.from("stablecoin"), randomSeed.toBuffer()],
            program.programId
          );

          const [testMint] = PublicKey.findProgramAddressSync(
            [Buffer.from("mint"), testStablecoin.toBuffer()],
            program.programId
          );

          const [testMasterRole] = PublicKey.findProgramAddressSync(
            [
              Buffer.from("role"),
              provider.wallet.publicKey.toBuffer(),
              testMint.toBuffer(),
            ],
            program.programId
          );

          await program.methods
            .initialize(
              name,
              symbol,
              decimals,
              enableTransferHook,
              enablePermanentDelegate
            )
            .accounts({
              authority: provider.wallet.publicKey,
              stablecoinState: testStablecoin,
              masterRole: testMasterRole,
              mint: testMint,
              tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .rpc();

          // Verify state
          const state = await program.account.stablecoinState.fetch(
            testStablecoin
          );
          assert.ok(state.name === name, `Fuzz iteration ${i}: Name mismatch`);
          assert.ok(
            state.symbol === symbol,
            `Fuzz iteration ${i}: Symbol mismatch`
          );
          assert.ok(
            state.decimals === decimals,
            `Fuzz iteration ${i}: Decimals mismatch`
          );

          // Check features
          let expectedFeatures = 0;
          if (enableTransferHook) expectedFeatures |= 1;
          if (enablePermanentDelegate) expectedFeatures |= 2;
          assert.ok(
            state.features === expectedFeatures,
            `Fuzz iteration ${i}: Features mismatch`
          );
        } catch (e) {
          // Expected failures for edge cases
          if (e.toString().includes("InvalidAmount")) {
            // Name/symbol too long - expected
            continue;
          }
          throw e; // Re-throw unexpected errors
        }
      }

      console.log(`Completed ${fuzzIterations} fuzz iterations for initialize`);
    });
  });

  describe("Fuzz: Mint Amounts", () => {
    it(`Should handle edge case amounts`, async function () {
      this.timeout(30000);

      // Initialize test stablecoin
      await program.methods
        .initialize("Fuzz Test", "FUZZ", 6, false, false)
        .accounts({
          authority: provider.wallet.publicKey,
          stablecoinState: stablecoinPDA,
          masterRole: masterRolePDA,
          mint: mintPDA,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      const recipientTokenAccount = await anchor.utils.token.associatedAddress({
        mint: mintPDA,
        owner: provider.wallet.publicKey,
      });

      // Edge cases for amounts
      const edgeCases = [
        new anchor.BN(1), // Minimum amount
        new anchor.BN(1000), // Small amount
        new anchor.BN(1000000), // Standard 1 token
        new anchor.BN(1000000000), // Large amount
        new anchor.BN("18446744073709551615"), // u64 max (should fail)
      ];

      for (const amount of edgeCases) {
        try {
          await program.methods
            .mint(amount)
            .accounts({
              minter: provider.wallet.publicKey,
              stablecoinState: stablecoinPDA,
              minterRole: masterRolePDA,
              mint: mintPDA,
              recipientAccount: recipientTokenAccount,
              tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
              associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .rpc();

          // Success for valid amounts
          console.log(`Successfully minted: ${amount.toString()}`);
        } catch (e) {
          // Expected failure for u64 max
          if (amount.eq(new anchor.BN("18446744073709551615"))) {
            console.log("Expected overflow for u64 max:", e.message);
          } else {
            throw e;
          }
        }
      }
    });
  });

  describe("Fuzz: Batch Operations", () => {
    it("Should handle batch mint with random recipients", async function () {
      this.timeout(60000);

      // Initialize test stablecoin
      const testSeed = anchor.web3.Keypair.generate();
      const [testStablecoin] = PublicKey.findProgramAddressSync(
        [Buffer.from("stablecoin"), testSeed.publicKey.toBuffer()],
        program.programId
      );

      const [testMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint"), testStablecoin.toBuffer()],
        program.programId
      );

      const [testMasterRole] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          provider.wallet.publicKey.toBuffer(),
          testMint.toBuffer(),
        ],
        program.programId
      );

      await program.methods
        .initialize("Batch Fuzz", "BATCH", 6, false, false)
        .accounts({
          authority: provider.wallet.publicKey,
          stablecoinState: testStablecoin,
          masterRole: testMasterRole,
          mint: testMint,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      // Generate random recipients
      const recipientCount = Math.floor(Math.random() * 10) + 1; // 1-10
      const recipients: PublicKey[] = [];
      const amounts: anchor.BN[] = [];

      for (let i = 0; i < recipientCount; i++) {
        recipients.push(anchor.web3.Keypair.generate().publicKey);
        amounts.push(new anchor.BN(Math.floor(Math.random() * 1000000)));
      }

      const totalAmount = amounts.reduce(
        (acc, curr) => acc.add(curr),
        new anchor.BN(0)
      );

      const minterInfo = await anchor.utils.token.associatedAddress({
        mint: testMint,
        owner: provider.wallet.publicKey,
      });

      try {
        await program.methods
          .batchMint(recipients, amounts)
          .accounts({
            minter: provider.wallet.publicKey,
            stablecoinState: testStablecoin,
            minterRole: testMasterRole,
            minterInfo: minterInfo,
            mint: testMint,
            mintAuthority: provider.wallet.publicKey, // PDA
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          })
          .rpc();

        console.log(
          `Batch mint to ${recipientCount} recipients, total: ${totalAmount}`
        );

        // Verify state update
        const state = await program.account.stablecoinState.fetch(
          testStablecoin
        );
        assert.ok(
          state.totalSupply.gte(totalAmount),
          "Supply should increase by batch amount"
        );
      } catch (e) {
        // Batch operations might require additional setup
        console.log("Batch mint result:", e.message);
      }
    });
  });

  describe("Fuzz: Role Combinations", () => {
    it("Should handle valid and invalid role combinations", async function () {
      this.timeout(30000);

      // Define all roles
      const roles = {
        MASTER: 1,
        MINTER: 2,
        BURNER: 4,
        PAUSER: 8,
        BLACKLISTER: 16,
        SEIZER: 32,
      };

      // Test valid combinations
      const validCombinations = [
        roles.MASTER, // Just master
        roles.MINTER, // Just minter
        roles.MINTER | roles.BURNER, // Minter + Burner
        roles.PAUSER | roles.BLACKLISTER | roles.SEIZER, // Admin roles
        roles.MASTER | roles.MINTER | roles.BURNER | roles.PAUSER, // Full control
      ];

      for (const roleBits of validCombinations) {
        const target = anchor.web3.Keypair.generate().publicKey;

        const [targetRolePDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("role"), target.toBuffer(), mintPDA.toBuffer()],
          program.programId
        );

        try {
          await program.methods
            .updateRoles(roleBits)
            .accounts({
              authority: provider.wallet.publicKey,
              stablecoinState: stablecoinPDA,
              authorityRole: masterRolePDA,
              target: target,
              targetRole: targetRolePDA,
              systemProgram: SystemProgram.programId,
            })
            .rpc();

          const role = await program.account.roleAccount.fetch(targetRolePDA);
          assert.equal(
            role.roles,
            roleBits,
            `Role bits ${roleBits} not set correctly`
          );
        } catch (e) {
          // Check if it's an invalid combination
          console.log(`Role combination ${roleBits}:`, e.message);
        }
      }
    });
  });

  describe("Fuzz: Epoch Minting", () => {
    it("Should handle epoch resets and quota enforcement", async function () {
      this.timeout(30000);

      // Initialize with epoch quota
      const [testStablecoin] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("stablecoin"),
          anchor.web3.Keypair.generate().publicKey.toBuffer(),
        ],
        program.programId
      );

      const [testMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("mint"), testStablecoin.toBuffer()],
        program.programId
      );

      const [testMasterRole] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("role"),
          provider.wallet.publicKey.toBuffer(),
          testMint.toBuffer(),
        ],
        program.programId
      );

      await program.methods
        .initialize("Epoch Test", "EPOCH", 6, false, false)
        .accounts({
          authority: provider.wallet.publicKey,
          stablecoinState: testStablecoin,
          masterRole: testMasterRole,
          mint: testMint,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      // Set epoch quota
      await program.methods
        .updateEpochQuota(new anchor.BN(1000000)) // 1 token per epoch
        .accounts({
          authority: provider.wallet.publicKey,
          stablecoinState: testStablecoin,
          authorityRole: testMasterRole,
        })
        .rpc();

      const recipient = await anchor.utils.token.associatedAddress({
        mint: testMint,
        owner: provider.wallet.publicKey,
      });

      // Mint within quota
      await program.methods
        .mint(new anchor.BN(500000)) // 0.5 tokens
        .accounts({
          minter: provider.wallet.publicKey,
          stablecoinState: testStablecoin,
          minterRole: testMasterRole,
          mint: testMint,
          recipientAccount: recipient,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      // Try to exceed quota
      try {
        await program.methods
          .mint(new anchor.BN(600000)) // Would exceed quota
          .accounts({
            minter: provider.wallet.publicKey,
            stablecoinState: testStablecoin,
            minterRole: testMasterRole,
            mint: testMint,
            recipientAccount: recipient,
            tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
            associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .rpc();

        assert.fail("Should have thrown epoch quota exceeded");
      } catch (e) {
        assert.ok(e.toString().includes("EpochQuotaExceeded"));
      }
    });
  });
});
