import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAccount,
} from "@solana/spl-token";
import { SssCore } from "../target/types/sss_core";
import {
  PRESET_MINIMAL,
  StablecoinCtx,
  airdrop,
  initializeStablecoin,
  createAta,
  configureMinter,
  mintTokens,
  findConfigPda,
  findMintAuthorityPda,
  findMinterStatePda,
} from "./helpers";

describe("SSS-1 (Minimal Preset)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.sssCore as Program<SssCore>;
  const authority = (provider.wallet as anchor.Wallet).payer;

  let stablecoin: StablecoinCtx;

  // ── Initialization ───────────────────────────────────────────────────────

  describe("initialize", () => {
    it("initializes an SSS-1 stablecoin", async () => {
      stablecoin = await initializeStablecoin(program, provider, PRESET_MINIMAL);

      const config = await program.account.stablecoinConfig.fetch(
        stablecoin.configPda
      );

      assert.equal(config.preset, PRESET_MINIMAL);
      assert.ok(config.mint.equals(stablecoin.mint.publicKey));
      assert.ok(config.authority.equals(authority.publicKey));
      assert.ok(config.masterMinter.equals(authority.publicKey));
      assert.ok(config.pauser.equals(authority.publicKey));
      assert.ok(config.blacklister.equals(authority.publicKey));
      assert.equal(config.paused, false);
      assert.ok(config.totalMinted.eqn(0));
      assert.ok(config.totalBurned.eqn(0));
      assert.ok(config.pendingAuthority.equals(PublicKey.default));
    });

    it("rejects invalid preset (0)", async () => {
      const mint = Keypair.generate();
      const [configPda] = findConfigPda(mint.publicKey, program.programId);
      const [mintAuthorityPda] = findMintAuthorityPda(
        mint.publicKey,
        program.programId
      );

      try {
        await program.methods
          .initialize({
            preset: 0,
            name: "Bad",
            symbol: "BAD",
            uri: "",
            decimals: 6,
          })
          .accountsPartial({
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
        assert.include(e.toString(), "InvalidPreset");
      }
    });

    it("rejects decimals > 9", async () => {
      const mint = Keypair.generate();
      const [configPda] = findConfigPda(mint.publicKey, program.programId);
      const [mintAuthorityPda] = findMintAuthorityPda(
        mint.publicKey,
        program.programId
      );

      try {
        await program.methods
          .initialize({
            preset: PRESET_MINIMAL,
            name: "Bad",
            symbol: "BAD",
            uri: "",
            decimals: 10,
          })
          .accountsPartial({
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
        assert.include(e.toString(), "InvalidDecimals");
      }
    });
  });

  // ── Minter Management ───────────────────────────────────────────────────

  describe("configure_minter / remove_minter", () => {
    let minter: Keypair;
    let minterStatePda: PublicKey;

    before(async () => {
      minter = Keypair.generate();
      await airdrop(provider, minter.publicKey);
    });

    it("configures a minter with quota", async () => {
      minterStatePda = await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        new anchor.BN(1_000_000_000) // 1000 TUSD (6 decimals)
      );

      const state = await program.account.minterState.fetch(minterStatePda);
      assert.ok(state.minter.equals(minter.publicKey));
      assert.ok(state.quota.eq(new anchor.BN(1_000_000_000)));
      assert.ok(state.mintedAmount.eqn(0));
      assert.equal(state.enabled, true);
    });

    it("updates minter quota", async () => {
      await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        new anchor.BN(2_000_000_000)
      );

      const state = await program.account.minterState.fetch(minterStatePda);
      assert.ok(state.quota.eq(new anchor.BN(2_000_000_000)));
    });

    it("removes a minter", async () => {
      await program.methods
        .removeMinter()
        .accountsPartial({
          masterMinter: authority.publicKey,
          config: stablecoin.configPda,
          minterState: minterStatePda,
        })
        .rpc();

      const state = await program.account.minterState.fetch(minterStatePda);
      assert.equal(state.enabled, false);
    });

    it("re-enables a minter via configure_minter", async () => {
      await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        new anchor.BN(500_000_000)
      );

      const state = await program.account.minterState.fetch(minterStatePda);
      assert.equal(state.enabled, true);
      assert.ok(state.quota.eq(new anchor.BN(500_000_000)));
    });
  });

  // ── Mint & Burn ──────────────────────────────────────────────────────────

  describe("mint / burn", () => {
    let minter: Keypair;
    let minterStatePda: PublicKey;
    let userAta: PublicKey;

    before(async () => {
      minter = Keypair.generate();
      await airdrop(provider, minter.publicKey);

      minterStatePda = await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        new anchor.BN(1_000_000_000)
      );

      // Create ATA for minter to receive minted tokens
      userAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        minter.publicKey
      );
    });

    it("mints tokens to a destination", async () => {
      const amount = new anchor.BN(100_000_000); // 100 TUSD

      await mintTokens(
        program,
        stablecoin,
        minter,
        userAta,
        amount,
        minterStatePda
      );

      const state = await program.account.minterState.fetch(minterStatePda);
      assert.ok(state.mintedAmount.eq(amount));

      const config = await program.account.stablecoinConfig.fetch(
        stablecoin.configPda
      );
      assert.ok(config.totalMinted.eq(amount));
    });

    it("rejects minting zero amount", async () => {
      try {
        await mintTokens(
          program,
          stablecoin,
          minter,
          userAta,
          new anchor.BN(0),
          minterStatePda
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "ZeroAmount");
      }
    });

    it("rejects minting over quota", async () => {
      try {
        await mintTokens(
          program,
          stablecoin,
          minter,
          userAta,
          new anchor.BN(1_000_000_000), // full quota, but 100M already minted
          minterStatePda
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "QuotaExceeded");
      }
    });

    it("burns tokens", async () => {
      const burnAmount = new anchor.BN(50_000_000); // 50 TUSD

      await program.methods
        .burnTokens(burnAmount)
        .accountsPartial({
          burner: minter.publicKey,
          config: stablecoin.configPda,
          mint: stablecoin.mint.publicKey,
          tokenAccount: userAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(
        stablecoin.configPda
      );
      assert.ok(config.totalBurned.eq(burnAmount));
    });

    it("burning does NOT restore quota", async () => {
      const state = await program.account.minterState.fetch(minterStatePda);
      // minted_amount should still be 100M, not reduced by the 50M burn
      assert.ok(state.mintedAmount.eq(new anchor.BN(100_000_000)));
    });
  });

  // ── Pause / Unpause ──────────────────────────────────────────────────────

  describe("pause / unpause", () => {
    let minter: Keypair;
    let minterStatePda: PublicKey;
    let minterAta: PublicKey;

    before(async () => {
      minter = Keypair.generate();
      await airdrop(provider, minter.publicKey);

      minterStatePda = await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        new anchor.BN(1_000_000_000)
      );

      minterAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        minter.publicKey
      );
    });

    it("pauses the stablecoin", async () => {
      await program.methods
        .pause()
        .accountsPartial({
          pauser: authority.publicKey,
          config: stablecoin.configPda,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(
        stablecoin.configPda
      );
      assert.equal(config.paused, true);
    });

    it("blocks minting when paused", async () => {
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
        assert.include(e.toString(), "Paused");
      }
    });

    it("blocks burning when paused", async () => {
      try {
        await program.methods
          .burnTokens(new anchor.BN(1_000))
          .accountsPartial({
            burner: minter.publicKey,
            config: stablecoin.configPda,
            mint: stablecoin.mint.publicKey,
            tokenAccount: minterAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "Paused");
      }
    });

    it("unpauses the stablecoin", async () => {
      await program.methods
        .unpause()
        .accountsPartial({
          pauser: authority.publicKey,
          config: stablecoin.configPda,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(
        stablecoin.configPda
      );
      assert.equal(config.paused, false);
    });

    it("minting works again after unpause", async () => {
      await mintTokens(
        program,
        stablecoin,
        minter,
        minterAta,
        new anchor.BN(1_000),
        minterStatePda
      );
    });
  });

  // ── Role Management ──────────────────────────────────────────────────────

  describe("update_role", () => {
    let newPauser: Keypair;

    before(() => {
      newPauser = Keypair.generate();
    });

    it("updates the pauser role", async () => {
      await program.methods
        .updateRole({ pauser: {} }, newPauser.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          config: stablecoin.configPda,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(
        stablecoin.configPda
      );
      assert.ok(config.pauser.equals(newPauser.publicKey));
    });

    it("old pauser can no longer pause", async () => {
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
        assert.include(e.toString(), "NotPauser");
      }
    });

    it("restores original pauser for other tests", async () => {
      await program.methods
        .updateRole({ pauser: {} }, authority.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          config: stablecoin.configPda,
        })
        .rpc();
    });
  });

  // ── Authority Transfer ───────────────────────────────────────────────────

  describe("transfer_authority / accept_authority", () => {
    let newAuthority: Keypair;

    before(async () => {
      newAuthority = Keypair.generate();
      await airdrop(provider, newAuthority.publicKey);
    });

    it("initiates authority transfer", async () => {
      await program.methods
        .transferAuthority(newAuthority.publicKey)
        .accountsPartial({
          authority: authority.publicKey,
          config: stablecoin.configPda,
        })
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(
        stablecoin.configPda
      );
      assert.ok(config.pendingAuthority.equals(newAuthority.publicKey));
    });

    it("rejects accept from wrong signer", async () => {
      const randomKp = Keypair.generate();
      await airdrop(provider, randomKp.publicKey);

      try {
        await program.methods
          .acceptAuthority()
          .accountsPartial({
            newAuthority: randomKp.publicKey,
            config: stablecoin.configPda,
          })
          .signers([randomKp])
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "NotPendingAuthority");
      }
    });

    it("new authority accepts transfer", async () => {
      await program.methods
        .acceptAuthority()
        .accountsPartial({
          newAuthority: newAuthority.publicKey,
          config: stablecoin.configPda,
        })
        .signers([newAuthority])
        .rpc();

      const config = await program.account.stablecoinConfig.fetch(
        stablecoin.configPda
      );
      assert.ok(config.authority.equals(newAuthority.publicKey));
      assert.ok(config.pendingAuthority.equals(PublicKey.default));
    });

    it("transfers authority back for remaining tests", async () => {
      await program.methods
        .transferAuthority(authority.publicKey)
        .accountsPartial({
          authority: newAuthority.publicKey,
          config: stablecoin.configPda,
        })
        .signers([newAuthority])
        .rpc();

      await program.methods
        .acceptAuthority()
        .accountsPartial({
          newAuthority: authority.publicKey,
          config: stablecoin.configPda,
        })
        .rpc();
    });
  });

  // ── Freeze / Thaw ────────────────────────────────────────────────────────

  describe("freeze / thaw", () => {
    let user: Keypair;
    let userAta: PublicKey;
    let minter: Keypair;
    let minterStatePda: PublicKey;

    before(async () => {
      user = Keypair.generate();
      minter = Keypair.generate();
      await airdrop(provider, user.publicKey);
      await airdrop(provider, minter.publicKey);

      userAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        user.publicKey
      );

      minterStatePda = await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        new anchor.BN(1_000_000_000)
      );

      // Mint some tokens to user
      await mintTokens(
        program,
        stablecoin,
        minter,
        userAta,
        new anchor.BN(10_000_000),
        minterStatePda
      );
    });

    it("freezes a token account", async () => {
      await program.methods
        .freezeAccount()
        .accountsPartial({
          signer: authority.publicKey,
          config: stablecoin.configPda,
          mint: stablecoin.mint.publicKey,
          targetTokenAccount: userAta,
          mintAuthority: stablecoin.mintAuthorityPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    });

    it("thaws a token account", async () => {
      await program.methods
        .thawAccount()
        .accountsPartial({
          signer: authority.publicKey,
          config: stablecoin.configPda,
          mint: stablecoin.mint.publicKey,
          targetTokenAccount: userAta,
          mintAuthority: stablecoin.mintAuthorityPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
    });

    it("frozen account rejects outgoing transfers", async () => {
      // Create a recipient to transfer to
      const recipient = Keypair.generate();
      const recipientAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        recipient.publicKey
      );

      // Freeze the user's account
      await program.methods
        .freezeAccount()
        .accountsPartial({
          signer: authority.publicKey,
          config: stablecoin.configPda,
          mint: stablecoin.mint.publicKey,
          targetTokenAccount: userAta,
          mintAuthority: stablecoin.mintAuthorityPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Attempt transfer from frozen account — should fail
      const transferIx = createTransferCheckedInstruction(
        userAta,
        stablecoin.mint.publicKey,
        recipientAta,
        user.publicKey,
        1_000_000n, // 1 token
        6,
        [],
        TOKEN_2022_PROGRAM_ID
      );

      const tx = new anchor.web3.Transaction().add(transferIx);
      try {
        await provider.sendAndConfirm(tx, [user]);
        assert.fail("Transfer from frozen account should have failed");
      } catch (e: any) {
        // Token-2022 AccountFrozen error (code 17 = 0x11)
        assert.include(e.toString(), "0x11");
      }

      // Thaw the account
      await program.methods
        .thawAccount()
        .accountsPartial({
          signer: authority.publicKey,
          config: stablecoin.configPda,
          mint: stablecoin.mint.publicKey,
          targetTokenAccount: userAta,
          mintAuthority: stablecoin.mintAuthorityPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Now transfer should succeed
      const transferIx2 = createTransferCheckedInstruction(
        userAta,
        stablecoin.mint.publicKey,
        recipientAta,
        user.publicKey,
        1_000_000n,
        6,
        [],
        TOKEN_2022_PROGRAM_ID
      );

      const tx2 = new anchor.web3.Transaction().add(transferIx2);
      await provider.sendAndConfirm(tx2, [user]);

      // Verify recipient received the tokens
      const destAccount = await getAccount(
        provider.connection,
        recipientAta,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      assert.equal(destAccount.amount.toString(), "1000000");
    });

    it("freeze works even when paused (emergency)", async () => {
      await program.methods
        .pause()
        .accountsPartial({
          pauser: authority.publicKey,
          config: stablecoin.configPda,
        })
        .rpc();

      await program.methods
        .freezeAccount()
        .accountsPartial({
          signer: authority.publicKey,
          config: stablecoin.configPda,
          mint: stablecoin.mint.publicKey,
          targetTokenAccount: userAta,
          mintAuthority: stablecoin.mintAuthorityPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // Thaw and unpause
      await program.methods
        .thawAccount()
        .accountsPartial({
          signer: authority.publicKey,
          config: stablecoin.configPda,
          mint: stablecoin.mint.publicKey,
          targetTokenAccount: userAta,
          mintAuthority: stablecoin.mintAuthorityPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      await program.methods
        .unpause()
        .accountsPartial({
          pauser: authority.publicKey,
          config: stablecoin.configPda,
        })
        .rpc();
    });
  });
});
