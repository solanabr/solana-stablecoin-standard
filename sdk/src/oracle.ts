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

const PYTH_MAINNET_PROGRAM_ID = new PublicKey(
  "FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH"
);

const PYTH_DEVNET_PROGRAM_ID = new PublicKey(
  "gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s"
);

export class OracleModule {
  readonly connection: Connection;
  readonly pythProgramId: PublicKey;

  constructor(connection: Connection, config?: OracleConfig) {
    this.connection = connection;
    this.pythProgramId = config?.pythProgramId ?? PYTH_MAINNET_PROGRAM_ID;
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
}
