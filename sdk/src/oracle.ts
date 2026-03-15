import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { createHash } from "crypto";

export interface OraclePrice {
  price: number;
  confidence: number;
  exponent: number;
  timestamp: number;
  source: string;
}

export interface ReserveData {
  totalReservesUsd: BN;
  totalOutstanding: BN;
  reserveHash: number[];
  attestationUri: string;
  collateralizationRatio: number;
}

export interface OracleConfig {
  pythProgramId?: PublicKey;
  switchboardProgramId?: PublicKey;
}

export interface FeedInfo {
  address: PublicKey;
  source: "pyth" | "switchboard";
  pair: string;
}

export interface FeedRegistry {
  mainnet: Record<string, FeedInfo[]>;
  devnet: Record<string, FeedInfo[]>;
}

export interface CpiConfig {
  baselineIndex: number;
  baselineDate: string;
  currentIndex: number;
  lastUpdated: number;
  source: string;
}

const PYTH_MAINNET_PROGRAM_ID = new PublicKey(
  "FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH"
);

const PYTH_DEVNET_PROGRAM_ID = new PublicKey(
  "gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s"
);

const SWITCHBOARD_MAINNET_PROGRAM_ID = new PublicKey(
  "SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f"
);

const SWITCHBOARD_DEVNET_PROGRAM_ID = new PublicKey(
  "2TfB33aLaneQb5TNVwyDz3jSZXS6jdW2ARw1Dgf84XCG"
);

export const KNOWN_FEEDS: FeedRegistry = {
  mainnet: {
    "SOL/USD": [
      { address: new PublicKey("H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"), source: "pyth", pair: "SOL/USD" },
      { address: new PublicKey("GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR"), source: "switchboard", pair: "SOL/USD" },
    ],
    "BTC/USD": [
      { address: new PublicKey("GVXRSBjFk6e6J3NbVPXbvDDhjXJsAtEM2HRGRJBEiX9A"), source: "pyth", pair: "BTC/USD" },
      { address: new PublicKey("8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee"), source: "switchboard", pair: "BTC/USD" },
    ],
    "ETH/USD": [
      { address: new PublicKey("JBu1AL4obBcCMqKBBxhpWCNUt136ijcuMZLFvTP7iWdB"), source: "pyth", pair: "ETH/USD" },
    ],
    "EUR/USD": [
      { address: new PublicKey("BcWknpZsNbinxA1FwQrPFQVq1MtrYXRhkGoMCY9SNe3t"), source: "pyth", pair: "EUR/USD" },
    ],
    "USD/BRL": [
      { address: new PublicKey("5jzPg73FoGNBBxwmTkfGFB5NzMSrBuwxTcBykVRiJYqE"), source: "pyth", pair: "USD/BRL" },
    ],
  },
  devnet: {},
};

export const DEFAULT_CPI_CONFIG: CpiConfig = {
  baselineIndex: 257.971,
  baselineDate: "2020-01-01",
  currentIndex: 314.69,
  lastUpdated: Math.floor(Date.now() / 1000),
  source: "us-bls-cpi-u",
};

export const BRAZIL_IPCA_CONFIG: CpiConfig = {
  baselineIndex: 4397.89,
  baselineDate: "2020-01-01",
  currentIndex: 6437.31,
  lastUpdated: Math.floor(Date.now() / 1000),
  source: "ibge-ipca",
};

export class OracleModule {
  readonly connection: Connection;
  readonly pythProgramId: PublicKey;
  readonly switchboardProgramId: PublicKey;

  constructor(connection: Connection, config?: OracleConfig) {
    this.connection = connection;
    this.pythProgramId = config?.pythProgramId ?? PYTH_MAINNET_PROGRAM_ID;
    this.switchboardProgramId =
      config?.switchboardProgramId ?? SWITCHBOARD_MAINNET_PROGRAM_ID;
  }

