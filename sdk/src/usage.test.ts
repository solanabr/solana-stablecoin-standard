/**
 * Usage tests: import the SDK as a consumer would and exercise the example API.
 * RPC and program calls are mocked so tests run without a Solana cluster.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair, PublicKey, Connection } from "@solana/web3.js";

const mockConfigFetch = vi.fn().mockResolvedValue({
  bump: 1,
  standard: { sss2: {} },
  name: "My Stablecoin",
  symbol: "MYUSD",
  uri: "https://example.com/metadata.json",
  decimals: 6,
  enablePermanentDelegate: true,
  enableTransferHook: true,
  defaultAccountFrozen: true,
});

vi.mock("@solana/web3.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@solana/web3.js");
  return {
    ...actual,
    Connection: class MockConnection {
      getLatestBlockhash = vi.fn().mockResolvedValue({
        blockhash: "mockblockhash",
        lastValidBlockHeight: 100,
      });
      getTokenSupply = vi.fn().mockResolvedValue({
        value: { amount: "1000000", decimals: 6, uiAmount: 1, uiAmountString: "1" },
      });
    },
  };
});

vi.mock("@coral-xyz/anchor", () => {
  const rpc = () => Promise.resolve("mock-tx-sig");
  const signers = () => ({ rpc });
  const withPre = () => ({ signers });
  const chain = () => ({
    accountsStrict: () => ({ signers, preInstructions: withPre }),
  });
  return {
    AnchorProvider: class {
      constructor(
        public connection: unknown,
        public wallet: { publicKey: PublicKey },
        public opts: unknown
      ) {}
      get publicKey(): PublicKey {
        return this.wallet.publicKey;
      }
    },
    Program: class MockProgram {
      provider!: { connection: { getTokenSupply: () => Promise<unknown> }; publicKey: PublicKey };
      account = { stablecoinConfig: { fetch: mockConfigFetch } };
      methods = {
        initialize: chain,
        mintTokens: chain,
        addToBlacklist: chain,
        removeFromBlacklist: chain,
        seize: chain,
        pause: chain,
        unpause: chain,
      };
      constructor(_idl: unknown, provider: { connection: unknown; publicKey?: PublicKey }) {
        this.provider = provider as MockProgram["provider"];
      }
    },
    BN: class BN {
      constructor(_val: string | number) {}
    },
    Wallet: class Wallet {
      constructor(public keypair: Keypair) {}
      get publicKey(): PublicKey {
        return this.keypair.publicKey;
      }
    },
  };
});

// Import after mocks so SDK uses mocked dependencies
import { SolanaStablecoin, Presets, PRESET_CONFIGS } from "@stbr/sss-token";

describe("SDK usage (import @stbr/sss-token)", () => {
  let connection: Connection;
  let adminKeypair: Keypair;
  let recipient: PublicKey;
  let minter: Keypair;
  let address: PublicKey;
  let frozenAccount: PublicKey;
  let treasury: PublicKey;

  beforeEach(() => {
    connection = new Connection("https://api.mainnet-beta.solana.com");
    adminKeypair = Keypair.generate();
    recipient = Keypair.generate().publicKey;
    minter = adminKeypair; // same as authority for simplicity
    address = Keypair.generate().publicKey;
    frozenAccount = Keypair.generate().publicKey;
    treasury = Keypair.generate().publicKey;
    vi.clearAllMocks();
    mockConfigFetch.mockResolvedValue({
      bump: 1,
      standard: { sss2: {} },
      name: "My Stablecoin",
      symbol: "MYUSD",
      uri: "https://example.com/metadata.json",
      decimals: 6,
      enablePermanentDelegate: true,
      enableTransferHook: true,
      defaultAccountFrozen: true,
    });
  });

  it("preset initialization: create with Presets.SSS_2", async () => {
    const stable = await SolanaStablecoin.create(connection, {
      preset: Presets.SSS_2,
      name: "My Stablecoin",
      symbol: "MYUSD",
      decimals: 6,
      authority: adminKeypair,
    });

    expect(stable).toBeDefined();
    expect(stable.mintAddress).toBeInstanceOf(PublicKey);
    expect(stable.config.name).toBe("My Stablecoin");
    expect(stable.config.symbol).toBe("MYUSD");
    expect(stable.config.decimals).toBe(6);
    expect(stable.compliance).toBeDefined();
  });

  it("custom config: create without preset", async () => {
    const custom = await SolanaStablecoin.create(connection, {
      name: "Custom Stable",
      symbol: "CUSD",
      decimals: 6,
      extensions: { permanentDelegate: true, transferHook: false },
      authority: adminKeypair,
    });

    expect(custom).toBeDefined();
    expect(custom.mintAddress).toBeInstanceOf(PublicKey);
    expect(custom.config).toBeDefined();
    expect(typeof custom.config.name).toBe("string");
    expect(typeof custom.config.symbol).toBe("string");
  });

  it("mint, compliance.blacklistAdd, compliance.seize, getTotalSupply", async () => {
    const stable = await SolanaStablecoin.create(connection, {
      preset: Presets.SSS_2,
      name: "My Stablecoin",
      symbol: "MYUSD",
      decimals: 6,
      authority: adminKeypair,
    });

    await stable.mint({ recipient, amount: 1_000_000, minter });
    await stable.compliance.blacklistAdd(address, "Sanctions match");
    await stable.compliance.seize(frozenAccount, treasury, 500_000); // amount so we don't need getAccountInfo
    const supply = await stable.getTotalSupply();

    expect(supply).toBe(BigInt(1_000_000));
  });

  it("supports SSS-1 preset and blocks compliance helpers", async () => {
    mockConfigFetch.mockResolvedValueOnce({
      bump: 1,
      standard: { sss1: {} },
      name: "SSS-1 Stablecoin",
      symbol: "SSS1",
      uri: "https://example.com/metadata.json",
      decimals: 6,
      enablePermanentDelegate: false,
      enableTransferHook: false,
      defaultAccountFrozen: false,
    });

    const stable = await SolanaStablecoin.create(connection, {
      preset: Presets.SSS_1,
      authority: adminKeypair,
    });

    expect(stable.config.standard).toEqual({ sss1: {} });
    await expect(
      stable.compliance.blacklistAdd(address, "not allowed on sss1"),
    ).rejects.toThrow(/requires SSS-2 compliance features/i);
  });

  it("supports blacklistRemove and pause/unpause SDK helpers", async () => {
    const stable = await SolanaStablecoin.create(connection, {
      preset: Presets.SSS_2,
      authority: adminKeypair,
    });
    await expect(stable.compliance.blacklistRemove(address)).resolves.toBeTypeOf(
      "string",
    );
    await expect(stable.pause()).resolves.toBeTypeOf("string");
    await expect(stable.unpause()).resolves.toBeTypeOf("string");
  });

  it("keeps SDK presets aligned with expected default flags", () => {
    expect(PRESET_CONFIGS[Presets.SSS_1]).toMatchObject({
      standard: "sss1",
      name: "SSS-1 Stablecoin",
      symbol: "SSS1",
      decimals: 6,
      extensions: {
        permanentDelegate: false,
        transferHook: false,
        defaultAccountFrozen: false,
      },
    });
    expect(PRESET_CONFIGS[Presets.SSS_2]).toMatchObject({
      standard: "sss2",
      name: "SSS-2 Stablecoin",
      symbol: "SSS2",
      decimals: 6,
      extensions: {
        permanentDelegate: true,
        transferHook: true,
        defaultAccountFrozen: true,
      },
    });
  });

  it("exports Presets.SSS_1 and Presets.SSS_2", () => {
    expect(Presets.SSS_1).toBe("SSS_1");
    expect(Presets.SSS_2).toBe("SSS_2");
  });
});
