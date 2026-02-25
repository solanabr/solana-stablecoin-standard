import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";
import { startAnchor, BankrunProvider } from "anchor-bankrun";
import { SssCore } from "../target/types/sss_core";
import {
  createSss1Mint,
  createTokenAccount,
  grantRole,
  fetchConfig,
  getTokenBalance,
  airdropSol,
  ROLE_MINTER,
  CreateSss1MintResult,
} from "./helpers";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

// Pyth v2 oracle program IDs (must match the program's constants)
const PYTH_V2_DEVNET = new PublicKey(
  "gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s",
);

// Pyth v2 price account byte layout constants
const PYTH_PRICE_ACCOUNT_SIZE = 256; // holds all fields with room to spare
const EXPONENT_OFFSET = 20; // i32 LE at bytes 20-24
const AGG_PRICE_OFFSET = 208; // i64 LE at bytes 208-216

// ─────────────────────────────────────────────────────────────
// Mock Oracle Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Builds a mock Pyth v2 price account data buffer.
 *
 * @param price - Raw price value (i64). For $1.00 with expo=-8, use 100_000_000.
 * @param exponent - Price exponent (i32). Standard Pyth uses -8.
 */
function buildPythPriceData(price: bigint, exponent: number): Buffer {
  const data = Buffer.alloc(PYTH_PRICE_ACCOUNT_SIZE);

  // Write exponent as i32 LE at offset 20
  data.writeInt32LE(exponent, EXPONENT_OFFSET);

  // Write aggregate price as i64 LE at offset 208
  data.writeBigInt64LE(price, AGG_PRICE_OFFSET);

  return data;
}

// ─────────────────────────────────────────────────────────────
// Part 1: Standard validator tests — validation & rejection paths
//
// These tests run on the standard anchor test validator. They
// verify that the program correctly rejects invalid oracle
// accounts. SystemProgram.createAccount zero-initializes data,
// so Pyth-owned accounts have price=0 (triggers InvalidOraclePrice)
// which is fine for testing rejection logic.
// ─────────────────────────────────────────────────────────────