  async fetchPythPrice(priceFeedAccount: PublicKey): Promise<OraclePrice> {
    const accountInfo = await this.connection.getAccountInfo(priceFeedAccount);
    if (!accountInfo) {
      throw new Error(`Pyth price feed account not found: ${priceFeedAccount.toBase58()}`);
    }

    const data = accountInfo.data;
    // Pyth V2 price account layout:
    // offset 0: magic (4 bytes, 0xa1b2c3d4)
    // offset 4: version (4 bytes)
    // offset 8: type (4 bytes)
    // offset 12: size (4 bytes)
    // offset 208: price (i64, 8 bytes)
    // offset 216: confidence (u64, 8 bytes)
    // offset 224: exponent (i32, 4 bytes)
    // offset 232: timestamp (i64, 8 bytes)
    const price = Number(data.readBigInt64LE(208));
    const confidence = Number(data.readBigUInt64LE(216));
    const exponent = data.readInt32LE(224);
    const timestamp = Number(data.readBigInt64LE(232));

    return {
      price,
      confidence,
      exponent,
      timestamp,
      source: "pyth",
    };
  }

  async fetchSwitchboardPrice(
    aggregatorAccount: PublicKey
  ): Promise<OraclePrice> {
    const accountInfo =
      await this.connection.getAccountInfo(aggregatorAccount);
    if (!accountInfo) {
      throw new Error(
        `Switchboard aggregator account not found: ${aggregatorAccount.toBase58()}`
      );
    }

    if (!accountInfo.owner.equals(this.switchboardProgramId)) {
      throw new Error(
        `Account owner ${accountInfo.owner.toBase58()} does not match Switchboard program ${this.switchboardProgramId.toBase58()}`
      );
    }

    const data = accountInfo.data;

    // Switchboard V2 AggregatorAccountData layout (with 8-byte Anchor discriminator):
    // latest_confirmed_round starts at offset 341
    // round_open_timestamp (i64) at offset 358
    // result.mantissa (i128) at offset 366 (16 bytes LE)
    // result.scale (u32) at offset 382 (4 bytes LE)
    // value = mantissa * 10^(-scale)
    const timestamp = Number(data.readBigInt64LE(358));

    // Read i128 mantissa: low u64 + high i64, combine as BigInt
    const lowBits = data.readBigUInt64LE(366);
    const highBits = data.readBigInt64LE(374);
    const mantissa = Number(highBits * BigInt(2 ** 64) + lowBits);

    const scale = data.readUInt32LE(382);

    return {
      price: mantissa,
      confidence: 0,
      exponent: -scale,
      timestamp,
      source: "switchboard",
    };
  }

  async buildReserveData(params: {
    reserveComponents: { name: string; amountUsd: number }[];
    outstandingSupply: BN;
    attestationUri: string;
  }): Promise<ReserveData> {
    const totalReservesUsdCents = params.reserveComponents.reduce(
      (sum, c) => sum + Math.round(c.amountUsd * 100),
      0
    );

    // Build a deterministic hash of the reserve data
    const hashInput = JSON.stringify({
      components: params.reserveComponents.map((c) => ({
        name: c.name,
        amountUsd: Math.round(c.amountUsd * 100),
      })),
      totalCents: totalReservesUsdCents,
      outstanding: params.outstandingSupply.toString(),
      timestamp: Math.floor(Date.now() / 1000),
    });

    const hash = createHash("sha256").update(hashInput).digest();
    const reserveHash = Array.from(hash);

    const totalReservesUsd = new BN(totalReservesUsdCents);
    const outstandingNum = params.outstandingSupply.toNumber();
    const collateralizationRatio =
      outstandingNum > 0 ? (totalReservesUsdCents / outstandingNum) * 100 : 0;

    return {
      totalReservesUsd,
      totalOutstanding: params.outstandingSupply,
      reserveHash,
      attestationUri: params.attestationUri,
      collateralizationRatio,
    };
  }

  computeReserveHash(data: string | Buffer): number[] {
    const hash = createHash("sha256")
      .update(typeof data === "string" ? Buffer.from(data) : data)
      .digest();
    return Array.from(hash);
  }

  static formatPrice(price: number, exponent: number): string {
    const value = price * Math.pow(10, exponent);
    return `$${value.toFixed(Math.abs(exponent))}`;
  }

  getKnownFeeds(pair: string, network: "mainnet" | "devnet" = "mainnet"): FeedInfo[] {
    return KNOWN_FEEDS[network]?.[pair] ?? [];
  }

  listSupportedPairs(network: "mainnet" | "devnet" = "mainnet"): string[] {
    return Object.keys(KNOWN_FEEDS[network] ?? {});
  }

