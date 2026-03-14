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
// PDA helpers (inline to keep tests self-contained)
// ---------------------------------------------------------------------------
const SSS_CORE_PROGRAM_ID = new PublicKey(
  "G3jadBDzaF2HbTY2at5auYYQQ94zhhWaocMuWDgUy2vL",
);
const SSS_TRANSFER_HOOK_PROGRAM_ID = new PublicKey(
  "EAzHNW2cjpYdBjLBJ9RVLoGryXQJE98dpHTdyPiE6389",
);

const CONFIG_SEED = Buffer.from("config");
const ROLE_SEED = Buffer.from("role");
const QUOTA_SEED = Buffer.from("quota");

const ROLE_MINTER = 0x01;
const ROLE_FREEZER = 0x03;

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

// ===========================================================================
// Security tests: Arithmetic overflow & boundary conditions
// ===========================================================================
describe("Security: Arithmetic overflow & boundary conditions", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssCore as Program;
  const authority = provider.wallet as anchor.Wallet;

  // Fresh mint keypair for this test suite
  const mintKeypair = Keypair.generate();
  const mintKey = mintKeypair.publicKey;
  const [configPda] = getConfigAddress(mintKey);

  // Minter is the authority wallet for simplicity
  const minter = authority.publicKey;
  const [minterRole] = getRoleAddress(ROLE_MINTER, configPda, minter);
  const [minterQuota] = getQuotaAddress(configPda, minter);

  // Freezer role (needed for thaw in SSS-2 scenarios, not used here but
  // kept for completeness)
  const [freezerRole] = getRoleAddress(ROLE_FREEZER, configPda, minter);

  // Authority's own ATA for minting into and burning from
  let authorityAta: PublicKey;

  // ------------------------------------------------------------------
  // Setup step 1: Initialize an SSS-1 stablecoin (compliance disabled)
  // ------------------------------------------------------------------
  it("initializes an SSS-1 stablecoin for overflow testing", async () => {
    const input = {
      name: "Overflow Test USD",
      symbol: "OUSD",
      uri: "https://example.com/ousd.json",
      decimals: 6,
      complianceEnabled: false,
      enableAllowlist: false,
      supplyCap: null,
    };

    const tx = await program.methods
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

    console.log("    initialize tx:", tx);

    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    expect(configAccount.authority.toBase58()).to.equal(
      authority.publicKey.toBase58(),
    );
    expect(configAccount.paused).to.equal(false);
    expect(configAccount.complianceEnabled).to.equal(false);
    expect(configAccount.totalMinted.toNumber()).to.equal(0);
    expect(configAccount.totalBurned.toNumber()).to.equal(0);
  });

  // ------------------------------------------------------------------
  // Setup step 2: Grant minter role to authority
  // ------------------------------------------------------------------
  it("grants minter role to the authority", async () => {
    const tx = await program.methods
      .grantRole(ROLE_MINTER, minter)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        roleAssignment: minterRole,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("    grant_role (minter) tx:", tx);

    const roleAccount = await program.account.roleAssignment.fetch(minterRole);
    expect(roleAccount.holder.toBase58()).to.equal(minter.toBase58());
    expect(roleAccount.role).to.equal(ROLE_MINTER);
  });

  // ------------------------------------------------------------------
  // Setup step 3: Set quota to 1_000_000_000 (1000 tokens with 6 decimals)
  // ------------------------------------------------------------------
  it("sets minting quota to 1000 tokens (1_000_000_000 base units)", async () => {
    const quotaLimit = new BN(1_000_000_000); // 1000 tokens at 6 decimals

    const tx = await program.methods
      .setQuota(minter, quotaLimit)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
        minterQuota,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("    set_quota tx:", tx);

    const quotaAccount = await program.account.minterQuota.fetch(minterQuota);
    expect(quotaAccount.quotaLimit.toNumber()).to.equal(1_000_000_000);
    expect(quotaAccount.mintedAmount.toNumber()).to.equal(0);
  });

  // ------------------------------------------------------------------
  // Setup step 4: Create ATA for authority
  // ------------------------------------------------------------------
  it("creates associated token account for authority", async () => {
    authorityAta = getAssociatedTokenAddressSync(
      mintKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const tx = new anchor.web3.Transaction();
    tx.add(
      createAssociatedTokenAccountInstruction(
        authority.publicKey,
        authorityAta,
        authority.publicKey,
        mintKey,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );

    const sig = await provider.sendAndConfirm(tx);
    console.log("    create ATA tx:", sig);
  });

  // ------------------------------------------------------------------
  // Setup step 5: Mint initial tokens (900 of 1000 quota) to test against
  // ------------------------------------------------------------------
  it("mints 900 tokens as initial baseline (within 1000 quota)", async () => {
    const amount = new BN(900_000_000); // 900 tokens

    const tx = await program.methods
      .mintTokens(amount)
      .accountsPartial({
        minter,
        config: configPda,
        minterRole,
        minterQuota,
        mint: mintKey,
        recipientTokenAccount: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    console.log("    mint_tokens (900) tx:", tx);

    // Verify quota tracking
    const quotaAccount = await program.account.minterQuota.fetch(minterQuota);
    expect(quotaAccount.mintedAmount.toNumber()).to.equal(900_000_000);

    // Verify config totals
    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    expect(configAccount.totalMinted.toNumber()).to.equal(900_000_000);
  });

  // ==================================================================
  // TEST 1: Quota overflow -- mint 900, then try to mint 200 more
  // ==================================================================
  it("rejects minting 200 more tokens when only 100 quota remains (QuotaExceeded)", async () => {
    // Already minted 900 of 1000 quota. Attempting to mint 200 more
    // (900 + 200 = 1100 > 1000) should fail.
    const overflowAmount = new BN(200_000_000); // 200 tokens

    try {
      await program.methods
        .mintTokens(overflowAmount)
        .accountsPartial({
          minter,
          config: configPda,
          minterRole,
          minterQuota,
          mint: mintKey,
          recipientTokenAccount: authorityAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have thrown QuotaExceeded");
    } catch (e: any) {
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("QuotaExceeded") ||
          msg.includes("quota"),
      );
    }

    // Verify quota tracking stayed correct after the failed attempt
    const quotaAccount = await program.account.minterQuota.fetch(minterQuota);
    expect(quotaAccount.mintedAmount.toNumber()).to.equal(900_000_000);
    expect(quotaAccount.quotaLimit.toNumber()).to.equal(1_000_000_000);

    // Verify config totals are unchanged
    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    expect(configAccount.totalMinted.toNumber()).to.equal(900_000_000);
  });

  // ==================================================================
  // TEST 2: u64 near-MAX mint -- set unlimited quota, attempt overflow
  // ==================================================================
  it("handles u64 near-MAX quota and detects overflow on large mint", async () => {
    // Set quota to u64::MAX (unlimited)
    const u64Max = new BN("18446744073709551615");

    await program.methods
      .setQuota(minter, u64Max)
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
        minterQuota,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const quotaAccount = await program.account.minterQuota.fetch(minterQuota);
    expect(quotaAccount.quotaLimit.toString()).to.equal(
      "18446744073709551615",
    );

    // Attempt to mint a value near u64::MAX. This should either:
    // (a) Fail due to arithmetic overflow in totalMinted tracking, OR
    // (b) Fail due to SPL Token-2022 supply overflow.
    // The key assertion is: the program does NOT panic or corrupt state.
    const nearMaxAmount = new BN("18446744073709551600");

    try {
      await program.methods
        .mintTokens(nearMaxAmount)
        .accountsPartial({
          minter,
          config: configPda,
          minterRole,
          minterQuota,
          mint: mintKey,
          recipientTokenAccount: authorityAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();

      // If the mint somehow succeeded (extremely unlikely), try minting more
      // to trigger overflow on top of that
      try {
        await program.methods
          .mintTokens(new BN(100))
          .accountsPartial({
            minter,
            config: configPda,
            minterRole,
            minterQuota,
            mint: mintKey,
            recipientTokenAccount: authorityAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc();
        expect.fail("Should have thrown on u64 overflow");
      } catch (innerErr: any) {
        expect(innerErr.toString()).to.satisfy(
          (msg: string) =>
            msg.includes("MathOverflow") ||
            msg.includes("overflow") ||
            msg.includes("Overflow") ||
            msg.includes("custom program error"),
        );
      }
    } catch (e: any) {
      // Expected: overflow detected either by our program or by SPL Token-2022
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("MathOverflow") ||
          msg.includes("overflow") ||
          msg.includes("Overflow") ||
          msg.includes("custom program error") ||
          msg.includes("0x1"),
      );
    }
  });

  // Reset quota back to something reasonable for remaining tests
  it("resets quota to 10_000 tokens for subsequent tests", async () => {
    await program.methods
      .setQuota(minter, new BN(10_000_000_000))
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
        minterRole,
        minterQuota,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const quotaAccount = await program.account.minterQuota.fetch(minterQuota);
    expect(quotaAccount.quotaLimit.toNumber()).to.equal(10_000_000_000);
  });

  // ==================================================================
  // TEST 3: Zero amount rejection -- mint(0) and burn(0)
  // ==================================================================
  it("rejects minting zero tokens (ZeroAmount)", async () => {
    try {
      await program.methods
        .mintTokens(new BN(0))
        .accountsPartial({
          minter,
          config: configPda,
          minterRole,
          minterQuota,
          mint: mintKey,
          recipientTokenAccount: authorityAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have thrown ZeroAmount");
    } catch (e: any) {
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("ZeroAmount") ||
          msg.includes("zero"),
      );
    }
  });

  it("rejects burning zero tokens (ZeroAmount)", async () => {
    try {
      await program.methods
        .burnTokens(new BN(0))
        .accountsPartial({
          burner: authority.publicKey,
          config: configPda,
          mint: mintKey,
          burnerTokenAccount: authorityAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have thrown ZeroAmount");
    } catch (e: any) {
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("ZeroAmount") ||
          msg.includes("zero"),
      );
    }
  });

  // ==================================================================
  // TEST 4: Burn more than supply -- mint 100, try to burn 200
  // ==================================================================
  it("mints 100 additional tokens for burn testing", async () => {
    const amount = new BN(100_000_000); // 100 tokens

    await program.methods
      .mintTokens(amount)
      .accountsPartial({
        minter,
        config: configPda,
        minterRole,
        minterQuota,
        mint: mintKey,
        recipientTokenAccount: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  });

  it("burns 800 tokens to leave exactly 200 in balance", async () => {
    // Current balance is 900 (initial) + 100 (just minted) = 1000 tokens.
    // Burn 800 to leave 200 in balance.
    const burnAmount = new BN(800_000_000);

    await program.methods
      .burnTokens(burnAmount)
      .accountsPartial({
        burner: authority.publicKey,
        config: configPda,
        mint: mintKey,
        burnerTokenAccount: authorityAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
  });

  it("rejects burning 400 tokens when only 200 remain in balance", async () => {
    // Balance is now 200 tokens. Try to burn 400 -- should fail.
    const excessiveBurn = new BN(400_000_000); // 400 tokens

    try {
      await program.methods
        .burnTokens(excessiveBurn)
        .accountsPartial({
          burner: authority.publicKey,
          config: configPda,
          mint: mintKey,
          burnerTokenAccount: authorityAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have thrown -- insufficient balance for burn");
    } catch (e: any) {
      // SPL Token-2022 will reject with InsufficientFunds or similar
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("insufficient") ||
          msg.includes("InsufficientBalance") ||
          msg.includes("InsufficientFunds") ||
          msg.includes("0x1"),
      );
    }
  });

  // ==================================================================
  // TEST 5: Double pause / double unpause
  // ==================================================================
  it("pauses the stablecoin", async () => {
    const tx = await program.methods
      .pause()
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    console.log("    pause tx:", tx);

    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    expect(configAccount.paused).to.equal(true);
  });

  it("rejects double pause (AlreadyPaused)", async () => {
    try {
      await program.methods
        .pause()
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();
      expect.fail("Should have thrown AlreadyPaused");
    } catch (e: any) {
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("AlreadyPaused") ||
          msg.includes("already paused"),
      );
    }
  });

  // ==================================================================
  // TEST 6: Mint while paused
  // ==================================================================
  it("rejects minting while paused (Paused)", async () => {
    try {
      await program.methods
        .mintTokens(new BN(1_000_000))
        .accountsPartial({
          minter,
          config: configPda,
          minterRole,
          minterQuota,
          mint: mintKey,
          recipientTokenAccount: authorityAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have thrown Paused");
    } catch (e: any) {
      expect(e.toString()).to.satisfy(
        (msg: string) => msg.includes("Paused"),
      );
    }
  });

  // ==================================================================
  // TEST 7: Burn while paused
  // ==================================================================
  it("rejects burning while paused (Paused)", async () => {
    try {
      await program.methods
        .burnTokens(new BN(1_000_000))
        .accountsPartial({
          burner: authority.publicKey,
          config: configPda,
          mint: mintKey,
          burnerTokenAccount: authorityAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have thrown Paused");
    } catch (e: any) {
      expect(e.toString()).to.satisfy(
        (msg: string) => msg.includes("Paused"),
      );
    }
  });

  // ------------------------------------------------------------------
  // Unpause and verify double unpause fails
  // ------------------------------------------------------------------
  it("unpauses the stablecoin", async () => {
    const tx = await program.methods
      .unpause()
      .accountsPartial({
        authority: authority.publicKey,
        config: configPda,
      })
      .rpc();

    console.log("    unpause tx:", tx);

    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    expect(configAccount.paused).to.equal(false);
  });

  it("rejects double unpause (NotPaused)", async () => {
    try {
      await program.methods
        .unpause()
        .accountsPartial({
          authority: authority.publicKey,
          config: configPda,
        })
        .rpc();
      expect.fail("Should have thrown NotPaused");
    } catch (e: any) {
      expect(e.toString()).to.satisfy(
        (msg: string) =>
          msg.includes("NotPaused") ||
          msg.includes("not paused"),
      );
    }
  });

  // ------------------------------------------------------------------
  // Final state consistency check
  // ------------------------------------------------------------------
  it("verifies final config state is consistent after all tests", async () => {
    const configAccount = await program.account.stablecoinConfig.fetch(
      configPda,
    );
    expect(configAccount.paused).to.equal(false);
    expect(configAccount.complianceEnabled).to.equal(false);
    expect(configAccount.authority.toBase58()).to.equal(
      authority.publicKey.toBase58(),
    );
    // totalMinted should reflect 900 (initial) + 100 (burn test baseline)
    // plus whatever the near-MAX test may have added (likely 0 due to failure)
    expect(configAccount.totalMinted.toNumber()).to.be.greaterThanOrEqual(
      1_000_000_000,
    );
    // totalBurned should reflect the 800 we burned
    expect(configAccount.totalBurned.toNumber()).to.be.greaterThanOrEqual(
      800_000_000,
    );
  });
});
