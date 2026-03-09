import { Connection, PublicKey } from "@solana/web3.js";

// Pyth price feed account offsets (V2 format)
const PYTH_PRICE_OFFSET = 208;
const PYTH_CONF_OFFSET = 216;
const PYTH_STATUS_OFFSET = 224;
const PYTH_EXPO_OFFSET = 20;
const PYTH_PUBLISH_TIME_OFFSET = 232;

export interface PriceData {
  price: number;
  confidence: number;
  exponent: number;
  status: "trading" | "halted" | "unknown";
  publishTime: number;
  feedAddress: string;
}

export interface PegStatus {
  price: number;
  targetPrice: number;
  deviationBps: number;
  toleranceBps: number;
  isPegged: boolean;
  status: "pegged" | "depegged" | "warning";
}

export class PriceFeedMonitor {
  constructor(private connection: Connection) {}

  async getPrice(feedAddress: PublicKey): Promise<PriceData> {
    const accountInfo = await this.connection.getAccountInfo(feedAddress);
    if (!accountInfo)
      throw new Error(
        `Price feed account not found: ${feedAddress.toBase58()}`
      );

    const data = accountInfo.data;
    const exponent = data.readInt32LE(PYTH_EXPO_OFFSET);
    const price = Number(data.readBigInt64LE(PYTH_PRICE_OFFSET));
    const confidence = Number(data.readBigUInt64LE(PYTH_CONF_OFFSET));
    const statusVal = data.readUInt32LE(PYTH_STATUS_OFFSET);
    const publishTime = Number(data.readBigInt64LE(PYTH_PUBLISH_TIME_OFFSET));

    const priceFloat = price * Math.pow(10, exponent);
    const confFloat = confidence * Math.pow(10, exponent);

    return {
      price: priceFloat,
      confidence: confFloat,
      exponent,
      status:
        statusVal === 1 ? "trading" : statusVal === 2 ? "halted" : "unknown",
      publishTime,
      feedAddress: feedAddress.toBase58(),
    };
  }

  async checkPeg(
    feedAddress: PublicKey,
    targetPrice: number = 1.0,
    toleranceBps: number = 50
  ): Promise<PegStatus> {
    const priceData = await this.getPrice(feedAddress);
    const deviationBps =
      Math.abs((priceData.price - targetPrice) / targetPrice) * 10000;

    let status: "pegged" | "depegged" | "warning";
    if (deviationBps <= toleranceBps) {
      status = "pegged";
    } else if (deviationBps <= toleranceBps * 2) {
      status = "warning";
    } else {
      status = "depegged";
    }

    return {
      price: priceData.price,
      targetPrice,
      deviationBps: Math.round(deviationBps * 100) / 100,
      toleranceBps,
      isPegged: status === "pegged",
      status,
    };
  }

  async getMultiplePrices(feeds: PublicKey[]): Promise<PriceData[]> {
    const accounts = await this.connection.getMultipleAccountsInfo(feeds);
    return accounts.map((accountInfo, i) => {
      if (!accountInfo)
        throw new Error(`Price feed not found: ${feeds[i].toBase58()}`);
      const data = accountInfo.data;
      const exponent = data.readInt32LE(PYTH_EXPO_OFFSET);
      const price = Number(data.readBigInt64LE(PYTH_PRICE_OFFSET));
      const confidence = Number(data.readBigUInt64LE(PYTH_CONF_OFFSET));
      const statusVal = data.readUInt32LE(PYTH_STATUS_OFFSET);
      const publishTime = Number(
        data.readBigInt64LE(PYTH_PUBLISH_TIME_OFFSET)
      );

      return {
        price: price * Math.pow(10, exponent),
        confidence: confidence * Math.pow(10, exponent),
        exponent,
        status: (
          statusVal === 1 ? "trading" : statusVal === 2 ? "halted" : "unknown"
        ) as PriceData["status"],
        publishTime,
        feedAddress: feeds[i].toBase58(),
      };
    });
  }
}