  async fetchPrice(pair: string, network: "mainnet" | "devnet" = "mainnet"): Promise<OraclePrice> {
    const feeds = this.getKnownFeeds(pair, network);
    if (feeds.length === 0) {
      throw new Error(`No known feeds for pair ${pair} on ${network}`);
    }
    const results: OraclePrice[] = [];
    for (const feed of feeds) {
      try {
        const price = feed.source === "pyth"
          ? await this.fetchPythPrice(feed.address)
          : await this.fetchSwitchboardPrice(feed.address);
        results.push(price);
      } catch {
        continue;
      }
    }
    if (results.length === 0) {
      throw new Error(`All feeds failed for pair ${pair} on ${network}`);
    }
    results.sort((a, b) => b.timestamp - a.timestamp);
    return results[0];
  }

  async fetchPriceMultiSource(pair: string, network: "mainnet" | "devnet" = "mainnet"): Promise<OraclePrice[]> {
    const feeds = this.getKnownFeeds(pair, network);
    const results: OraclePrice[] = [];
    for (const feed of feeds) {
      try {
        const price = feed.source === "pyth"
          ? await this.fetchPythPrice(feed.address)
          : await this.fetchSwitchboardPrice(feed.address);
        results.push(price);
      } catch {
        continue;
      }
    }
    return results;
  }

  async convertAmount(params: {
    amount: BN;
    fromPair: string;
    toPair: string;
    decimals: number;
    network?: "mainnet" | "devnet";
  }): Promise<{ convertedAmount: BN; rate: number; sources: string[] }> {
    const net = params.network ?? "mainnet";
    const fromPrice = await this.fetchPrice(params.fromPair, net);
    const toPrice = await this.fetchPrice(params.toPair, net);
    const fromVal = fromPrice.price * Math.pow(10, fromPrice.exponent);
    const toVal = toPrice.price * Math.pow(10, toPrice.exponent);
    const rate = fromVal / toVal;
    const amountNum = params.amount.toNumber();
    const converted = Math.round(amountNum * rate);
    return {
      convertedAmount: new BN(converted),
      rate,
      sources: [fromPrice.source, toPrice.source],
    };
  }

  async computeMintPrice(params: {
    fiatAmount: number;
    fiatCurrency: string;
    stablecoinDecimals: number;
    network?: "mainnet" | "devnet";
  }): Promise<{ tokensToMint: BN; exchangeRate: number; source: string }> {
    const net = params.network ?? "mainnet";
    const multiplier = Math.pow(10, params.stablecoinDecimals);
    if (params.fiatCurrency === "USD") {
      return {
        tokensToMint: new BN(Math.round(params.fiatAmount * multiplier)),
        exchangeRate: 1,
        source: "direct-peg",
      };
    }
    let pair: string;
    let invert = false;
    if (params.fiatCurrency === "EUR") {
      pair = "EUR/USD";
    } else if (params.fiatCurrency === "BRL") {
      pair = "USD/BRL";
      invert = true;
    } else {
      throw new Error(`Unsupported fiat currency: ${params.fiatCurrency}`);
    }
    const oraclePrice = await this.fetchPrice(pair, net);
    let rate = oraclePrice.price * Math.pow(10, oraclePrice.exponent);
    if (invert) rate = 1 / rate;
    const usdAmount = params.fiatAmount * rate;
    return {
      tokensToMint: new BN(Math.round(usdAmount * multiplier)),
      exchangeRate: rate,
      source: oraclePrice.source,
    };
  }

  static computeCpiAdjustedAmount(params: {
    baseAmount: BN;
    cpiConfig: CpiConfig;
    decimals: number;
  }): { adjustedAmount: BN; inflationMultiplier: number } {
    const multiplier = params.cpiConfig.currentIndex / params.cpiConfig.baselineIndex;
    const adjusted = Math.round(params.baseAmount.toNumber() * multiplier);
    return {
      adjustedAmount: new BN(adjusted),
      inflationMultiplier: multiplier,
    };
  }

  static buildCpiAttestation(cpiConfig: CpiConfig): { hash: number[]; data: string } {
    const data = JSON.stringify(cpiConfig);
    const hash = createHash("sha256").update(data).digest();
    return { hash: Array.from(hash), data };
  }
}
