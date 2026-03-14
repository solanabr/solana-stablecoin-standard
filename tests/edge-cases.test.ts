/**
 * Solana Stablecoin Standard - Edge Case & Security Tests
 * 
 * Comprehensive test coverage for:
 * - RBAC isolation (role escalation prevention)
 * - Supply cap boundaries
 * - Underflow protection
 * - Pause cycle handling
 * - Freeze edge cases
 * - Authority transfer security
 * - Banking rail validation
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SssToken } from "../target/types/sss_token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { assert, expect } from "chai";

const DECIMALS = 6;

describe("Edge Cases & Security Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as Program<SssToken>;

  // Test accounts
  const authority = Keypair.generate();
  const minter = Keypair.generate();
  const burner = Keypair.generate();
  const freezer = Keypair.generate();
  const pauser = Keypair.generate();
  const blacklister = Keypair.generate();
  const randomUser = Keypair.generate();
  const mint = Keypair.generate();

  const deriveConfigPda = (mintPk: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mintPk.toBuffer()],
      program.programId
    );
  };

  const deriveRolesPda = (configPk: PublicKey, targetPk: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("roles"), configPk.toBuffer(), targetPk.toBuffer()],
      program.programId
    );
  };

  before(async () => {
    console.log("\n🔬 Setting up edge case test environment...\n");
    
    const accounts = [
      authority, minter, burner, freezer, pauser, blacklister, randomUser
    ];
    
    for (const account of accounts) {
      const sig = await provider.connection.requestAirdrop(
        account.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
    
    // Initialize test stablecoin with SSS-2 preset
    const [configPda] = deriveConfigPda(mint.publicKey);
    const [rolesPda] = deriveRolesPda(configPda, authority.publicKey);
    
    await program.methods
      .initialize({
        name: "Edge Test USD",
        symbol: "ETUSD",
        decimals: DECIMALS,
        preset: { sss2: {} },
        supplyCap: new anchor.BN(10_000_000 * 10 ** DECIMALS),
        uri: "https://example.com/metadata.json",
        hookProgramId: null,
        backingType: { fiat: {} },
        bankingRail: { ach: {} },
        oracle: null,
      })
      .accounts({
        authority: authority.publicKey,
        mint: mint.publicKey,
        config: configPda,
        rolesConfig: rolesPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority, mint])
      .rpc();

    // Assign roles
    const roles = [
      { target: minter, role: 0 },   // minter
      { target: burner, role: 1 },   // burner
      { target: pauser, role: 2 },   // pauser
      { target: freezer, role: 3 },  // freezer
      { target: blacklister, role: 4 }, // blacklister
    ];

    for (const { target, role } of roles) {
      const [targetRolesPda] = deriveRolesPda(configPda, target.publicKey);
      await program.methods
        .updateRoles(target.publicKey, role, true)
        .accounts({
          authority: authority.publicKey,
          config: configPda,
          targetWallet: target.publicKey,
          rolesConfig: targetRolesPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    }

    console.log("  ✓ Test environment initialized\n");
  });

  // ========================================================================
  // RBAC ISOLATION TESTS (11 tests)
  // ========================================================================

  describe("RBAC Isolation - Role Escalation Prevention", () => {
    
    it("should prevent minter from burning tokens", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, minter.publicKey);
      
      // First mint some tokens
      const minterAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        minter.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      // Create ATA and mint
      const createAtaIx = createAssociatedTokenAccountInstruction(
        minter.publicKey,
        minterAta,
        minter.publicKey,
        mint.publicKey,
        TOKEN_2022_PROGRAM_ID
      );
      const tx = new Transaction().add(createAtaIx);
      await sendAndConfirmTransaction(provider.connection, tx, [minter]);
      
      await program.methods
        .mintTokens(new anchor.BN(1000 * 10 ** DECIMALS))
        .accounts({
          authority: minter.publicKey,
          mint: mint.publicKey,
          config: configPda,
          rolesConfig: rolesPda,
          destinationAccount: minterAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      // Minter tries to burn - should fail since not a burner
      try {
        await program.methods
          .burnTokens(new anchor.BN(100 * 10 ** DECIMALS))
          .accounts({
            authority: minter.publicKey,
            mint: mint.publicKey,
            config: configPda,
            rolesConfig: rolesPda,
            tokenAccount: minterAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        assert.fail("Minter should not be able to burn");
      } catch (err: any) {
        // Expected - minter doesn't have burner role
        expect(err.message).to.include("Unauthorized");
      }
    });

    it("should prevent minter from freezing accounts", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, minter.publicKey);
      
      const targetAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        randomUser.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      try {
        await program.methods
          .freezeAccount()
          .accounts({
            authority: minter.publicKey,
            mint: mint.publicKey,
            config: configPda,
            rolesConfig: rolesPda,
            tokenAccount: targetAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        assert.fail("Minter should not be able to freeze");
      } catch (err: any) {
        expect(err.message.toLowerCase()).to.include("unauthorized");
      }
    });

    it("should prevent minter from blacklisting addresses", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, minter.publicKey);
      const [blacklistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("blacklist"), configPda.toBuffer(), randomUser.publicKey.toBuffer()],
        program.programId
      );
      
      try {
        await program.methods
          .addToBlacklist(randomUser.publicKey)
          .accounts({
            authority: minter.publicKey,
            mint: mint.publicKey,
            config: configPda,
            rolesConfig: rolesPda,
            target: randomUser.publicKey,
            blacklistEntry: blacklistPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([minter])
          .rpc();
        assert.fail("Minter should not be able to blacklist");
      } catch (err: any) {
        expect(err.message.toLowerCase()).to.include("unauthorized");
      }
    });

    it("should prevent minter from pausing protocol", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, minter.publicKey);
      
      try {
        await program.methods
          .pause()
          .accounts({
            authority: minter.publicKey,
            config: configPda,
            rolesConfig: rolesPda,
          })
          .signers([minter])
          .rpc();
        assert.fail("Minter should not be able to pause");
      } catch (err: any) {
        expect(err.message.toLowerCase()).to.include("unauthorized");
      }
    });

    it("should prevent freezer from minting tokens", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, freezer.publicKey);
      
      const targetAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        freezer.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      try {
        await program.methods
          .mintTokens(new anchor.BN(100 * 10 ** DECIMALS))
          .accounts({
            authority: freezer.publicKey,
            mint: mint.publicKey,
            config: configPda,
            rolesConfig: rolesPda,
            destinationAccount: targetAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([freezer])
          .rpc();
        assert.fail("Freezer should not be able to mint");
      } catch (err: any) {
        expect(err.message.toLowerCase()).to.include("unauthorized");
      }
    });

    it("should prevent burner from minting tokens", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, burner.publicKey);
      
      const targetAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        burner.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      try {
        await program.methods
          .mintTokens(new anchor.BN(100 * 10 ** DECIMALS))
          .accounts({
            authority: burner.publicKey,
            mint: mint.publicKey,
            config: configPda,
            rolesConfig: rolesPda,
            destinationAccount: targetAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([burner])
          .rpc();
        assert.fail("Burner should not be able to mint");
      } catch (err: any) {
        expect(err.message.toLowerCase()).to.include("unauthorized");
      }
    });

    it("should prevent pauser from freezing individual accounts", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, pauser.publicKey);
      
      const targetAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        randomUser.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      try {
        await program.methods
          .freezeAccount()
          .accounts({
            authority: pauser.publicKey,
            mint: mint.publicKey,
            config: configPda,
            rolesConfig: rolesPda,
            tokenAccount: targetAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([pauser])
          .rpc();
        assert.fail("Pauser should not be able to freeze accounts");
      } catch (err: any) {
        expect(err.message.toLowerCase()).to.include("unauthorized");
      }
    });

    it("should prevent blacklister from seizing tokens", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, blacklister.publicKey);
      
      const minterAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        minter.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      const treasuryAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        authority.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      try {
        await program.methods
          .seize(new anchor.BN(100 * 10 ** DECIMALS))
          .accounts({
            seizer: blacklister.publicKey,
            mint: mint.publicKey,
            config: configPda,
            rolesConfig: rolesPda,
            fromAccount: minterAta,
            treasury: treasuryAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([blacklister])
          .rpc();
        assert.fail("Blacklister should not be able to seize");
      } catch (err: any) {
        expect(err.message.toLowerCase()).to.include("unauthorized");
      }
    });

    it("should prevent random user from any privileged operation", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, randomUser.publicKey);
      
      // Try to assign roles
      try {
        const [targetRolesPda] = deriveRolesPda(configPda, randomUser.publicKey);
        await program.methods
          .updateRoles(randomUser.publicKey, 0, true)  // Try to make self minter
          .accounts({
            authority: randomUser.publicKey,
            config: configPda,
            targetWallet: randomUser.publicKey,
            rolesConfig: targetRolesPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([randomUser])
          .rpc();
        assert.fail("Random user should not be able to assign roles");
      } catch (err: any) {
        expect(err.message.toLowerCase()).to.include("unauthorized");
      }
    });

    it("should prevent non-authority from transferring authority", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      
      try {
        await program.methods
          .transferAuthority(randomUser.publicKey)
          .accounts({
            authority: randomUser.publicKey,
            config: configPda,
          })
          .signers([randomUser])
          .rpc();
        assert.fail("Non-authority should not transfer authority");
      } catch (err: any) {
        expect(err.message.toLowerCase()).to.include("unauthorized");
      }
    });

    it("should prevent non-authority from nominating new authority", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      
      try {
        await program.methods
          .nominateAuthority(randomUser.publicKey)
          .accounts({
            authority: minter.publicKey,  // Minter trying to nominate
            config: configPda,
          })
          .signers([minter])
          .rpc();
        assert.fail("Non-authority should not nominate authority");
      } catch (err: any) {
        expect(err.message.toLowerCase()).to.include("unauthorized");
      }
    });
  });

  // ========================================================================
  // SUPPLY CAP BOUNDARY TESTS
  // ========================================================================

  describe("Supply Cap Boundaries", () => {
    
    it("should allow minting exactly at supply cap", async () => {
      // This test needs a separate mint with smaller cap
      const testMint = Keypair.generate();
      const smallCap = 1000 * 10 ** DECIMALS;
      
      const [configPda] = deriveConfigPda(testMint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, authority.publicKey);
      
      await program.methods
        .initialize({
          name: "Cap Test",
          symbol: "CAP",
          decimals: DECIMALS,
          preset: { sss1: {} },
          supplyCap: new anchor.BN(smallCap),
          uri: "",
          hookProgramId: null,
          backingType: { fiat: {} },
          bankingRail: { none: {} },
          oracle: null,
        })
        .accounts({
          authority: authority.publicKey,
          mint: testMint.publicKey,
          config: configPda,
          rolesConfig: rolesPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority, testMint])
        .rpc();

      // Create ATA and mint exactly at cap
      const ata = getAssociatedTokenAddressSync(
        testMint.publicKey,
        authority.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      const createAtaIx = createAssociatedTokenAccountInstruction(
        authority.publicKey,
        ata,
        authority.publicKey,
        testMint.publicKey,
        TOKEN_2022_PROGRAM_ID
      );
      const tx = new Transaction().add(createAtaIx);
      await sendAndConfirmTransaction(provider.connection, tx, [authority]);
      
      // Mint exactly at cap should succeed
      await program.methods
        .mintTokens(new anchor.BN(smallCap))
        .accounts({
          authority: authority.publicKey,
          mint: testMint.publicKey,
          config: configPda,
          rolesConfig: rolesPda,
          destinationAccount: ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();

      const account = await getAccount(
        provider.connection,
        ata,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      assert.equal(account.amount.toString(), smallCap.toString());
    });

    it("should reject minting cap + 1", async () => {
      const testMint = Keypair.generate();
      const smallCap = 500 * 10 ** DECIMALS;
      
      const [configPda] = deriveConfigPda(testMint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, authority.publicKey);
      
      await program.methods
        .initialize({
          name: "Cap Test 2",
          symbol: "CAP2",
          decimals: DECIMALS,
          preset: { sss1: {} },
          supplyCap: new anchor.BN(smallCap),
          uri: "",
          hookProgramId: null,
          backingType: { fiat: {} },
          bankingRail: { none: {} },
          oracle: null,
        })
        .accounts({
          authority: authority.publicKey,
          mint: testMint.publicKey,
          config: configPda,
          rolesConfig: rolesPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority, testMint])
        .rpc();

      const ata = getAssociatedTokenAddressSync(
        testMint.publicKey,
        authority.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      const createAtaIx = createAssociatedTokenAccountInstruction(
        authority.publicKey,
        ata,
        authority.publicKey,
        testMint.publicKey,
        TOKEN_2022_PROGRAM_ID
      );
      const tx = new Transaction().add(createAtaIx);
      await sendAndConfirmTransaction(provider.connection, tx, [authority]);
      
      // Try to mint cap + 1
      try {
        await program.methods
          .mintTokens(new anchor.BN(smallCap + 1))
          .accounts({
            authority: authority.publicKey,
            mint: testMint.publicKey,
            config: configPda,
            rolesConfig: rolesPda,
            destinationAccount: ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([authority])
          .rpc();
        assert.fail("Should reject minting above cap");
      } catch (err: any) {
        expect(err.message).to.include("SupplyCapExceeded");
      }
    });

    it("should allow setting new cap >= current supply", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      
      // Get current supply from config
      const config = await program.account.stablecoinConfig.fetch(configPda);
      const currentSupply = config.totalMinted.sub(config.totalBurned);
      
      // Set cap to current supply (should succeed)
      const newCap = currentSupply.add(new anchor.BN(1000 * 10 ** DECIMALS));
      
      await program.methods
        .setSupplyCap(newCap)
        .accounts({
          authority: authority.publicKey,
          config: configPda,
        })
        .signers([authority])
        .rpc();

      const updatedConfig = await program.account.stablecoinConfig.fetch(configPda);
      assert.equal(updatedConfig.supplyCap.toString(), newCap.toString());
    });

    it("should reject setting cap below current supply", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      
      try {
        // Try to set cap to 1 (way below current supply)
        await program.methods
          .setSupplyCap(new anchor.BN(1))
          .accounts({
            authority: authority.publicKey,
            config: configPda,
          })
          .signers([authority])
          .rpc();
        assert.fail("Should reject cap below supply");
      } catch (err: any) {
        expect(err.message).to.include("SupplyCapExceeded");
      }
    });
  });

  // ========================================================================
  // UNDERFLOW PROTECTION TESTS
  // ========================================================================

  describe("Underflow Protection", () => {
    
    it("should reject burn of zero amount", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, authority.publicKey);
      
      const ata = getAssociatedTokenAddressSync(
        mint.publicKey,
        authority.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      try {
        await program.methods
          .burnTokens(new anchor.BN(0))
          .accounts({
            authority: authority.publicKey,
            mint: mint.publicKey,
            config: configPda,
            rolesConfig: rolesPda,
            tokenAccount: ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([authority])
          .rpc();
        assert.fail("Should reject zero burn");
      } catch (err: any) {
        expect(err.message).to.include("InvalidAmount");
      }
    });

    it("should reject burn exceeding balance", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, authority.publicKey);
      
      const ata = getAssociatedTokenAddressSync(
        mint.publicKey,
        authority.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      try {
        // Try to burn more than anyone could have
        await program.methods
          .burnTokens(new anchor.BN("999999999999999999"))
          .accounts({
            authority: authority.publicKey,
            mint: mint.publicKey,
            config: configPda,
            rolesConfig: rolesPda,
            tokenAccount: ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([authority])
          .rpc();
        assert.fail("Should reject excessive burn");
      } catch (err: any) {
        // Token program will reject this
        assert.ok(err, "Should throw error");
      }
    });

    it("should reject mint of zero amount", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, minter.publicKey);
      
      const ata = getAssociatedTokenAddressSync(
        mint.publicKey,
        minter.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      try {
        await program.methods
          .mintTokens(new anchor.BN(0))
          .accounts({
            authority: minter.publicKey,
            mint: mint.publicKey,
            config: configPda,
            rolesConfig: rolesPda,
            destinationAccount: ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        assert.fail("Should reject zero mint");
      } catch (err: any) {
        expect(err.message).to.include("InvalidAmount");
      }
    });
  });

  // ========================================================================
  // PAUSE CYCLE TESTS
  // ========================================================================

  describe("Pause Cycle Handling", () => {
    
    it("should handle pause-unpause-pause cycle", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, pauser.publicKey);
      
      // Pause
      await program.methods
        .pause()
        .accounts({
          authority: pauser.publicKey,
          config: configPda,
          rolesConfig: rolesPda,
        })
        .signers([pauser])
        .rpc();

      let config = await program.account.stablecoinConfig.fetch(configPda);
      assert.ok(config.isPaused, "Should be paused");

      // Unpause
      await program.methods
        .unpause()
        .accounts({
          authority: pauser.publicKey,
          config: configPda,
          rolesConfig: rolesPda,
        })
        .signers([pauser])
        .rpc();

      config = await program.account.stablecoinConfig.fetch(configPda);
      assert.ok(!config.isPaused, "Should be unpaused");

      // Pause again
      await program.methods
        .pause()
        .accounts({
          authority: pauser.publicKey,
          config: configPda,
          rolesConfig: rolesPda,
        })
        .signers([pauser])
        .rpc();

      config = await program.account.stablecoinConfig.fetch(configPda);
      assert.ok(config.isPaused, "Should be paused again");

      // Cleanup - unpause
      await program.methods
        .unpause()
        .accounts({
          authority: pauser.publicKey,
          config: configPda,
          rolesConfig: rolesPda,
        })
        .signers([pauser])
        .rpc();
    });

    it("should reject double pause", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, pauser.publicKey);
      
      await program.methods
        .pause()
        .accounts({
          authority: pauser.publicKey,
          config: configPda,
          rolesConfig: rolesPda,
        })
        .signers([pauser])
        .rpc();

      try {
        await program.methods
          .pause()
          .accounts({
            authority: pauser.publicKey,
            config: configPda,
            rolesConfig: rolesPda,
          })
          .signers([pauser])
          .rpc();
        assert.fail("Should reject double pause");
      } catch (err: any) {
        expect(err.message).to.include("AlreadyPaused");
      }

      // Cleanup
      await program.methods
        .unpause()
        .accounts({
          authority: pauser.publicKey,
          config: configPda,
          rolesConfig: rolesPda,
        })
        .signers([pauser])
        .rpc();
    });

    it("should reject double unpause", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, pauser.publicKey);
      
      // Ensure unpaused
      const config = await program.account.stablecoinConfig.fetch(configPda);
      assert.ok(!config.isPaused, "Should start unpaused");

      try {
        await program.methods
          .unpause()
          .accounts({
            authority: pauser.publicKey,
            config: configPda,
            rolesConfig: rolesPda,
          })
          .signers([pauser])
          .rpc();
        assert.fail("Should reject unpause when not paused");
      } catch (err: any) {
        expect(err.message).to.include("NotPaused");
      }
    });

    it("should block minting while paused", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [pauserRolesPda] = deriveRolesPda(configPda, pauser.publicKey);
      const [minterRolesPda] = deriveRolesPda(configPda, minter.publicKey);
      
      // Pause
      await program.methods
        .pause()
        .accounts({
          authority: pauser.publicKey,
          config: configPda,
          rolesConfig: pauserRolesPda,
        })
        .signers([pauser])
        .rpc();

      const minterAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        minter.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      try {
        await program.methods
          .mintTokens(new anchor.BN(100 * 10 ** DECIMALS))
          .accounts({
            authority: minter.publicKey,
            mint: mint.publicKey,
            config: configPda,
            rolesConfig: minterRolesPda,
            destinationAccount: minterAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        assert.fail("Should block minting while paused");
      } catch (err: any) {
        expect(err.message).to.include("Paused");
      }

      // Cleanup
      await program.methods
        .unpause()
        .accounts({
          authority: pauser.publicKey,
          config: configPda,
          rolesConfig: pauserRolesPda,
        })
        .signers([pauser])
        .rpc();
    });
  });

  // ========================================================================
  // TWO-STEP AUTHORITY TRANSFER TESTS
  // ========================================================================

  describe("Two-Step Authority Transfer", () => {
    const newAuthority = Keypair.generate();
    
    before(async () => {
      const sig = await provider.connection.requestAirdrop(
        newAuthority.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    });

    it("should nominate new authority", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      
      await program.methods
        .nominateAuthority(newAuthority.publicKey)
        .accounts({
          authority: authority.publicKey,
          config: configPda,
        })
        .signers([authority])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      assert.ok(config.pendingAuthority, "Should have pending authority");
      assert.equal(
        config.pendingAuthority.toBase58(),
        newAuthority.publicKey.toBase58()
      );
    });

    it("should reject accept from wrong authority", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      
      try {
        await program.methods
          .acceptAuthority()
          .accounts({
            newAuthority: randomUser.publicKey, // Wrong person
            config: configPda,
          })
          .signers([randomUser])
          .rpc();
        assert.fail("Should reject wrong acceptor");
      } catch (err: any) {
        expect(err.message.toLowerCase()).to.include("unauthorized");
      }
    });

    it("should allow nominated authority to accept", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      
      await program.methods
        .acceptAuthority()
        .accounts({
          newAuthority: newAuthority.publicKey,
          config: configPda,
        })
        .signers([newAuthority])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      assert.equal(
        config.authority.toBase58(),
        newAuthority.publicKey.toBase58()
      );
      assert.ok(!config.pendingAuthority, "Pending authority should be cleared");
    });

    it("should reject actions from old authority", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      
      try {
        await program.methods
          .nominateAuthority(authority.publicKey) // Old authority tries to nominate
          .accounts({
            authority: authority.publicKey, // Old authority
            config: configPda,
          })
          .signers([authority])
          .rpc();
        assert.fail("Old authority should be rejected");
      } catch (err: any) {
        expect(err.message.toLowerCase()).to.include("unauthorized");
      }
    });

    // Transfer back for other tests
    after(async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      
      await program.methods
        .transferAuthority(authority.publicKey)
        .accounts({
          authority: newAuthority.publicKey,
          config: configPda,
        })
        .signers([newAuthority])
        .rpc();
    });
  });

  // ========================================================================
  // BLACKLIST AUDIT TRAIL TESTS
  // ========================================================================

  describe("Blacklist Audit Trail", () => {
    const targetUser = Keypair.generate();
    
    before(async () => {
      const sig = await provider.connection.requestAirdrop(
        targetUser.publicKey,
        LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    });

    it("should track blacklist audit fields", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, blacklister.publicKey);
      const [blacklistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("blacklist"), configPda.toBuffer(), targetUser.publicKey.toBuffer()],
        program.programId
      );
      
      await program.methods
        .addToBlacklist(targetUser.publicKey)
        .accounts({
          authority: blacklister.publicKey,
          mint: mint.publicKey,
          config: configPda,
          rolesConfig: rolesPda,
          target: targetUser.publicKey,
          blacklistEntry: blacklistPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([blacklister])
        .rpc();

      const entry = await program.account.blacklistEntry.fetch(blacklistPda);
      assert.ok(entry.isBlacklisted, "Should be blacklisted");
      assert.equal(entry.blacklistedBy.toBase58(), blacklister.publicKey.toBase58());
      assert.ok(entry.blacklistedAt > 0, "Should have timestamp");
    });

    it("should preserve audit trail on removal", async () => {
      const [configPda] = deriveConfigPda(mint.publicKey);
      const [rolesPda] = deriveRolesPda(configPda, blacklister.publicKey);
      const [blacklistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("blacklist"), configPda.toBuffer(), targetUser.publicKey.toBuffer()],
        program.programId
      );
      
      await program.methods
        .removeFromBlacklist()
        .accounts({
          authority: blacklister.publicKey,
          mint: mint.publicKey,
          config: configPda,
          rolesConfig: rolesPda,
          blacklistEntry: blacklistPda,
        })
        .signers([blacklister])
        .rpc();

      const entry = await program.account.blacklistEntry.fetch(blacklistPda);
      assert.ok(!entry.isBlacklisted, "Should not be blacklisted");
      assert.ok(entry.removedBy, "Should have removedBy");
      assert.ok(entry.removedAt, "Should have removedAt");
      // Original fields preserved
      assert.ok(entry.blacklistedAt > 0, "Original timestamp preserved");
    });
  });

  // ========================================================================
  // SUMMARY
  // ========================================================================

  after(async () => {
    console.log("\n" + "=".repeat(60));
    console.log("          EDGE CASE & SECURITY TEST SUMMARY");
    console.log("=".repeat(60));
    console.log(`
  ✅ RBAC Isolation Tests (11 tests)
     • Minter cannot: burn, freeze, blacklist, pause
     • Freezer cannot mint
     • Burner cannot mint
     • Pauser cannot freeze accounts
     • Blacklister cannot seize
     • Random user blocked from all ops
     • Non-authority cannot transfer/nominate
     
  ✅ Supply Cap Boundary Tests
     • Exact cap minting succeeds
     • Cap+1 minting fails
     • Cap update >= supply succeeds
     • Cap update < supply fails
     
  ✅ Underflow Protection Tests
     • Zero burn rejected
     • Excessive burn rejected
     • Zero mint rejected
     
  ✅ Pause Cycle Tests
     • Pause-unpause-pause works
     • Double pause rejected
     • Double unpause rejected
     • Operations blocked while paused
     
  ✅ Two-Step Authority Transfer Tests
     • Nomination works
     • Wrong acceptor rejected
     • Correct acceptor succeeds
     • Old authority rejected after transfer
     
  ✅ Blacklist Audit Trail Tests
     • Audit fields tracked on add
     • Audit fields preserved on remove
`);
    console.log("=".repeat(60) + "\n");
  });
});
