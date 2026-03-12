import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAccount } from "@solana/spl-token";
import { SssCore } from "../target/types/sss_core";
import {
  PRESET_MINIMAL,
  PRESET_COMPLIANT,
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

describe("Edge Cases", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.sssCore as Program<SssCore>;
  const authority = (provider.wallet as anchor.Wallet).payer;

  let stablecoin: StablecoinCtx;

  before(async () => {
    stablecoin = await initializeStablecoin(program, provider, PRESET_MINIMAL);
  });

  // ── Zero-Amount Operations ──────────────────────────────────────────────

  describe("zero-amount operations", () => {
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

      // Mint some tokens so we can test burn
      await mintTokens(
        program,
        stablecoin,
        minter,
        minterAta,
        new anchor.BN(100_000_000),
        minterStatePda
      );
    });

    it("mint zero amount fails with ZeroAmount", async () => {
      try {
        await mintTokens(
          program,
          stablecoin,
          minter,
          minterAta,
          new anchor.BN(0),
          minterStatePda
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "ZeroAmount");
      }
    });

    it("burn zero amount fails with ZeroAmount", async () => {
      try {
        await program.methods
          .burnTokens(new anchor.BN(0))
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
        assert.include(e.toString(), "ZeroAmount");
      }
    });

    it("seize zero amount fails with ZeroAmount (SSS-2)", async () => {
      const hookProgram = anchor.workspace.sssHook;
      const sss2 = await initializeStablecoin(
        program,
        provider,
        PRESET_COMPLIANT,
        hookProgram.programId
      );

      const sourceAta = await createAta(
        provider,
        sss2.mint.publicKey,
        Keypair.generate().publicKey
      );
      const destAta = await createAta(
        provider,
        sss2.mint.publicKey,
        authority.publicKey
      );

      try {
        await program.methods
          .seize(new anchor.BN(0))
          .accountsPartial({
            authority: authority.publicKey,
            config: sss2.configPda,
            mint: sss2.mint.publicKey,
            sourceTokenAccount: sourceAta,
            destinationTokenAccount: destAta,
            mintAuthority: sss2.mintAuthorityPda,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "ZeroAmount");
      }
    });
  });

  // ── Quota Boundary Conditions ───────────────────────────────────────────

  describe("quota boundary conditions", () => {
    let minter: Keypair;
    let minterStatePda: PublicKey;
    let minterAta: PublicKey;
    const quota = new anchor.BN(500_000_000); // 500 tokens

    before(async () => {
      // Fresh stablecoin for clean quota tracking
      stablecoin = await initializeStablecoin(program, provider, PRESET_MINIMAL);

      minter = Keypair.generate();
      await airdrop(provider, minter.publicKey);

      minterStatePda = await configureMinter(
        program,
        stablecoin,
        minter.publicKey,
        quota
      );

      minterAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        minter.publicKey
      );
    });

    it("mint exactly at quota limit succeeds", async () => {
      await mintTokens(
        program,
        stablecoin,
        minter,
        minterAta,
        quota,
        minterStatePda
      );

      const state = await program.account.minterState.fetch(minterStatePda);
      assert.ok(state.mintedAmount.eq(quota));

      const account = await getAccount(
        provider.connection,
        minterAta,
        undefined,
        TOKEN_2022_PROGRAM_ID
      );
      assert.equal(account.amount.toString(), quota.toString());
    });

    it("mint one over quota limit fails with QuotaExceeded", async () => {
      try {
        await mintTokens(
          program,
          stablecoin,
          minter,
          minterAta,
          new anchor.BN(1), // just 1 lamport over
          minterStatePda
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "QuotaExceeded");
      }
    });

    it("configure minter with zero quota succeeds", async () => {
      const zeroMinter = Keypair.generate();
      await airdrop(provider, zeroMinter.publicKey);

      const zeroMinterStatePda = await configureMinter(
        program,
        stablecoin,
        zeroMinter.publicKey,
        new anchor.BN(0)
      );

      const state = await program.account.minterState.fetch(zeroMinterStatePda);
      assert.ok(state.minter.equals(zeroMinter.publicKey));
      assert.ok(state.quota.eqn(0));
      assert.equal(state.enabled, true);

      // Zero-quota minter cannot mint any amount
      const zeroMinterAta = await createAta(
        provider,
        stablecoin.mint.publicKey,
        zeroMinter.publicKey
      );

      try {
        await mintTokens(
          program,
          stablecoin,
          zeroMinter,
          zeroMinterAta,
          new anchor.BN(1),
          zeroMinterStatePda
        );
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "QuotaExceeded");
      }
    });
  });

  // ── Authority Transfer Edge Cases ───────────────────────────────────────

  describe("authority transfer edge cases", () => {
    before(async () => {
      stablecoin = await initializeStablecoin(program, provider, PRESET_MINIMAL);
    });

    it("transfer authority to zero address fails with InvalidAuthority", async () => {
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

    it("update role to zero address fails with InvalidAuthority", async () => {
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

    it("accept authority when no pending fails with NoPendingAuthority", async () => {
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

  // ── Metadata Length Boundaries ──────────────────────────────────────────

  describe("metadata length boundaries", () => {
    it("name at max length (32 chars) succeeds", async () => {
      const mint = Keypair.generate();
      const [configPda] = findConfigPda(mint.publicKey, program.programId);
      const [mintAuthorityPda] = findMintAuthorityPda(
        mint.publicKey,
        program.programId
      );

      await program.methods
        .initialize({
          preset: PRESET_MINIMAL,
          name: "A".repeat(32),
          symbol: "TST",
          uri: "https://example.com",
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

      // Verify it was actually created
      const config = await program.account.stablecoinConfig.fetch(configPda);
      assert.ok(config.mint.equals(mint.publicKey));
    });

    it("name over max length (33 chars) fails with NameTooLong", async () => {
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
            name: "A".repeat(33),
            symbol: "TST",
            uri: "https://example.com",
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
        assert.include(e.toString(), "NameTooLong");
      }
    });

    it("symbol at max length (10 chars) succeeds", async () => {
      const mint = Keypair.generate();
      const [configPda] = findConfigPda(mint.publicKey, program.programId);
      const [mintAuthorityPda] = findMintAuthorityPda(
        mint.publicKey,
        program.programId
      );

      await program.methods
        .initialize({
          preset: PRESET_MINIMAL,
          name: "Test",
          symbol: "S".repeat(10),
          uri: "https://example.com",
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

      const config = await program.account.stablecoinConfig.fetch(configPda);
      assert.ok(config.mint.equals(mint.publicKey));
    });

    it("symbol over max length (11 chars) fails with SymbolTooLong", async () => {
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
            name: "Test",
            symbol: "S".repeat(11),
            uri: "https://example.com",
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
        assert.include(e.toString(), "SymbolTooLong");
      }
    });

    it("URI at max length (200 chars) succeeds", async () => {
      const mint = Keypair.generate();
      const [configPda] = findConfigPda(mint.publicKey, program.programId);
      const [mintAuthorityPda] = findMintAuthorityPda(
        mint.publicKey,
        program.programId
      );

      await program.methods
        .initialize({
          preset: PRESET_MINIMAL,
          name: "Test",
          symbol: "TST",
          uri: "U".repeat(200),
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

      const config = await program.account.stablecoinConfig.fetch(configPda);
      assert.ok(config.mint.equals(mint.publicKey));
    });

    it("URI over max length (201 chars) fails with UriTooLong", async () => {
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
            name: "Test",
            symbol: "TST",
            uri: "U".repeat(201),
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
        assert.include(e.toString(), "UriTooLong");
      }
    });
  });

  // ── Decimals Boundary ───────────────────────────────────────────────────

  describe("decimals boundary", () => {
    it("decimals at max (9) succeeds", async () => {
      const mint = Keypair.generate();
      const [configPda] = findConfigPda(mint.publicKey, program.programId);
      const [mintAuthorityPda] = findMintAuthorityPda(
        mint.publicKey,
        program.programId
      );

      await program.methods
        .initialize({
          preset: PRESET_MINIMAL,
          name: "NineDecimals",
          symbol: "ND",
          uri: "",
          decimals: 9,
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

      const config = await program.account.stablecoinConfig.fetch(configPda);
      assert.ok(config.mint.equals(mint.publicKey));
    });

    it("decimals over max (10) fails with InvalidDecimals", async () => {
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
            name: "TenDecimals",
            symbol: "TD",
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

  // ── Double Pause / Unpause ──────────────────────────────────────────────

  describe("double pause / unpause", () => {
    before(async () => {
      stablecoin = await initializeStablecoin(program, provider, PRESET_MINIMAL);
    });

    it("double pause fails with Paused", async () => {
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

      // Cleanup: unpause
      await program.methods
        .unpause()
        .accountsPartial({
          pauser: authority.publicKey,
          config: stablecoin.configPda,
        })
        .rpc();
    });

    it("double unpause fails with NotPaused", async () => {
      // Contract is already unpaused from cleanup above
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
  });

  // ── Burn More Than Balance ──────────────────────────────────────────────

  describe("burn more than balance", () => {
    let minter: Keypair;
    let minterStatePda: PublicKey;
    let minterAta: PublicKey;

    before(async () => {
      stablecoin = await initializeStablecoin(program, provider, PRESET_MINIMAL);

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

      // Mint 100 tokens
      await mintTokens(
        program,
        stablecoin,
        minter,
        minterAta,
        new anchor.BN(100_000_000),
        minterStatePda
      );
    });

    it("burn more than balance fails (Token-2022 insufficient funds)", async () => {
      try {
        await program.methods
          .burnTokens(new anchor.BN(200_000_000)) // try to burn 200, only have 100
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
        // Token-2022 InsufficientFunds error (code 1 = 0x1)
        const errStr = e.toString();
        assert.ok(
          errStr.includes("0x1") || errStr.includes("insufficient"),
          `Expected insufficient funds error, got: ${errStr}`
        );
      }
    });
  });
});
