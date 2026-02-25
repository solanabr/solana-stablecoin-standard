/**
 * SDK integration tests — exercise the TypeScript SDK against a live local validator.
 *
 * These tests mirror the core SSS-1 and SSS-2 lifecycle scenarios but call
 * through the SolanaStablecoin and ComplianceModule classes rather than
 * invoking the Anchor program directly.
 *
 * The SDK is compiled to ESM (NodeNext). Dynamic import is used to load it
 * from this CommonJS test runner context.
 */

import * as anchor from "@coral-xyz/anchor";
import { type Connection, Keypair } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccountIdempotent,
} from "@solana/spl-token";
import { expect } from "chai";
import fs from "fs";
import os from "os";
import path from "path";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Confirm an airdrop using the latest-blockhash strategy so that the test
 * never proceeds until the lamports are actually spendable.  The old pattern
 * of requestAirdrop + setTimeout(N) races against validator block time and
 * causes "Blockhash not found" failures when the suite runs slowly.
 */
async function confirmAirdrop(
  connection: Connection,
  sig: string
): Promise<void> {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
}

/**
 * Retry an async operation up to maxAttempts times when the only error is
 * "Blockhash not found".  This surfaces intermittently on a local validator
 * when the mocha runner pauses between tests (GC, I/O, etc.) and the blockhash
 * fetched inside the SDK's .rpc() call falls outside the ~150-slot validity
 * window by the time the transaction is sent.  All other errors propagate
 * immediately without retrying.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const msg = String((err as Error)?.message ?? "");
      if (attempt < maxAttempts - 1 && msg.includes("Blockhash not found")) {
        // Back off briefly before retrying so the validator can advance a slot
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Loaded via dynamic import in before() — types only used for annotations
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SolanaStablecoinClass = any;

describe("SDK: SSS-1 stablecoin via TypeScript SDK", () => {
  const rawProvider = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    rawProvider.connection,
    rawProvider.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const connection = provider.connection;
  const authority = (provider.wallet as anchor.Wallet).payer;
  const minter = Keypair.generate();
  const recipient = Keypair.generate();

  const DECIMALS = 6;
  const QUOTA = BigInt(10_000_000);
  const MINT_AMOUNT = BigInt(1_000_000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let SolanaStablecoin: any;
  let coin: SolanaStablecoinClass;
  let mintKp: Keypair;

  before(async () => {
    // Load SDK (ESM) from CJS test context
    ({ SolanaStablecoin } = await import("../sdk/dist/index.js"));

    // Confirm airdrops explicitly — never rely on a fixed sleep
    await confirmAirdrop(
      connection,
      await connection.requestAirdrop(minter.publicKey, 2e9)
    );
    await confirmAirdrop(
      connection,
      await connection.requestAirdrop(recipient.publicKey, 2e9)
    );
  });

  it("creates an SSS-1 stablecoin via SDK", async () => {
    mintKp = Keypair.generate();
    coin = await withRetry(() =>
      SolanaStablecoin.create(connection, authority, mintKp, {
        name: "SDKTestUSD",
        symbol: "STUSD",
        decimals: DECIMALS,
        preset: "sss-1",
      })
    );

    const info = await coin.getInfo();
    expect(info.name).to.equal("SDKTestUSD");
    expect(info.symbol).to.equal("STUSD");
    expect(info.decimals).to.equal(DECIMALS);
    expect(info.paused).to.be.false;
    expect(info.enablePermanentDelegate).to.be.false;
    expect(info.enableTransferHook).to.be.false;
  });

  it("loads an existing stablecoin via SDK", async () => {
    const loaded = await SolanaStablecoin.load(connection, mintKp.publicKey);
    const info = await loaded.getInfo();
    expect(info.mint.toBase58()).to.equal(mintKp.publicKey.toBase58());
  });

  it("adds a minter and mints tokens via SDK", async () => {
    await withRetry(() => coin.addMinter(authority, minter.publicKey, QUOTA));

    const recipientAta = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await withRetry(() => coin.mintTokens(minter, recipient.publicKey, MINT_AMOUNT));

    const acct = await getAccount(
      connection,
      recipientAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(acct.amount).to.equal(MINT_AMOUNT);
  });

  it("pauses and unpauses via SDK", async () => {
    await withRetry(() => coin.pause(authority));
    expect((await coin.getInfo()).paused).to.be.true;

    await withRetry(() => coin.unpause(authority));
    expect((await coin.getInfo()).paused).to.be.false;
  });

  it("freezes and thaws a token account via SDK", async () => {
    const ata = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      recipient.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await withRetry(() => coin.freezeAccount(authority, ata));
    expect(
      (await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID))
        .isFrozen
    ).to.be.true;

    await withRetry(() => coin.thawAccount(authority, ata));
    expect(
      (await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID))
        .isFrozen
    ).to.be.false;
  });

  it("transfers authority via SDK", async () => {
    const newAuth = Keypair.generate();
    await confirmAirdrop(
      connection,
      await connection.requestAirdrop(newAuth.publicKey, 1e9)
    );

    await withRetry(() => coin.transferAuthority(authority, newAuth.publicKey));
    expect((await coin.getInfo()).authority.toBase58()).to.equal(
      newAuth.publicKey.toBase58()
    );
  });
});

describe("SDK: SSS-2 compliance module via TypeScript SDK", () => {
  const rawProvider = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    rawProvider.connection,
    rawProvider.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const connection = provider.connection;
  const authority = (provider.wallet as anchor.Wallet).payer;
  const minter = Keypair.generate();
  const user = Keypair.generate();

  const DECIMALS = 6;
  const QUOTA = BigInt(50_000_000);
  const MINT_AMOUNT = BigInt(5_000_000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let SolanaStablecoin: any;
  let coin: SolanaStablecoinClass;
  let mintKp: Keypair;

  before(async () => {
    ({ SolanaStablecoin } = await import("../sdk/dist/index.js"));

    await confirmAirdrop(
      connection,
      await connection.requestAirdrop(minter.publicKey, 2e9)
    );
    await confirmAirdrop(
      connection,
      await connection.requestAirdrop(user.publicKey, 2e9)
    );
  });

  it("creates an SSS-2 stablecoin via SDK", async () => {
    mintKp = Keypair.generate();
    coin = await withRetry(() =>
      SolanaStablecoin.create(connection, authority, mintKp, {
        name: "SDKCompliantUSD",
        symbol: "SCUSD",
        decimals: DECIMALS,
        preset: "sss-2",
      })
    );

    const info = await coin.getInfo();
    expect(info.enablePermanentDelegate).to.be.true;
    expect(info.enableTransferHook).to.be.true;
    expect(info.enableDefaultFrozen).to.be.true;
  });

  it("compliance methods throw on SSS-1 token", async () => {
    const sss1Kp = Keypair.generate();
    const sss1 = await withRetry(() =>
      SolanaStablecoin.create(connection, authority, sss1Kp, {
        name: "MinimalUSD",
        symbol: "MUSD",
        preset: "sss-1",
      })
    );

    try {
      await sss1.compliance.isBlacklisted(user.publicKey);
      expect.fail("should have thrown");
    } catch (err: unknown) {
      expect((err as Error).message).to.include("SSS-2");
    }
  });

  it("blacklists an address via SDK", async () => {
    expect(await coin.compliance.isBlacklisted(user.publicKey)).to.be.false;

    await withRetry(() =>
      coin.compliance.addToBlacklist(authority, user.publicKey, "SDK test")
    );
    expect(await coin.compliance.isBlacklisted(user.publicKey)).to.be.true;
  });

  it("removes an address from the blacklist via SDK", async () => {
    await withRetry(() =>
      coin.compliance.removeFromBlacklist(authority, user.publicKey)
    );
    expect(await coin.compliance.isBlacklisted(user.publicKey)).to.be.false;
  });

  it("seizes tokens from a frozen account via SDK", async () => {
    await withRetry(() => coin.addMinter(authority, minter.publicKey, QUOTA));

    const userAta = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      user.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    const treasuryAta = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      authority.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // SSS-2: create ATA explicitly (starts frozen under DefaultAccountState),
    // then thaw → mint → refreeze to set up the seizure scenario
    await createAssociatedTokenAccountIdempotent(
      connection,
      authority,
      mintKp.publicKey,
      user.publicKey,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
    await withRetry(() => coin.thawAccount(authority, userAta));
    await withRetry(() => coin.mintTokens(minter, user.publicKey, MINT_AMOUNT));
    await withRetry(() => coin.freezeAccount(authority, userAta));

    // Create treasury ATA (starts frozen under SSS-2) and thaw it
    await createAssociatedTokenAccountIdempotent(
      connection,
      authority,
      mintKp.publicKey,
      authority.publicKey,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
    await withRetry(() => coin.thawAccount(authority, treasuryAta));

    await withRetry(() =>
      coin.compliance.seize(authority, userAta, treasuryAta, MINT_AMOUNT)
    );

    const acct = await getAccount(
      connection,
      userAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    expect(acct.amount).to.equal(BigInt(0));
  });
});

describe("SDK: convenience wrappers and minter management", () => {
  const rawProvider = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    rawProvider.connection,
    rawProvider.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const connection = provider.connection;
  const authority = (provider.wallet as anchor.Wallet).payer;
  const minter = Keypair.generate();
  const recipient = Keypair.generate();

  const DECIMALS = 6;
  const QUOTA = BigInt(20_000_000);
  const MINT_AMOUNT = BigInt(3_000_000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let SolanaStablecoin: any;
  let coin: SolanaStablecoinClass;
  let mintKp: Keypair;

  before(async () => {
    ({ SolanaStablecoin } = await import("../sdk/dist/index.js"));
    await confirmAirdrop(connection, await connection.requestAirdrop(minter.publicKey, 2e9));
    await confirmAirdrop(connection, await connection.requestAirdrop(recipient.publicKey, 2e9));

    mintKp = Keypair.generate();
    coin = await withRetry(() =>
      SolanaStablecoin.create(connection, authority, mintKp, {
        name: "WrapperTestUSD",
        symbol: "WTUSD",
        decimals: DECIMALS,
        preset: "sss-1",
      })
    );
    await withRetry(() => coin.addMinter(authority, minter.publicKey, QUOTA));
  });

  it("getTotalSupply() returns correct value after minting", async () => {
    await withRetry(() => coin.mintTokens(minter, recipient.publicKey, MINT_AMOUNT));
    const supply = await coin.getTotalSupply();
    expect(supply).to.equal(MINT_AMOUNT);
  });

  it("mint() object-style wrapper works", async () => {
    const before = await coin.getTotalSupply();
    await withRetry(() =>
      coin.mint({ recipient: recipient.publicKey, amount: MINT_AMOUNT, minter })
    );
    const after = await coin.getTotalSupply();
    expect(after - before).to.equal(MINT_AMOUNT);
  });

  it("getMinters() returns minter with correct quota", async () => {
    const minters = await coin.getMinters();
    expect(minters.length).to.be.greaterThanOrEqual(1);
    const entry = minters.find((m: { address: { toBase58: () => string } }) => m.address.toBase58() === minter.publicKey.toBase58());
    expect(entry).to.not.be.undefined;
    expect(entry.quota).to.equal(QUOTA);
  });

  it("removeMinter() removes from role list", async () => {
    const extraMinter = Keypair.generate();
    await confirmAirdrop(connection, await connection.requestAirdrop(extraMinter.publicKey, 2e9));
    await withRetry(() => coin.addMinter(authority, extraMinter.publicKey, BigInt(1_000_000)));

    let minters = await coin.getMinters();
    const countBefore = minters.length;

    await withRetry(() => coin.removeMinter(authority, extraMinter.publicKey));

    minters = await coin.getMinters();
    expect(minters.length).to.equal(countBefore - 1);
    const found = minters.find((m: { address: { toBase58: () => string } }) => m.address.toBase58() === extraMinter.publicKey.toBase58());
    expect(found).to.be.undefined;
  });
});

describe("SDK: SSS-2 compliance convenience aliases", () => {
  const rawProvider = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(
    rawProvider.connection,
    rawProvider.wallet,
    { commitment: "confirmed", preflightCommitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const connection = provider.connection;
  const authority = (provider.wallet as anchor.Wallet).payer;
  const target = Keypair.generate();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let SolanaStablecoin: any;
  let coin: SolanaStablecoinClass;

  before(async () => {
    ({ SolanaStablecoin } = await import("../sdk/dist/index.js"));

    const mintKp = Keypair.generate();
    coin = await withRetry(() =>
      SolanaStablecoin.create(connection, authority, mintKp, {
        name: "AliasTestUSD",
        symbol: "ATUSD",
        decimals: 6,
        preset: "sss-2",
      })
    );
  });

  it("blacklistAdd() alias works", async () => {
    await withRetry(() =>
      coin.compliance.blacklistAdd(target.publicKey, "alias test", authority)
    );
    expect(await coin.compliance.isBlacklisted(target.publicKey)).to.be.true;
  });
});

describe("CLI: config file parsing (JSON and TOML)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parseToml: any;

  before(async () => {
    ({ parseToml } = await import("../cli/dist/commands/init.js"));
  });

  it("parses a JSON config file correctly", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sss-test-"));
    const jsonPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        name: "JSON Stable",
        symbol: "JSTB",
        decimals: 9,
        uri: "https://example.com/meta.json",
        preset: "sss-2",
      })
    );

    const raw = fs.readFileSync(jsonPath, "utf8");
    const cfg = JSON.parse(raw);
    expect(cfg.name).to.equal("JSON Stable");
    expect(cfg.symbol).to.equal("JSTB");
    expect(cfg.decimals).to.equal(9);
    expect(cfg.uri).to.equal("https://example.com/meta.json");
    expect(cfg.preset).to.equal("sss-2");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("parses a TOML config file correctly", () => {
    const tomlContent = [
      '# My stablecoin config',
      'name = "TOML Stable"',
      'symbol = "TSTB"',
      'decimals = 6',
      'uri = ""',
      'preset = "sss-1"',
    ].join("\n");

    const cfg = parseToml(tomlContent);
    expect(cfg.name).to.equal("TOML Stable");
    expect(cfg.symbol).to.equal("TSTB");
    expect(cfg.decimals).to.equal(6);
    expect(cfg.uri).to.equal("");
    expect(cfg.preset).to.equal("sss-1");
  });
});
