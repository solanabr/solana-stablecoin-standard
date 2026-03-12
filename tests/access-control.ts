import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { SssCore } from "../target/types/sss_core";
import {
  PRESET_MINIMAL,
  StablecoinCtx,
  airdrop,
  initializeStablecoin,
  createAta,
  configureMinter,
  mintTokens,
  findMinterStatePda,
} from "./helpers";

describe("Access Control", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.sssCore as Program<SssCore>;
  const authority = (provider.wallet as anchor.Wallet).payer;

  let stablecoin: StablecoinCtx;
  let attacker: Keypair;

  before(async () => {
    stablecoin = await initializeStablecoin(program, provider, PRESET_MINIMAL);

    attacker = Keypair.generate();
    await airdrop(provider, attacker.publicKey);
  });

  // ── Unauthorized Role Operations ─────────────────────────────────────────

  describe("unauthorized callers are rejected", () => {
    it("non-master-minter cannot configure minter", async () => {
      const [minterStatePda] = findMinterStatePda(
        stablecoin.configPda,
        attacker.publicKey,
        program.programId
      );

      try {
        await program.methods
          .configureMinter(attacker.publicKey, new anchor.BN(1_000))
          .accountsPartial({
            masterMinter: attacker.publicKey,
            config: stablecoin.configPda,
            minterState: minterStatePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "NotMasterMinter");
      }
    });

    it("non-pauser cannot pause", async () => {
      try {
        await program.methods
          .pause()
          .accountsPartial({
            pauser: attacker.publicKey,
            config: stablecoin.configPda,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "NotPauser");
      }
    });

    it("non-pauser cannot unpause", async () => {
      // First pause
      await program.methods
        .pause()
        .accountsPartial({
          pauser: authority.publicKey,
          config: stablecoin.configPda,
        })
        .rpc();

      try {
        await program.methods
          .unpause()
          .accountsPartial({
            pauser: attacker.publicKey,
            config: stablecoin.configPda,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "NotPauser");
      }

      // Unpause for other tests
      await program.methods
        .unpause()
        .accountsPartial({
          pauser: authority.publicKey,
          config: stablecoin.configPda,
        })
        .rpc();
    });

    it("non-authority cannot update roles", async () => {
      try {
        await program.methods
          .updateRole({ pauser: {} }, attacker.publicKey)
          .accountsPartial({
            authority: attacker.publicKey,
            config: stablecoin.configPda,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "NotAuthority");
      }
    });

    it("non-authority cannot transfer authority", async () => {
      try {
        await program.methods
          .transferAuthority(attacker.publicKey)
          .accountsPartial({
            authority: attacker.publicKey,
            config: stablecoin.configPda,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "NotAuthority");
      }
    });

    it("non-authority/blacklister cannot freeze", async () => {
      const userAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        attacker.publicKey
      );

      try {
        await program.methods
          .freezeAccount()
          .accountsPartial({
            signer: attacker.publicKey,
            config: stablecoin.configPda,
            mint: stablecoin.mint.publicKey,
            targetTokenAccount: userAta,
            mintAuthority: stablecoin.mintAuthorityPda,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([attacker])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "Unauthorized");
      }
    });

    it("disabled minter cannot mint", async () => {
      const minter = Keypair.generate();
      await airdrop(provider, minter.publicKey);

      const minterStatePda = await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        new anchor.BN(1_000_000)
      );

      // Remove (disable) the minter
      await program.methods
        .removeMinter()
        .accountsPartial({
          masterMinter: authority.publicKey,
          config: stablecoin.configPda,
          minterState: minterStatePda,
        })
        .rpc();

      const minterAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        minter.publicKey
      );

      try {
        await mintTokens(
          program,
          stablecoin,
          minter,
          minterAta,
          new anchor.BN(1_000),
          minterStatePda
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "MinterDisabled");
      }
    });
  });

  // ── Seize rejects SSS-1 ──────────────────────────────────────────────────

  describe("SSS-2 features blocked on SSS-1", () => {
    it("seize is blocked on SSS-1 preset", async () => {
      const minter = Keypair.generate();
      await airdrop(provider, minter.publicKey);

      const minterStatePda = await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        new anchor.BN(1_000_000)
      );

      const sourceAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        minter.publicKey
      );

      await mintTokens(
        program,
        stablecoin,
        minter,
        sourceAta,
        new anchor.BN(1_000),
        minterStatePda
      );

      const destAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        authority.publicKey
      );

      try {
        await program.methods
          .seize(new anchor.BN(1_000))
          .accountsPartial({
            authority: authority.publicKey,
            config: stablecoin.configPda,
            mint: stablecoin.mint.publicKey,
            sourceTokenAccount: sourceAta,
            destinationTokenAccount: destAta,
            mintAuthority: stablecoin.mintAuthorityPda,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "PresetFeatureUnavailable");
      }
    });
  });

  // ── Blacklister Role (SSS-2 only) ────────────────────────────────────────

  describe("blacklister can freeze/thaw on SSS-2", () => {
    let sss2Stablecoin: StablecoinCtx;
    let blacklisterKeypair: Keypair;
    let targetAta: PublicKey;

    before(async () => {
      // Need SSS-2 stablecoin for blacklister role
      const hookProgram = anchor.workspace.sssHook;
      sss2Stablecoin = await initializeStablecoin(
        program,
        provider,
        2, // PRESET_COMPLIANT
        hookProgram.programId
      );

      blacklisterKeypair = Keypair.generate();
      await airdrop(provider, blacklisterKeypair.publicKey);

      // Assign blacklister role
      await program.methods
        .updateRole({ blacklister: {} }, blacklisterKeypair.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          config: sss2Stablecoin.configPda,
        })
        .rpc();

      // Create a target ATA (will be frozen by default on SSS-2)
      targetAta = await createAta(
        provider,
        sss2Stablecoin.mint.publicKey,
        Keypair.generate().publicKey
      );
    });

    it("blacklister can thaw an account on SSS-2", async () => {
      await program.methods
        .thawAccount()
        .accountsPartial({
          signer: blacklisterKeypair.publicKey,
          config: sss2Stablecoin.configPda,
          mint: sss2Stablecoin.mint.publicKey,
          targetTokenAccount: targetAta,
          mintAuthority: sss2Stablecoin.mintAuthorityPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([blacklisterKeypair])
        .rpc();
    });

    it("blacklister can freeze an account on SSS-2", async () => {
      await program.methods
        .freezeAccount()
        .accountsPartial({
          signer: blacklisterKeypair.publicKey,
          config: sss2Stablecoin.configPda,
          mint: sss2Stablecoin.mint.publicKey,
          targetTokenAccount: targetAta,
          mintAuthority: sss2Stablecoin.mintAuthorityPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([blacklisterKeypair])
        .rpc();
    });

    it("blacklister role assignment is blocked on SSS-1", async () => {
      // On SSS-1, the blacklister role cannot be reassigned because
      // update_role rejects blacklister changes for non-compliant presets.
      const sss1Blacklister = Keypair.generate();

      try {
        await program.methods
          .updateRole({ blacklister: {} }, sss1Blacklister.publicKey)
          .accountsPartial({
            authority: authority.publicKey,
            config: stablecoin.configPda,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "PresetFeatureUnavailable");
      }
    });
  });

  // ── Edge Cases ───────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("cannot pause when already paused", async () => {
      await program.methods
        .pause()
        .accountsPartial({
          pauser: authority.publicKey,
          config: stablecoin.configPda,
        })
        .rpc();

      try {
        await program.methods
          .pause()
          .accountsPartial({
            pauser: authority.publicKey,
            config: stablecoin.configPda,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "Paused");
      }

      await program.methods
        .unpause()
        .accountsPartial({
          pauser: authority.publicKey,
          config: stablecoin.configPda,
        })
        .rpc();
    });

    it("cannot unpause when not paused", async () => {
      try {
        await program.methods
          .unpause()
          .accountsPartial({
            pauser: authority.publicKey,
            config: stablecoin.configPda,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "NotPaused");
      }
    });

    it("transfer_authority rejects Pubkey::default() as new authority", async () => {
      try {
        await program.methods
          .transferAuthority(PublicKey.default)
          .accountsPartial({
            authority: authority.publicKey,
            config: stablecoin.configPda,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "InvalidAuthority");
      }
    });

    it("update_role rejects Pubkey::default() as new address", async () => {
      try {
        await program.methods
          .updateRole({ pauser: {} }, PublicKey.default)
          .accountsPartial({
            authority: authority.publicKey,
            config: stablecoin.configPda,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "InvalidAuthority");
      }
    });

    it("accept_authority fails with no pending authority", async () => {
      try {
        await program.methods
          .acceptAuthority()
          .accountsPartial({
            newAuthority: authority.publicKey,
            config: stablecoin.configPda,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "NoPendingAuthority");
      }
    });
  });
});
