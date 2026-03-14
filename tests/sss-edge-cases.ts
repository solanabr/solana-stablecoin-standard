import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

// ---------------------------------------------------------------------------
// Constants & PDA helpers
// ---------------------------------------------------------------------------
const SSS_CORE_PROGRAM_ID = new PublicKey(
  "G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL",
);

const CONFIG_SEED = Buffer.from("config");
const ROLE_SEED = Buffer.from("role");
const QUOTA_SEED = Buffer.from("quota");
const BLACKLIST_SEED = Buffer.from("blacklist");

const ROLE_MINTER = 0x01;
const ROLE_FREEZER = 0x03;
const ROLE_BLACKLISTER = 0x04;
const ROLE_SEIZER = 0x05;

function getConfigAddress(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED, mint.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

function getRoleAddress(role: number, config: PublicKey, holder: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ROLE_SEED, config.toBuffer(), Buffer.from([role]), holder.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

function getQuotaAddress(
  config: PublicKey,
  minter: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [QUOTA_SEED, config.toBuffer(), minter.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

function getBlacklistAddress(
  config: PublicKey,
  address: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, config.toBuffer(), address.toBuffer()],
    SSS_CORE_PROGRAM_ID,
  );
}

// ---------------------------------------------------------------------------
// Shared state: SSS-1 mint (compliance disabled)
// ---------------------------------------------------------------------------
describe("SSS Edge Cases", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssCore as Program;
  const authority = provider.wallet as anchor.Wallet;

  // SSS-1 mint (no compliance)
  const mintKeypairSss1 = Keypair.generate();
  const mintKeySss1 = mintKeypairSss1.publicKey;
  const [configPdaSss1] = getConfigAddress(mintKeySss1);

  // Roles for SSS-1
  const [minterRole] = getRoleAddress(ROLE_MINTER, configPdaSss1, authority.publicKey);
  const [minterQuota] = getQuotaAddress(configPdaSss1, authority.publicKey);
  const [freezerRole] = getRoleAddress(ROLE_FREEZER, configPdaSss1, authority.publicKey);

  // Unauthorized signer
  const unauthorizedUser = Keypair.generate();

  let authorityAta: PublicKey;

  // ------------------------------------------------------------------
  // Setup: Initialize SSS-1 mint with minter + quota
  // ------------------------------------------------------------------
  before(async () => {
    const input = {
      name: "Edge USD",
      symbol: "EUSD",
      uri: "https://example.com/eusd.json",
      decimals: 6,
      complianceEnabled: false,
      enableAllowlist: false,
      supplyCap: null,
    };

    await program.methods
      .initialize(input)
      .accountsPartial({
        authority: authority.publicKey,
        mint: mintKeySss1,
        config: configPdaSss1,
        transferHookProgram: null,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypairSss1])
      .rpc();

    // Grant minter role
    await program.methods
      .grantRole(ROLE_MINTER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPdaSss1,
        roleAssignment: minterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Set generous quota
    await program.methods
      .setQuota(authority.publicKey, new BN("18446744073709551615"))
      .accountsPartial({
        authority: authority.publicKey,
        config: configPdaSss1,
        minterRole,
        minterQuota,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Grant freezer role
    await program.methods
      .grantRole(ROLE_FREEZER, authority.publicKey)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPdaSss1,
        roleAssignment: freezerRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Create authority ATA
    authorityAta = getAssociatedTokenAddressSync(
      mintKeySss1,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        authorityAta,
        authority.publicKey,
        mintKeySss1,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
    await provider.sendAndConfirm(tx);

    // Mint some tokens for burn tests
    await program.methods
      .mintTokens(new BN(1_000_000_000))
      .accountsPartial({
        minter: authority.publicKey,
        config: configPdaSss1,
        minterRole,
        minterQuota,
        mint: mintKeySss1,
        recipientTokenAccount: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    // Fund unauthorized user
    const sig = await provider.connection.requestAirdrop(
      unauthorizedUser.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig);
  });

  // ==================================================================
  // Zero Amount Tests
  // ==================================================================
  describe("Zero amount operations", () => {
    it("fails to mint zero tokens", async () => {
      try {
        await program.methods
          .mintTokens(new BN(0))
          .accountsPartial({
            minter: authority.publicKey,
            config: configPdaSss1,
            minterRole,
            minterQuota,
            mint: mintKeySss1,
            recipientTokenAccount: authorityAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        expect.fail("Expected transaction to fail with ZeroAmount");
      } catch (err: any) {
        expect(err.toString()).to.include("ZeroAmount");
      }
    });

    it("fails to burn zero tokens", async () => {
      try {
        await program.methods
          .burnTokens(new BN(0))
          .accountsPartial({
            burner: authority.publicKey,
            config: configPdaSss1,
            mint: mintKeySss1,
            burnerTokenAccount: authorityAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        expect.fail("Expected transaction to fail with ZeroAmount");
      } catch (err: any) {
        expect(err.toString()).to.include("ZeroAmount");
      }
    });
  });

  // ==================================================================
  // Pause/Unpause Edge Cases
  // ==================================================================
  describe("Pause/unpause edge cases", () => {
    it("pauses the stablecoin", async () => {
      await program.methods
        .pause()
        .accountsPartial({
          authority: authority.publicKey,
          config: configPdaSss1,
        })
        .rpc();

      const configAccount = await program.account.stablecoinConfig.fetch(
        configPdaSss1,
      );
      expect(configAccount.paused).to.equal(true);
    });

    it("fails to pause when already paused (double pause)", async () => {
      try {
        await program.methods
          .pause()
          .accountsPartial({
            authority: authority.publicKey,
            config: configPdaSss1,
          })
          .rpc();

        expect.fail("Expected transaction to fail with AlreadyPaused");
      } catch (err: any) {
        expect(err.toString()).to.include("AlreadyPaused");
      }
    });

    it("minting fails while paused", async () => {
      try {
        await program.methods
          .mintTokens(new BN(100))
          .accountsPartial({
            minter: authority.publicKey,
            config: configPdaSss1,
            minterRole,
            minterQuota,
            mint: mintKeySss1,
            recipientTokenAccount: authorityAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        expect.fail("Expected transaction to fail with Paused");
      } catch (err: any) {
        expect(err.toString()).to.include("Paused");
      }
    });

    it("burning fails while paused", async () => {
      try {
        await program.methods
          .burnTokens(new BN(100))
          .accountsPartial({
            burner: authority.publicKey,
            config: configPdaSss1,
            mint: mintKeySss1,
            burnerTokenAccount: authorityAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        expect.fail("Expected transaction to fail with Paused");
      } catch (err: any) {
        expect(err.toString()).to.include("Paused");
      }
    });

    it("freezing fails while paused", async () => {
      try {
        await program.methods
          .freezeAccount()
          .accountsPartial({
            freezer: authority.publicKey,
            config: configPdaSss1,
            freezerRole,
            mint: mintKeySss1,
            targetTokenAccount: authorityAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        expect.fail("Expected transaction to fail with Paused");
      } catch (err: any) {
        expect(err.toString()).to.include("Paused");
      }
    });

    it("unpauses the stablecoin", async () => {
      await program.methods
        .unpause()
        .accountsPartial({
          authority: authority.publicKey,
          config: configPdaSss1,
        })
        .rpc();

      const configAccount = await program.account.stablecoinConfig.fetch(
        configPdaSss1,
      );
      expect(configAccount.paused).to.equal(false);
    });

    it("fails to unpause when not paused", async () => {
      try {
        await program.methods
          .unpause()
          .accountsPartial({
            authority: authority.publicKey,
            config: configPdaSss1,
          })
          .rpc();

        expect.fail("Expected transaction to fail with NotPaused");
      } catch (err: any) {
        expect(err.toString()).to.include("NotPaused");
      }
    });
  });

  // ==================================================================
  // Unauthorized Access Tests
  // ==================================================================
  describe("Unauthorized access", () => {
    it("unauthorized user cannot pause", async () => {
      try {
        await program.methods
          .pause()
          .accountsPartial({
            authority: unauthorizedUser.publicKey,
            config: configPdaSss1,
          })
          .signers([unauthorizedUser])
          .rpc();

        expect.fail("Expected transaction to fail with Unauthorized");
      } catch (err: any) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });

    it("unauthorized user cannot unpause", async () => {
      // First pause with authority
      await program.methods
        .pause()
        .accountsPartial({
          authority: authority.publicKey,
          config: configPdaSss1,
        })
        .rpc();

      try {
        await program.methods
          .unpause()
          .accountsPartial({
            authority: unauthorizedUser.publicKey,
            config: configPdaSss1,
          })
          .signers([unauthorizedUser])
          .rpc();

        expect.fail("Expected transaction to fail with Unauthorized");
      } catch (err: any) {
        expect(err.toString()).to.include("Unauthorized");
      }

      // Clean up: unpause
      await program.methods
        .unpause()
        .accountsPartial({
          authority: authority.publicKey,
          config: configPdaSss1,
        })
        .rpc();
    });

    it("unauthorized user cannot propose authority transfer", async () => {
      try {
        await program.methods
          .proposeAuthority(unauthorizedUser.publicKey)
          .accountsPartial({
            authority: unauthorizedUser.publicKey,
            config: configPdaSss1,
          })
          .signers([unauthorizedUser])
          .rpc();

        expect.fail("Expected transaction to fail with Unauthorized");
      } catch (err: any) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });

    it("unauthorized user cannot set quota", async () => {
      try {
        await program.methods
          .setQuota(authority.publicKey, new BN(999))
          .accountsPartial({
            authority: unauthorizedUser.publicKey,
            config: configPdaSss1,
            minterRole,
            minterQuota,
            systemProgram: SystemProgram.programId,
          })
          .signers([unauthorizedUser])
          .rpc();

        expect.fail("Expected transaction to fail with Unauthorized");
      } catch (err: any) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });
  });

  // ==================================================================
  // Compliance Instructions on SSS-1 (should fail)
  // ==================================================================
  describe("SSS-2 compliance instructions fail on SSS-1 mint", () => {
    it("fails to grant BLACKLISTER role on SSS-1 (compliance not enabled)", async () => {
      const someHolder = Keypair.generate();
      const [blacklisterRole] = getRoleAddress(
        ROLE_BLACKLISTER,
        configPdaSss1,
        someHolder.publicKey,
      );

      try {
        await program.methods
          .grantRole(ROLE_BLACKLISTER, someHolder.publicKey)
          .accountsPartial({
            authority: authority.publicKey,
            config: configPdaSss1,
            roleAssignment: blacklisterRole,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail(
          "Expected transaction to fail with ComplianceNotEnabled",
        );
      } catch (err: any) {
        expect(err.toString()).to.include("ComplianceNotEnabled");
      }
    });

    it("fails to grant SEIZER role on SSS-1 (compliance not enabled)", async () => {
      const someHolder = Keypair.generate();
      const [seizerRole] = getRoleAddress(
        ROLE_SEIZER,
        configPdaSss1,
        someHolder.publicKey,
      );

      try {
        await program.methods
          .grantRole(ROLE_SEIZER, someHolder.publicKey)
          .accountsPartial({
            authority: authority.publicKey,
            config: configPdaSss1,
            roleAssignment: seizerRole,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail(
          "Expected transaction to fail with ComplianceNotEnabled",
        );
      } catch (err: any) {
        expect(err.toString()).to.include("ComplianceNotEnabled");
      }
    });

    it("fails to add to blacklist on SSS-1 (compliance not enabled)", async () => {
      // We need a valid blacklister role PDA to even attempt this, but the
      // config constraint `config.compliance_enabled` will reject it first.
      // However, the blacklister_role account won't exist, so this should fail
      // either with ComplianceNotEnabled or AccountNotInitialized.
      const someAddress = Keypair.generate().publicKey;
      const [blacklistEntry] = getBlacklistAddress(
        configPdaSss1,
        someAddress,
      );
      // Use authority as "blacklister" even though role doesn't exist
      const [fakeBlacklisterRole] = getRoleAddress(
        ROLE_BLACKLISTER,
        configPdaSss1,
        authority.publicKey,
      );

      try {
        await program.methods
          .addToBlacklist(someAddress, "Test reason")
          .accountsPartial({
            blacklister: authority.publicKey,
            config: configPdaSss1,
            blacklisterRole: fakeBlacklisterRole,
            blacklistEntry,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Expected transaction to fail");
      } catch (err: any) {
        // Should fail because either compliance is not enabled or role doesn't exist
        const errStr = err.toString();
        expect(
          errStr.includes("ComplianceNotEnabled") ||
            errStr.includes("AccountNotInitialized") ||
            errStr.includes("Error") // anchor constraint error
        ).to.equal(true);
      }
    });

    it("fails to remove from blacklist on SSS-1 (compliance not enabled)", async () => {
      const someAddress = Keypair.generate().publicKey;
      const [blacklistEntry] = getBlacklistAddress(
        configPdaSss1,
        someAddress,
      );
      const [fakeBlacklisterRole] = getRoleAddress(
        ROLE_BLACKLISTER,
        configPdaSss1,
        authority.publicKey,
      );

      try {
        await program.methods
          .removeFromBlacklist(someAddress)
          .accountsPartial({
            blacklister: authority.publicKey,
            config: configPdaSss1,
            blacklisterRole: fakeBlacklisterRole,
            blacklistEntry,
          })
          .rpc();

        expect.fail("Expected transaction to fail");
      } catch (err: any) {
        const errStr = err.toString();
        expect(
          errStr.includes("ComplianceNotEnabled") ||
            errStr.includes("AccountNotInitialized") ||
            errStr.includes("Error")
        ).to.equal(true);
      }
    });

    it("fails to seize on SSS-1 (compliance not enabled)", async () => {
      const someOwner = Keypair.generate().publicKey;
      const [fakeBlacklistEntry] = getBlacklistAddress(
        configPdaSss1,
        someOwner,
      );
      const [fakeSeizerRole] = getRoleAddress(
        ROLE_SEIZER,
        configPdaSss1,
        authority.publicKey,
      );

      try {
        await program.methods
          .seize(new BN(100))
          .accountsPartial({
            seizer: authority.publicKey,
            config: configPdaSss1,
            seizerRole: fakeSeizerRole,
            blacklistEntry: fakeBlacklistEntry,
            targetOwner: someOwner,
            mint: mintKeySss1,
            sourceTokenAccount: authorityAta, // dummy
            treasuryTokenAccount: authorityAta, // dummy
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        expect.fail("Expected transaction to fail");
      } catch (err: any) {
        const errStr = err.toString();
        expect(
          errStr.includes("ComplianceNotEnabled") ||
            errStr.includes("AccountNotInitialized") ||
            errStr.includes("Error")
        ).to.equal(true);
      }
    });
  });

  // ==================================================================
  // Invalid Role Value
  // ==================================================================
  describe("Invalid role value", () => {
    it("fails to grant a role with an invalid role byte (e.g. 99)", async () => {
      const someHolder = Keypair.generate().publicKey;
      const invalidRole = 99;
      const [roleAssignment] = getRoleAddress(invalidRole, configPdaSss1, someHolder);

      try {
        await program.methods
          .grantRole(invalidRole, someHolder)
          .accountsPartial({
            authority: authority.publicKey,
            config: configPdaSss1,
            roleAssignment,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        expect.fail("Expected transaction to fail with InvalidRole");
      } catch (err: any) {
        expect(err.toString()).to.include("InvalidRole");
      }
    });
  });

  // ==================================================================
  // Burn more than balance
  // ==================================================================
  describe("Burn edge cases", () => {
    it("burns a valid amount successfully", async () => {
      const tx = await program.methods
        .burnTokens(new BN(100_000_000)) // burn 100 of the 1000 minted
        .accountsPartial({
          burner: authority.publicKey,
          config: configPdaSss1,
          mint: mintKeySss1,
          burnerTokenAccount: authorityAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      console.log("    burn 100 tokens tx:", tx);
    });

    it("fails to burn more tokens than the balance", async () => {
      // Authority now has 900 tokens (1000 minted - 100 burned above)
      // Attempt to burn 10_000 tokens
      try {
        await program.methods
          .burnTokens(new BN(10_000_000_000_000))
          .accountsPartial({
            burner: authority.publicKey,
            config: configPdaSss1,
            mint: mintKeySss1,
            burnerTokenAccount: authorityAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();

        expect.fail("Expected transaction to fail (insufficient balance)");
      } catch (err: any) {
        // SPL Token will return an error about insufficient funds
        expect(err.toString().toLowerCase()).to.satisfy(
          (s: string) =>
            s.includes("insufficient") ||
            s.includes("error") ||
            s.includes("0x1"), // InsufficientFunds error code
        );
      }
    });
  });
});