describe("Oracle — Validation (anchor test validator)", () => {
  const provider = anchor.AnchorProvider.env();
  provider.opts.commitment = "confirmed";
  anchor.setProvider(provider);

  const coreProgram = anchor.workspace.SssCore as Program<SssCore>;

  const minter = Keypair.generate();
  const recipient = Keypair.generate();

  let mintResult: CreateSss1MintResult;
  let minterRolePda: PublicKey;
  let recipientAta: PublicKey;

  before(async () => {
    await airdropSol(provider.connection, minter.publicKey, 10);
    await airdropSol(provider.connection, recipient.publicKey, 2);

    mintResult = await createSss1Mint(provider, coreProgram, {
      name: "Oracle Validation USD",
      symbol: "OVUSD",
      uri: "https://example.com/ovusd.json",
      decimals: 6,
      supplyCap: new BN(1_000), // 1000 USD cap
    });

    minterRolePda = await grantRole(
      coreProgram,
      mintResult.configPda,
      mintResult.adminRolePda,
      minter.publicKey,
      ROLE_MINTER,
    );

    recipientAta = await createTokenAccount(
      provider,
      mintResult.mint.publicKey,
      recipient.publicKey,
    );
  });

  it("rejects oracle account owned by system program", async () => {
    const fakeOracle = Keypair.generate();
    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(
        PYTH_PRICE_ACCOUNT_SIZE,
      );

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: fakeOracle.publicKey,
        space: PYTH_PRICE_ACCOUNT_SIZE,
        lamports,
        programId: SystemProgram.programId,
      }),
    );
    await provider.sendAndConfirm(tx, [fakeOracle]);

    try {
      await coreProgram.methods
        .mintTokens(new BN(500_000_000))
        .accountsPartial({
          minter: minter.publicKey,
          config: mintResult.configPda,
          minterRole: minterRolePda,
          mint: mintResult.mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          {
            pubkey: fakeOracle.publicKey,
            isSigner: false,
            isWritable: false,
          },
        ])
        .signers([minter])
        .rpc();
      expect.fail("Should have thrown InvalidOracleData");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("InvalidOracleData");
    }
  });

  it("rejects oracle account owned by arbitrary program", async () => {
    const randomProgram = Keypair.generate().publicKey;
    const fakeOracle = Keypair.generate();
    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(
        PYTH_PRICE_ACCOUNT_SIZE,
      );

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: fakeOracle.publicKey,
        space: PYTH_PRICE_ACCOUNT_SIZE,
        lamports,
        programId: randomProgram,
      }),
    );
    await provider.sendAndConfirm(tx, [fakeOracle]);

    try {
      await coreProgram.methods
        .mintTokens(new BN(500_000_000))
        .accountsPartial({
          minter: minter.publicKey,
          config: mintResult.configPda,
          minterRole: minterRolePda,
          mint: mintResult.mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          {
            pubkey: fakeOracle.publicKey,
            isSigner: false,
            isWritable: false,
          },
        ])
        .signers([minter])
        .rpc();
      expect.fail("Should have thrown InvalidOracleData");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("InvalidOracleData");
    }
  });

  it("rejects oracle with undersized account data", async () => {
    const tinyOracle = Keypair.generate();
    const tinySize = 100; // well under the 216-byte minimum
    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(tinySize);

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: tinyOracle.publicKey,
        space: tinySize,
        lamports,
        programId: PYTH_V2_DEVNET,
      }),
    );
    await provider.sendAndConfirm(tx, [tinyOracle]);

    try {
      await coreProgram.methods
        .mintTokens(new BN(1_000_000))
        .accountsPartial({
          minter: minter.publicKey,
          config: mintResult.configPda,
          minterRole: minterRolePda,
          mint: mintResult.mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          {
            pubkey: tinyOracle.publicKey,
            isSigner: false,
            isWritable: false,
          },
        ])
        .signers([minter])
        .rpc();
      expect.fail("Should have thrown InvalidOracleData");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("InvalidOracleData");
    }
  });

  it("rejects oracle with zero price (zeroed Pyth-owned account)", async () => {
    // SystemProgram.createAccount zeros data, so price at offset 208 = 0
    const oracle = Keypair.generate();
    const lamports =
      await provider.connection.getMinimumBalanceForRentExemption(
        PYTH_PRICE_ACCOUNT_SIZE,
      );

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: oracle.publicKey,
        space: PYTH_PRICE_ACCOUNT_SIZE,
        lamports,
        programId: PYTH_V2_DEVNET,
      }),
    );
    await provider.sendAndConfirm(tx, [oracle]);

    try {
      await coreProgram.methods
        .mintTokens(new BN(1_000_000))
        .accountsPartial({
          minter: minter.publicKey,
          config: mintResult.configPda,
          minterRole: minterRolePda,
          mint: mintResult.mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          {
            pubkey: oracle.publicKey,
            isSigner: false,
            isWritable: false,
          },
        ])
        .signers([minter])
        .rpc();
      expect.fail("Should have thrown InvalidOraclePrice");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("InvalidOraclePrice");
    }
  });

  it("uses raw supply cap when no oracle is provided", async () => {
    // Fresh mint with raw cap = 1_000_000 token units
    const rawCapMint = await createSss1Mint(provider, coreProgram, {
      name: "Raw Cap USD",
      symbol: "RCUSD",
      uri: "https://example.com/rcusd.json",
      decimals: 6,
      supplyCap: new BN(1_000_000),
    });

    const rawMinterRole = await grantRole(
      coreProgram,
      rawCapMint.configPda,
      rawCapMint.adminRolePda,
      minter.publicKey,
      ROLE_MINTER,
    );

    const ata = await createTokenAccount(
      provider,
      rawCapMint.mint.publicKey,
      recipient.publicKey,
    );

    // Mint exactly at cap — no oracle means raw token-unit cap
    await coreProgram.methods
      .mintTokens(new BN(1_000_000))
      .accountsPartial({
        minter: minter.publicKey,
        config: rawCapMint.configPda,
        minterRole: rawMinterRole,
        mint: rawCapMint.mint.publicKey,
        to: ata,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();

    const balance = await getTokenBalance(provider.connection, ata);
    expect(balance.toString()).to.equal("1000000");

    // 1 more token should fail
    try {
      await coreProgram.methods
        .mintTokens(new BN(1))
        .accountsPartial({
          minter: minter.publicKey,
          config: rawCapMint.configPda,
          minterRole: rawMinterRole,
          mint: rawCapMint.mint.publicKey,
          to: ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
      expect.fail("Should have thrown SupplyCapExceeded");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("SupplyCapExceeded");
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Part 2: Bankrun tests — oracle price conversion logic
//
// These tests use solana-bankrun (via anchor-bankrun) which
// provides setAccount() to inject accounts with arbitrary data
// and owner. This is necessary because SystemProgram.createAccount
// zero-initializes data — the only way to create a Pyth-owned
// account with valid price data is through setAccount().
// ─────────────────────────────────────────────────────────────

describe("Oracle — Price Conversion (bankrun)", () => {
  let context: Awaited<ReturnType<typeof startAnchor>>;
  let provider: BankrunProvider;
  let coreProgram: Program<SssCore>;

  const minter = Keypair.generate();
  const recipient = Keypair.generate();

  /**
   * Injects a mock Pyth v2 price account into the bankrun context.
   * Uses setAccount() to write arbitrary data with Pyth as owner.
   */
  function injectMockPythOracle(
    price: bigint,
    exponent: number,
    owner: PublicKey = PYTH_V2_DEVNET,
  ): PublicKey {
    const oracle = Keypair.generate();
    const data = buildPythPriceData(price, exponent);

    context.setAccount(oracle.publicKey, {
      lamports: LAMPORTS_PER_SOL,
      data,
      owner,
      executable: false,
    });

    return oracle.publicKey;
  }

  before(async () => {
    context = await startAnchor(
      "", // Anchor project root (cwd)
      [],
      [
        // Pre-fund minter
        {
          address: minter.publicKey,
          info: {
            lamports: 100 * LAMPORTS_PER_SOL,
            data: Buffer.alloc(0),
            owner: SystemProgram.programId,
            executable: false,
          },
        },
        // Pre-fund recipient
        {
          address: recipient.publicKey,
          info: {
            lamports: 10 * LAMPORTS_PER_SOL,
            data: Buffer.alloc(0),
            owner: SystemProgram.programId,
            executable: false,
          },
        },
      ],
    );

    provider = new BankrunProvider(context);
    anchor.setProvider(provider);

    coreProgram = new Program<SssCore>(
      anchor.workspace.SssCore.idl,
      provider,
    );
  });

  describe("oracle-adjusted supply cap at $1.00", () => {
    let mintResult: CreateSss1MintResult;
    let minterRolePda: PublicKey;
    let recipientAta: PublicKey;

    before(async () => {
      // Supply cap = 1000 USD, decimals = 6
      // With oracle price $1.00 (price=100_000_000, expo=-8):
      //   token_cap = 1000 * 10^6 * 10^8 / 100_000_000
      //             = 1_000_000_000 token units (1000 tokens)
      mintResult = await createSss1Mint(
        provider as any,
        coreProgram,
        {
          name: "Oracle Cap USD",
          symbol: "OCUSD",
          uri: "https://example.com/ocusd.json",
          decimals: 6,
          supplyCap: new BN(1_000), // 1000 USD
        },
      );

      minterRolePda = await grantRole(
        coreProgram,
        mintResult.configPda,
        mintResult.adminRolePda,
        minter.publicKey,
        ROLE_MINTER,
      );

      recipientAta = await createTokenAccount(
        provider as any,
        mintResult.mint.publicKey,
        recipient.publicKey,
      );
    });

    it("succeeds minting under oracle-adjusted cap", async () => {
      // Price = $1.00, cap = 1000 USD => 1_000_000_000 token units
      const oracleKey = injectMockPythOracle(BigInt(100_000_000), -8);

      // Mint 500 tokens = 500_000_000 token units (under cap)
      await coreProgram.methods
        .mintTokens(new BN(500_000_000))
        .accountsPartial({
          minter: minter.publicKey,
          config: mintResult.configPda,
          minterRole: minterRolePda,
          mint: mintResult.mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: oracleKey, isSigner: false, isWritable: false },
        ])
        .signers([minter])
        .rpc();

      const config = await fetchConfig(coreProgram, mintResult.configPda);
      expect(config.totalMinted.toNumber()).to.equal(500_000_000);
    });

    it("fails minting over oracle-adjusted cap", async () => {
      // Already minted 500_000_000. Cap at $1.00 = 1_000_000_000.
      // Try minting 501 tokens = 501_000_000 (total = 1_001_000_000 > cap)
      const oracleKey = injectMockPythOracle(BigInt(100_000_000), -8);

      try {
        await coreProgram.methods
          .mintTokens(new BN(501_000_000))
          .accountsPartial({
            minter: minter.publicKey,
            config: mintResult.configPda,
            minterRole: minterRolePda,
            mint: mintResult.mint.publicKey,
            to: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .remainingAccounts([
            { pubkey: oracleKey, isSigner: false, isWritable: false },
          ])
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown SupplyCapExceeded");
      } catch (err: any) {
        expect(err.toString()).to.include("SupplyCapExceeded");
      }
    });

    it("succeeds minting exactly at oracle-adjusted cap", async () => {
      // Already minted 500_000_000. Cap at $1.00 = 1_000_000_000.
      // Mint exactly 500 more tokens = 500_000_000 to hit cap.
      const oracleKey = injectMockPythOracle(BigInt(100_000_000), -8);

      await coreProgram.methods
        .mintTokens(new BN(500_000_000))
        .accountsPartial({
          minter: minter.publicKey,
          config: mintResult.configPda,
          minterRole: minterRolePda,
          mint: mintResult.mint.publicKey,
          to: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: oracleKey, isSigner: false, isWritable: false },
        ])
        .signers([minter])
        .rpc();

      const config = await fetchConfig(coreProgram, mintResult.configPda);
      expect(config.totalMinted.toNumber()).to.equal(1_000_000_000);
    });
  });

  describe("price sensitivity", () => {
    it("higher price ($2.00) reduces token cap", async () => {
      // Cap = 100 USD, decimals = 6, price = $2.00 (200_000_000 expo=-8)
      // token_cap = 100 * 10^6 * 10^8 / 200_000_000 = 50_000_000 (50 tokens)
      const mintResult = await createSss1Mint(
        provider as any,
        coreProgram,
        {
          name: "Price High USD",
          symbol: "PHUSD",
          uri: "https://example.com/phusd.json",
          decimals: 6,
          supplyCap: new BN(100), // 100 USD
        },
      );

      const minterRolePda = await grantRole(
        coreProgram,
        mintResult.configPda,
        mintResult.adminRolePda,
        minter.publicKey,
        ROLE_MINTER,
      );

      const ata = await createTokenAccount(
        provider as any,
        mintResult.mint.publicKey,
        recipient.publicKey,
      );

      const oracleKey = injectMockPythOracle(BigInt(200_000_000), -8);

      // Mint 50 tokens (cap) should succeed
      await coreProgram.methods
        .mintTokens(new BN(50_000_000))
        .accountsPartial({
          minter: minter.publicKey,
          config: mintResult.configPda,
          minterRole: minterRolePda,
          mint: mintResult.mint.publicKey,
          to: ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: oracleKey, isSigner: false, isWritable: false },
        ])
        .signers([minter])
        .rpc();

      const config = await fetchConfig(coreProgram, mintResult.configPda);
      expect(config.totalMinted.toNumber()).to.equal(50_000_000);

      // 1 more token unit should exceed cap
      const oracleKey2 = injectMockPythOracle(BigInt(200_000_000), -8);
      try {
        await coreProgram.methods
          .mintTokens(new BN(1))
          .accountsPartial({
            minter: minter.publicKey,
            config: mintResult.configPda,
            minterRole: minterRolePda,
            mint: mintResult.mint.publicKey,
            to: ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .remainingAccounts([
            { pubkey: oracleKey2, isSigner: false, isWritable: false },
          ])
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown SupplyCapExceeded");
      } catch (err: any) {
        expect(err.toString()).to.include("SupplyCapExceeded");
      }
    });

    it("lower price ($0.50) increases token cap", async () => {
      // Cap = 100 USD, decimals = 6, price = $0.50 (50_000_000 expo=-8)
      // token_cap = 100 * 10^6 * 10^8 / 50_000_000 = 200_000_000 (200 tokens)
      const mintResult = await createSss1Mint(
        provider as any,
        coreProgram,
        {
          name: "Price Low USD",
          symbol: "PLUSD",
          uri: "https://example.com/plusd.json",
          decimals: 6,
          supplyCap: new BN(100), // 100 USD
        },
      );

      const minterRolePda = await grantRole(
        coreProgram,
        mintResult.configPda,
        mintResult.adminRolePda,
        minter.publicKey,
        ROLE_MINTER,
      );

      const ata = await createTokenAccount(
        provider as any,
        mintResult.mint.publicKey,
        recipient.publicKey,
      );

      const oracleKey = injectMockPythOracle(BigInt(50_000_000), -8);

      // Mint 200 tokens (cap) should succeed
      await coreProgram.methods
        .mintTokens(new BN(200_000_000))
        .accountsPartial({
          minter: minter.publicKey,
          config: mintResult.configPda,
          minterRole: minterRolePda,
          mint: mintResult.mint.publicKey,
          to: ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: oracleKey, isSigner: false, isWritable: false },
        ])
        .signers([minter])
        .rpc();

      const config = await fetchConfig(coreProgram, mintResult.configPda);
      expect(config.totalMinted.toNumber()).to.equal(200_000_000);

      // 1 more token unit should exceed cap
      const oracleKey2 = injectMockPythOracle(BigInt(50_000_000), -8);
      try {
        await coreProgram.methods
          .mintTokens(new BN(1))
          .accountsPartial({
            minter: minter.publicKey,
            config: mintResult.configPda,
            minterRole: minterRolePda,
            mint: mintResult.mint.publicKey,
            to: ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .remainingAccounts([
            { pubkey: oracleKey2, isSigner: false, isWritable: false },
          ])
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown SupplyCapExceeded");
      } catch (err: any) {
        expect(err.toString()).to.include("SupplyCapExceeded");
      }
    });
  });

  describe("no supply cap with oracle", () => {
    it("ignores oracle when supply cap is None", async () => {
      const mintResult = await createSss1Mint(
        provider as any,
        coreProgram,
        {
          name: "No Cap USD",
          symbol: "NCUSD",
          uri: "https://example.com/ncusd.json",
          decimals: 6,
          supplyCap: null,
        },
      );

      const minterRolePda = await grantRole(
        coreProgram,
        mintResult.configPda,
        mintResult.adminRolePda,
        minter.publicKey,
        ROLE_MINTER,
      );

      const ata = await createTokenAccount(
        provider as any,
        mintResult.mint.publicKey,
        recipient.publicKey,
      );

      // Oracle present but cap is None — should still allow unlimited minting
      const oracleKey = injectMockPythOracle(BigInt(100_000_000), -8);

      await coreProgram.methods
        .mintTokens(new BN(999_999_999))
        .accountsPartial({
          minter: minter.publicKey,
          config: mintResult.configPda,
          minterRole: minterRolePda,
          mint: mintResult.mint.publicKey,
          to: ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: oracleKey, isSigner: false, isWritable: false },
        ])
        .signers([minter])
        .rpc();

      const config = await fetchConfig(coreProgram, mintResult.configPda);
      expect(config.totalMinted.toNumber()).to.equal(999_999_999);
    });
  });

  describe("oracle with negative price (bankrun)", () => {
    it("rejects oracle with negative price", async () => {
      const mintResult = await createSss1Mint(
        provider as any,
        coreProgram,
        {
          name: "Neg Price USD",
          symbol: "NPUSD",
          uri: "https://example.com/npusd.json",
          decimals: 6,
          supplyCap: new BN(1_000),
        },
      );

      const minterRolePda = await grantRole(
        coreProgram,
        mintResult.configPda,
        mintResult.adminRolePda,
        minter.publicKey,
        ROLE_MINTER,
      );

      const ata = await createTokenAccount(
        provider as any,
        mintResult.mint.publicKey,
        recipient.publicKey,
      );

      // Inject oracle with actual negative price data (not zeroed)
      const oracleKey = injectMockPythOracle(BigInt(-100_000_000), -8);

      try {
        await coreProgram.methods
          .mintTokens(new BN(1_000_000))
          .accountsPartial({
            minter: minter.publicKey,
            config: mintResult.configPda,
            minterRole: minterRolePda,
            mint: mintResult.mint.publicKey,
            to: ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .remainingAccounts([
            { pubkey: oracleKey, isSigner: false, isWritable: false },
          ])
          .signers([minter])
          .rpc();
        expect.fail("Should have thrown InvalidOraclePrice");
      } catch (err: any) {
        expect(err.toString()).to.include("InvalidOraclePrice");
      }
    });
  });
});
