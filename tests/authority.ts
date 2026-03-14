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

const ROLE_MINTER = 0x01;
const ROLE_PAUSER = 0x02;

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Authority: Two-step and single-step transfer", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssCore as Program;
  const authority = provider.wallet as anchor.Wallet;

  // Fresh mint for this suite
  const mintKeypair = Keypair.generate();
  const mintKey = mintKeypair.publicKey;
  const [configPda] = getConfigAddress(mintKey);

  // New authorities
  const newAuth = Keypair.generate();
  const newAuth2 = Keypair.generate();
  const randomUser = Keypair.generate();

  // ------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------
  before(async () => {
    // Fund all test wallets
    for (const kp of [newAuth, newAuth2, randomUser]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(sig);
    }

    // Initialize mint
    const input = {
      name: "Auth Test",
      symbol: "AUTH",
      uri: "https://example.com/auth.json",
      decimals: 6,
      complianceEnabled: false,
      enableAllowlist: false,
      supplyCap: null,
    };

    await program.methods
      .initialize(input)
      .accountsPartial({
        authority: authority.publicKey,
        mint: mintKey,
        config: configPda,
        transferHookProgram: null,
        systemProgram: SystemProgram.programId,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();
  });

  // ==================================================================
  // Two-step authority transfer
  // ==================================================================
  describe("Two-step authority transfer", () => {
    it("proposes new authority", async () => {
      await program.methods
        .proposeAuthority(newAuth.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.pendingAuthority.toBase58()).to.equal(newAuth.publicKey.toBase58());
    });

    it("rejects acceptance from wrong address", async () => {
      try {
        await program.methods
          .acceptAuthority()
          .accountsPartial({
            newAuthority: randomUser.publicKey,
            config: configPda,
          })
          .signers([randomUser])
          .rpc();
        expect.fail("Should have thrown Unauthorized");
      } catch (err: any) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });

    it("new authority accepts the transfer", async () => {
      await program.methods
        .acceptAuthority()
        .accountsPartial({
          newAuthority: newAuth.publicKey,
          config: configPda,
        })
        .signers([newAuth])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.authority.toBase58()).to.equal(newAuth.publicKey.toBase58());
      expect(config.pendingAuthority.toBase58()).to.equal(PublicKey.default.toBase58());
    });

    it("old authority cannot perform admin actions after transfer", async () => {
      try {
        await program.methods
          .pause()
          .accountsPartial({
            authority: authority.publicKey,
            config: configPda,
          })
          .rpc();
        expect.fail("Should have thrown Unauthorized");
      } catch (err: any) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });

    it("new authority CAN perform admin actions", async () => {
      await program.methods
        .pause()
        .accountsPartial({
          authority: newAuth.publicKey,
          config: configPda,
        })
        .signers([newAuth])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.paused).to.equal(true);

      // Unpause for subsequent tests
      await program.methods
        .unpause()
        .accountsPartial({
          authority: newAuth.publicKey,
          config: configPda,
        })
        .signers([newAuth])
        .rpc();
    });

    // Transfer back for next tests
    it("transfers authority back to original (for subsequent tests)", async () => {
      await program.methods
        .proposeAuthority(authority.publicKey)
        .accountsPartial({
          authority: newAuth.publicKey,
          config: configPda,
        })
        .signers([newAuth])
        .rpc();

      await program.methods
        .acceptAuthority()
        .accountsPartial({
          newAuthority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    });
  });

  // ==================================================================
  // Cancel authority transfer
  // ==================================================================
  describe("Cancel authority transfer", () => {
    it("proposes then cancels authority transfer", async () => {
      await program.methods
        .proposeAuthority(newAuth2.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      const before = await program.account.stablecoinConfig.fetch(configPda);
      expect(before.pendingAuthority.toBase58()).to.equal(newAuth2.publicKey.toBase58());

      await program.methods
        .cancelAuthorityTransfer()
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      const after = await program.account.stablecoinConfig.fetch(configPda);
      expect(after.pendingAuthority.toBase58()).to.equal(PublicKey.default.toBase58());
    });

    it("rejects cancel when no proposal is pending", async () => {
      try {
        await program.methods
          .cancelAuthorityTransfer()
          .accountsPartial({
            authority: authority.publicKey,
            config: configPda,
          })
          .rpc();
        expect.fail("Should have thrown NoPendingAuthority");
      } catch (err: any) {
        expect(err.toString()).to.include("NoPendingAuthority");
      }
    });

    it("rejects cancel from non-authority", async () => {
      // First create a proposal
      await program.methods
        .proposeAuthority(newAuth2.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      try {
        await program.methods
          .cancelAuthorityTransfer()
          .accountsPartial({
            authority: randomUser.publicKey,
            config: configPda,
          })
          .signers([randomUser])
          .rpc();
        expect.fail("Should have thrown Unauthorized");
      } catch (err: any) {
        expect(err.toString()).to.include("Unauthorized");
      }

      // Clean up
      await program.methods
        .cancelAuthorityTransfer()
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();
    });

    it("after cancel, proposed authority cannot accept", async () => {
      // Propose, cancel, then try to accept
      await program.methods
        .proposeAuthority(newAuth2.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      await program.methods
        .cancelAuthorityTransfer()
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      try {
        await program.methods
          .acceptAuthority()
          .accountsPartial({
            newAuthority: newAuth2.publicKey,
            config: configPda,
          })
          .signers([newAuth2])
          .rpc();
        expect.fail("Should have thrown — proposal was cancelled");
      } catch (err: any) {
        expect(err.toString()).to.satisfy(
          (msg: string) =>
            msg.includes("NoPendingAuthority") ||
            msg.includes("Unauthorized"),
        );
      }
    });
  });

  // ==================================================================
  // Single-step authority transfer
  // ==================================================================
  describe("Single-step (immediate) authority transfer", () => {
    it("transfers authority immediately via transferAuthority", async () => {
      await program.methods
        .transferAuthority(newAuth.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.authority.toBase58()).to.equal(newAuth.publicKey.toBase58());
      // Pending authority should be cleared
      expect(config.pendingAuthority.toBase58()).to.equal(PublicKey.default.toBase58());
    });

    it("old authority cannot act after single-step transfer", async () => {
      try {
        await program.methods
          .pause()
          .accountsPartial({
            authority: authority.publicKey,
            config: configPda,
          })
          .rpc();
        expect.fail("Should have thrown Unauthorized");
      } catch (err: any) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });

    it("new authority can act after single-step transfer", async () => {
      // Grant a role to prove new authority works
      const [pauserRole] = getRoleAddress(ROLE_PAUSER, configPda, newAuth.publicKey);

      await program.methods
        .grantRole(ROLE_PAUSER, newAuth.publicKey)
        .accountsPartial({
          authority: newAuth.publicKey,
          config: configPda,
          roleAssignment: pauserRole,
          systemProgram: SystemProgram.programId,
        })
        .signers([newAuth])
        .rpc();

      const role = await program.account.roleAssignment.fetch(pauserRole);
      expect(role.role).to.equal(ROLE_PAUSER);
      expect(role.active).to.equal(true);
    });

    it("rejects single-step transfer from non-authority", async () => {
      try {
        await program.methods
          .transferAuthority(randomUser.publicKey)
          .accountsPartial({
            authority: randomUser.publicKey,
            config: configPda,
          })
          .signers([randomUser])
          .rpc();
        expect.fail("Should have thrown Unauthorized");
      } catch (err: any) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });

    // Transfer back for cleanup
    it("transfers back to original authority", async () => {
      await program.methods
        .transferAuthority(authority.publicKey)
        .accountsPartial({
          authority: newAuth.publicKey,
          config: configPda,
        })
        .signers([newAuth])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(configPda);
      expect(config.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    });
  });

  // ==================================================================
  // Interaction: single-step clears pending authority
  // ==================================================================
  describe("Single-step clears pending proposal", () => {
    it("propose two-step, then single-step overrides it", async () => {
      // Propose a two-step transfer to newAuth2
      await program.methods
        .proposeAuthority(newAuth2.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      const before = await program.account.stablecoinConfig.fetch(configPda);
      expect(before.pendingAuthority.toBase58()).to.equal(newAuth2.publicKey.toBase58());

      // Now do a single-step transfer to newAuth (overrides the proposal)
      await program.methods
        .transferAuthority(newAuth.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();

      const after = await program.account.stablecoinConfig.fetch(configPda);
      expect(after.authority.toBase58()).to.equal(newAuth.publicKey.toBase58());
      // Pending should be cleared
      expect(after.pendingAuthority.toBase58()).to.equal(PublicKey.default.toBase58());

      // newAuth2 cannot accept the now-cancelled proposal
      try {
        await program.methods
          .acceptAuthority()
          .accountsPartial({
            newAuthority: newAuth2.publicKey,
            config: configPda,
          })
          .signers([newAuth2])
          .rpc();
        expect.fail("Should have thrown — proposal was overridden");
      } catch (err: any) {
        expect(err.toString()).to.satisfy(
          (msg: string) =>
            msg.includes("NoPendingAuthority") ||
            msg.includes("Unauthorized"),
        );
      }

      // Restore authority
      await program.methods
        .transferAuthority(authority.publicKey)
        .accountsPartial({
          authority: newAuth.publicKey,
          config: configPda,
        })
        .signers([newAuth])
        .rpc();
    });
  });
});
