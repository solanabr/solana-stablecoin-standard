import { PublicKey, Connection, TransactionMessage, VersionedTransaction } from '@solana/web3.js';

const ORACLE_PROGRAM_ID = new PublicKey('OrcL8pRf5G8ZxqkNBhREedUiXK3X4LC5GFDnGkuSvCn');

export enum OracleProvider {
  Pyth = 0,
  Switchboard = 1,
}

export enum BaseCurrency {
  USD = 0,
  EUR = 1,
  BRL = 2,
  GBP = 3,
  JPY = 4,
  CPI = 5,
  Custom = 6,
}

export interface OracleFeedConfig {
  authority: PublicKey;
  mint: PublicKey;
  provider: OracleProvider;
  feedAddress: PublicKey;
  baseCurrency: BaseCurrency;
  maxStalenessSecs: number;
  maxDeviationBps: number;
  targetPrice: number;
  lastPrice: number;
  lastUpdateTs: number;
  active: boolean;
}

export interface PriceQuote {
  price: number;
  confidence: number;
  timestamp: number;
  withinPeg: boolean;
}

// PDA derivation
export function findOracleConfigPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('oracle-config'), mint.toBuffer()],
    ORACLE_PROGRAM_ID
  );
}

// Parse on-chain oracle config account
export function parseOracleConfig(data: Buffer): OracleFeedConfig {
  let offset = 8; // skip discriminator

  const authority = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const mint = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const provider = data[offset++] as OracleProvider;
  const feedAddress = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const baseCurrency = data[offset++] as BaseCurrency;
  const maxStalenessSecs = Number(data.readBigUInt64LE(offset)); offset += 8;
  const maxDeviationBps = data.readUInt16LE(offset); offset += 2;
  const targetPrice = Number(data.readBigUInt64LE(offset)); offset += 8;
  const lastPrice = Number(data.readBigUInt64LE(offset)); offset += 8;
  const lastUpdateTs = Number(data.readBigInt64LE(offset)); offset += 8;
  const active = !!data[offset++];

  return {
    authority, mint, provider, feedAddress, baseCurrency,
    maxStalenessSecs, maxDeviationBps, targetPrice, lastPrice,
    lastUpdateTs, active,
  };
}

/**
 * Oracle pricing client for SSS stablecoins.
 *
 * @example
 * ```ts
 * const oracle = new OraclePricing(connection, mintPubkey);
 * const config = await oracle.getConfig();
 * console.log(`Current price: ${config.lastPrice / 1e8}`);
 * console.log(`Target peg: ${config.targetPrice / 1e8}`);
 * ```
 */
export class OraclePricing {
  private connection: Connection;
  private mint: PublicKey;
  private configPDA: PublicKey;

  constructor(connection: Connection, mint: PublicKey) {
    this.connection = connection;
    this.mint = mint;
    const [pda] = findOracleConfigPDA(mint);
    this.configPDA = pda;
  }

  async getConfig(): Promise<OracleFeedConfig | null> {
    const info = await this.connection.getAccountInfo(this.configPDA);
    if (!info) return null;
    return parseOracleConfig(Buffer.from(info.data));
  }

  /**
   * Get the current price from the oracle, normalized to a human-readable number.
   * Returns null if oracle is not configured or price is stale.
   */
  async getCurrentPrice(): Promise<{ price: number; stale: boolean; deviationBps: number } | null> {
    const config = await this.getConfig();
    if (!config || !config.active) return null;

    const now = Math.floor(Date.now() / 1000);
    const age = now - config.lastUpdateTs;
    const stale = age > config.maxStalenessSecs;

    const price = config.lastPrice / 1e8;
    const target = config.targetPrice / 1e8;
    const deviation = Math.abs(price - target);
    const deviationBps = Math.round((deviation / target) * 10000);

    return { price, stale, deviationBps };
  }

  /**
   * Calculate the token amount for a given collateral amount based on current oracle price.
   * Useful for mint/redeem pricing with non-USD pegs.
   *
   * @param collateralAmount - Amount of collateral (in base currency)
   * @param decimals - Token decimals
   * @returns Token amount to mint, or null if price unavailable
   */
  async calculateMintAmount(collateralAmount: number, decimals: number): Promise<number | null> {
    const priceData = await this.getCurrentPrice();
    if (!priceData || priceData.stale) return null;

    // tokens = collateral / price
    return Math.floor((collateralAmount / priceData.price) * Math.pow(10, decimals));
  }

  /**
   * Calculate the collateral amount for redeeming tokens.
   *
   * @param tokenAmount - Raw token amount (with decimals)
   * @param decimals - Token decimals
   * @returns Collateral amount in base currency
   */
  async calculateRedeemAmount(tokenAmount: number, decimals: number): Promise<number | null> {
    const priceData = await this.getCurrentPrice();
    if (!priceData || priceData.stale) return null;

    // collateral = tokens * price
    return (tokenAmount / Math.pow(10, decimals)) * priceData.price;
  }

  /**
   * Check if the current price is within peg tolerance.
   */
  async isWithinPeg(): Promise<boolean> {
    const config = await this.getConfig();
    if (!config || !config.active) return false;

    const priceData = await this.getCurrentPrice();
    if (!priceData || priceData.stale) return false;

    return priceData.deviationBps <= config.maxDeviationBps;
  }
}

// Well-known Pyth feed addresses (devnet)
export const PYTH_FEEDS = {
  'SOL/USD': new PublicKey('J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix'),
  'BTC/USD': new PublicKey('HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J'),
  'ETH/USD': new PublicKey('EdVCmQ9FSPcVe5YySXDPCRmc8aDQLKJ9GvYRk8oEumzn'),
  'EUR/USD': new PublicKey('CbwQQsJCkFWvRz28QZ1GbVRTjPDccp5a9GnCAioD5bQp'),
  'GBP/USD': new PublicKey('CRVvLErFo4cMrYn34FXfiGMDz1FZo4YRHwFbbcCnVm5p'),
};

// Well-known Switchboard V2 feed addresses (devnet)
export const SWITCHBOARD_FEEDS = {
  'SOL/USD': new PublicKey('GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR'),
  'BTC/USD': new PublicKey('8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6hesH3Ee'),
};
