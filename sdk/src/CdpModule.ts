import {
  Connection,
  PublicKey,
  TransactionSignature,
} from '@solana/web3.js';
import { AnchorProvider, BN, Program } from '@coral-xyz/anchor';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { parsePriceData } from '@pythnetwork/client';

import { SSS_TOKEN_PROGRAM_ID } from './SolanaStablecoin';

// ─── Constants ─────────────────────────────────────────────────────────────

const COLLATERAL_VAULT_SEED = Buffer.from('cdp-collateral-vault');
const CDP_POSITION_SEED = Buffer.from('cdp-position');
const STABLECOIN_CONFIG_SEED = Buffer.from('stablecoin-config');

/** Minimum collateral ratio: 150% (15_000 bps) */
const MIN_COLLATERAL_RATIO_BPS = 15_000;
/** Liquidation threshold: 120% (12_000 bps) */
const LIQUIDATION_THRESHOLD_BPS = 12_000;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CollateralEntry {
  /** SPL token mint of this collateral type */
  mint: PublicKey;
  /** Amount deposited (in collateral token's native units) */
  deposited: bigint;
  /** CollateralVault PDA address */
  vaultPda: PublicKey;
  /** Token account that holds the collateral */
  vaultTokenAccount: PublicKey;
}

export interface CdpPosition {
  /** Wallet that owns this CDP */
  owner: PublicKey;
  /** All collateral entries for this user */
  collateral: CollateralEntry[];
  /** Total SSS tokens borrowed (outstanding debt), in SSS base units */
  debtUsdc: number;
  /**
   * Current collateral ratio as a percentage (e.g. 1.5 = 150%).
   * `Infinity` when debt is 0.
   */
  ratio: number;
  /**
   * Health factor: collateral_value_usd / (debt_usd * liquidation_threshold).
   * Values < 1 indicate the position is liquidatable.
   * `Infinity` when debt is 0.
   */
  healthFactor: number;
  /**
   * Estimated price (USD per collateral unit) at which the position would be
   * liquidated (first collateral entry used for simplicity).
   * `0` when no collateral or debt is 0.
   */
  liquidationPrice: number;
}

/**
 * Describes a collateral type accepted by the CDP system.
 * Returned by `fetchCollateralTypes`.
 */
export interface CollateralType {
  /** SPL token mint address for this collateral */
  mint: PublicKey;
  /** Number of active CollateralVault PDAs using this mint */
  activeVaults: number;
  /** Total collateral deposited across all vaults for this mint (native units) */
  totalDeposited: bigint;
  /** Current USD price per native unit, if a Pyth feed account was provided */
  usdPrice?: number;
  /** Pyth price feed account for this collateral type, if known */
  pythPriceFeed?: PublicKey;
}

export interface DepositCollateralParams {
  /** The SSS-3 stablecoin mint */
  sssMint: PublicKey;
  /** The collateral SPL token mint */
  collateralMint: PublicKey;
  /** Amount to deposit (in collateral token's native units) */
  amount: bigint;
  /** User's source token account for the collateral */
  userCollateralAccount: PublicKey;
  /** Token account owned by the collateral vault PDA that holds collateral */
  vaultTokenAccount: PublicKey;
  /** Token program for the collateral mint (defaults to TOKEN_PROGRAM_ID) */
  collateralTokenProgram?: PublicKey;
}

export interface BorrowStableParams {
  /** The SSS-3 stablecoin mint */
  sssMint: PublicKey;
  /** The collateral SPL token mint being borrowed against */
  collateralMint: PublicKey;
  /** Amount of SSS tokens to borrow (base units) */
  amount: bigint;
  /** User's SSS token account to receive minted stablecoins */
  userSssAccount: PublicKey;
  /** Pyth price feed account for collateral/USD */
  pythPriceFeed: PublicKey;
  /** Token program for the collateral mint */
  collateralTokenProgram?: PublicKey;
}

export interface RepayStableParams {
  /** The SSS-3 stablecoin mint */
  sssMint: PublicKey;
  /** The collateral SPL token mint */
  collateralMint: PublicKey;
  /** Amount of SSS tokens to repay (base units) */
  amount: bigint;
  /** User's SSS token account to burn from */
  userSssAccount: PublicKey;
  /** Token account owned by the vault PDA that receives released collateral */
  vaultTokenAccount: PublicKey;
  /** User's collateral token account to receive released collateral */
  userCollateralAccount: PublicKey;
  /** Token program for the collateral mint */
  collateralTokenProgram?: PublicKey;
}

// ─── PDA helpers ─────────────────────────────────────────────────────────────

function getConfigPda(sssMint: PublicKey, programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [STABLECOIN_CONFIG_SEED, sssMint.toBuffer()],
    programId,
  );
  return pda;
}

function getCollateralVaultPda(
  sssMint: PublicKey,
  user: PublicKey,
  collateralMint: PublicKey,
  programId: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      COLLATERAL_VAULT_SEED,
      sssMint.toBuffer(),
      user.toBuffer(),
      collateralMint.toBuffer(),
    ],
    programId,
  );
  return pda;
}

function getCdpPositionPda(
  sssMint: PublicKey,
  user: PublicKey,
  programId: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [CDP_POSITION_SEED, sssMint.toBuffer(), user.toBuffer()],
    programId,
  );
  return pda;
}

// ─── CdpModule ────────────────────────────────────────────────────────────────

/**
 * SDK module for the Direction 2 Multi-Collateral CDP system.
 *
 * Wraps the four on-chain CDP instructions:
 *  - `cdp_deposit_collateral`
 *  - `cdp_borrow_stable`
 *  - `cdp_repay_stable`
 *  - `cdp_liquidate` (via `getPosition` helper for off-chain monitoring)
 *
 * @example
 * ```ts
 * const cdp = new CdpModule(provider, sssMint);
 * await cdp.depositCollateral({ collateralMint, amount: 1_000_000n, ... });
 * await cdp.borrowStable({ collateralMint, amount: 500_000n, ... });
 * const pos = await cdp.getPosition(wallet.publicKey, connection);
 * ```
 */
export class CdpModule {
  private readonly provider: AnchorProvider;
  private readonly sssMint: PublicKey;
  private readonly programId: PublicKey;
  private _program: any | null = null;

  constructor(
    provider: AnchorProvider,
    sssMint: PublicKey,
    programId: PublicKey = SSS_TOKEN_PROGRAM_ID,
  ) {
    this.provider = provider;
    this.sssMint = sssMint;
    this.programId = programId;
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private async _loadProgram(): Promise<any> {
    if (this._program) return this._program;
    const idl = await import('./idl/sss_token.json');
    this._program = new Program(
      { ...(idl as any), address: this.programId.toBase58() },
      this.provider,
    ) as any;
    return this._program;
  }

  // ─── depositCollateral ───────────────────────────────────────────────────

  /**
   * Deposit SPL token collateral into the user's per-collateral vault.
   *
   * Creates the `CollateralVault` PDA on first deposit for this collateral type.
   * The `vaultTokenAccount` must already exist and be owned by the vault PDA.
   */
  async depositCollateral(
    params: DepositCollateralParams,
  ): Promise<TransactionSignature> {
    const program = await this._loadProgram();
    const user = this.provider.wallet.publicKey;
    const configPda = getConfigPda(this.sssMint, this.programId);
    const collateralVaultPda = getCollateralVaultPda(
      this.sssMint,
      user,
      params.collateralMint,
      this.programId,
    );
    const tokenProgram = params.collateralTokenProgram ?? TOKEN_PROGRAM_ID;

    return program.methods
      .cdpDepositCollateral(new BN(params.amount.toString()))
      .accounts({
        user,
        config: configPda,
        sssMint: this.sssMint,
        collateralMint: params.collateralMint,
        collateralVault: collateralVaultPda,
        vaultTokenAccount: params.vaultTokenAccount,
        userCollateralAccount: params.userCollateralAccount,
        tokenProgram,
        systemProgram: (await import('@solana/web3.js')).SystemProgram.programId,
      })
      .rpc({ commitment: 'confirmed' });
  }

  // ─── borrowStable ────────────────────────────────────────────────────────

  /**
   * Borrow SSS-3 stablecoins against deposited collateral.
   *
   * Enforces ≥150% collateral ratio using a Pyth price feed.
   * Creates the `CdpPosition` PDA on first borrow.
   */
  async borrowStable(
    params: BorrowStableParams,
  ): Promise<TransactionSignature> {
    const program = await this._loadProgram();
    const user = this.provider.wallet.publicKey;
    const configPda = getConfigPda(this.sssMint, this.programId);
    const collateralVaultPda = getCollateralVaultPda(
      this.sssMint,
      user,
      params.collateralMint,
      this.programId,
    );
    const cdpPositionPda = getCdpPositionPda(this.sssMint, user, this.programId);
    const tokenProgram = params.collateralTokenProgram ?? TOKEN_2022_PROGRAM_ID;

    return program.methods
      .cdpBorrowStable(new BN(params.amount.toString()))
      .accounts({
        user,
        config: configPda,
        sssMint: this.sssMint,
        collateralMint: params.collateralMint,
        collateralVault: collateralVaultPda,
        cdpPosition: cdpPositionPda,
        userSssAccount: params.userSssAccount,
        pythPriceFeed: params.pythPriceFeed,
        tokenProgram,
        systemProgram: (await import('@solana/web3.js')).SystemProgram.programId,
      })
      .rpc({ commitment: 'confirmed' });
  }

  // ─── repayStable ─────────────────────────────────────────────────────────

  /**
   * Repay SSS-3 stablecoin debt, burning tokens and releasing collateral
   * proportionally from the vault.
   */
  async repayStable(
    params: RepayStableParams,
  ): Promise<TransactionSignature> {
    const program = await this._loadProgram();
    const user = this.provider.wallet.publicKey;
    const configPda = getConfigPda(this.sssMint, this.programId);
    const collateralVaultPda = getCollateralVaultPda(
      this.sssMint,
      user,
      params.collateralMint,
      this.programId,
    );
    const cdpPositionPda = getCdpPositionPda(this.sssMint, user, this.programId);
    const tokenProgram = params.collateralTokenProgram ?? TOKEN_PROGRAM_ID;

    return program.methods
      .cdpRepayStable(new BN(params.amount.toString()))
      .accounts({
        user,
        config: configPda,
        sssMint: this.sssMint,
        collateralMint: params.collateralMint,
        collateralVault: collateralVaultPda,
        cdpPosition: cdpPositionPda,
        userSssAccount: params.userSssAccount,
        vaultTokenAccount: params.vaultTokenAccount,
        userCollateralAccount: params.userCollateralAccount,
        sssTokenProgram: TOKEN_2022_PROGRAM_ID,
        collateralTokenProgram: tokenProgram,
      })
      .rpc({ commitment: 'confirmed' });
  }

  // ─── getPosition ─────────────────────────────────────────────────────────

  /**
   * Fetch the full CDP position for a wallet across all collateral types.
   *
   * Reads on-chain `CdpPosition` and all associated `CollateralVault` PDAs.
   * Health metrics are computed client-side; prices are NOT fetched here —
   * pass `collateralUsdPrices` (mint→price) to get accurate ratio/health.
   *
   * @param wallet        - The wallet to query
   * @param connection    - Solana connection
   * @param collateralMints  - List of collateral mints to check vaults for
   * @param collateralUsdPrices - Optional map of mint → USD price per base unit
   */
  async getPosition(
    wallet: PublicKey,
    connection: Connection,
    collateralMints: PublicKey[] = [],
    collateralUsdPrices?: Map<string, number>,
  ): Promise<CdpPosition> {
    const program = await this._loadProgram();
    const cdpPositionPda = getCdpPositionPda(this.sssMint, wallet, this.programId);

    // Fetch CdpPosition on-chain; if it doesn't exist, return zeroed position
    let debtAmount = 0n;
    try {
      const positionAccount = await program.account.cdpPosition.fetch(cdpPositionPda);
      debtAmount = BigInt(positionAccount.debtAmount.toString());
    } catch {
      // Position doesn't exist yet — return empty
      return {
        owner: wallet,
        collateral: [],
        debtUsdc: 0,
        ratio: Infinity,
        healthFactor: Infinity,
        liquidationPrice: 0,
      };
    }

    // Fetch all collateral vaults
    const collateralEntries: CollateralEntry[] = [];
    for (const mint of collateralMints) {
      const vaultPda = getCollateralVaultPda(this.sssMint, wallet, mint, this.programId);
      try {
        const vaultAccount = await program.account.collateralVault.fetch(vaultPda);
        collateralEntries.push({
          mint,
          deposited: BigInt(vaultAccount.depositedAmount.toString()),
          vaultPda,
          vaultTokenAccount: vaultAccount.vaultTokenAccount,
        });
      } catch {
        // Vault doesn't exist for this mint — skip
      }
    }

    // Compute health metrics
    const debtUsdc = Number(debtAmount) / 1e6;

    if (debtAmount === 0n) {
      return {
        owner: wallet,
        collateral: collateralEntries,
        debtUsdc: 0,
        ratio: Infinity,
        healthFactor: Infinity,
        liquidationPrice: 0,
      };
    }

    // Total collateral value in USD (requires price map)
    let totalCollateralUsd = 0;
    if (collateralUsdPrices && collateralUsdPrices.size > 0) {
      for (const entry of collateralEntries) {
        const price = collateralUsdPrices.get(entry.mint.toBase58()) ?? 0;
        totalCollateralUsd += (Number(entry.deposited) / 1e6) * price;
      }
    }

    const ratio = totalCollateralUsd > 0 ? totalCollateralUsd / debtUsdc : 0;
    const liquidationRatio = LIQUIDATION_THRESHOLD_BPS / 10_000; // 1.2
    const healthFactor =
      totalCollateralUsd > 0 ? totalCollateralUsd / (debtUsdc * liquidationRatio) : 0;

    // Liquidation price for first collateral entry
    let liquidationPrice = 0;
    if (collateralEntries.length > 0 && debtAmount > 0n) {
      const firstEntry = collateralEntries[0];
      const depositedUnits = Number(firstEntry.deposited) / 1e6;
      if (depositedUnits > 0) {
        // Price at which value = debt * liquidation_threshold
        liquidationPrice = (debtUsdc * liquidationRatio) / depositedUnits;
      }
    }

    return {
      owner: wallet,
      collateral: collateralEntries,
      debtUsdc,
      ratio,
      healthFactor,
      liquidationPrice,
    };
  }

  // ─── fetchCdpPosition ────────────────────────────────────────────────────

  /**
   * Fetch a wallet's CDP position, reading live Pyth oracle prices for each
   * collateral type to compute accurate health metrics.
   *
   * Automatically discovers all collateral vaults for the wallet by scanning
   * on-chain `CollateralVault` PDAs. Pyth prices are fetched for each vault's
   * collateral mint when `pythFeeds` is supplied.
   *
   * @param wallet       - The wallet to query
   * @param connection   - Solana connection
   * @param pythFeeds    - Optional map of collateral mint → Pyth price feed PublicKey
   */
  async fetchCdpPosition(
    wallet: PublicKey,
    connection: Connection,
    pythFeeds?: Map<string, PublicKey>,
  ): Promise<CdpPosition> {
    const program = await this._loadProgram();
    const cdpPositionPda = getCdpPositionPda(this.sssMint, wallet, this.programId);

    // 1. Try to fetch on-chain CdpPosition
    let debtAmount = 0n;
    let lockedCollateralMint: PublicKey | null = null;
    try {
      const positionAccount = await program.account.cdpPosition.fetch(cdpPositionPda);
      debtAmount = BigInt(positionAccount.debtAmount.toString());
      if (positionAccount.collateralMint && !positionAccount.collateralMint.equals(PublicKey.default)) {
        lockedCollateralMint = positionAccount.collateralMint as PublicKey;
      }
    } catch {
      return {
        owner: wallet,
        collateral: [],
        debtUsdc: 0,
        ratio: Infinity,
        healthFactor: Infinity,
        liquidationPrice: 0,
      };
    }

    // 2. Discover collateral vaults for this wallet via getProgramAccounts
    const COLLATERAL_VAULT_DISCRIMINATOR = Buffer.from([
      0xdd, 0xf0, 0xee, 0x06, 0xf8, 0x78, 0x4c, 0x5e,
    ]);
    const vaultAccounts = await connection.getProgramAccounts(this.programId, {
      filters: [
        { memcmp: { offset: 0, bytes: COLLATERAL_VAULT_DISCRIMINATOR.toString('base64') } },
        { memcmp: { offset: 8, bytes: wallet.toBase58() } }, // owner field
      ],
    });

    const collateralEntries: CollateralEntry[] = [];
    const collateralUsdPrices = new Map<string, number>();

    // 3. Fetch Pyth prices for known feeds
    if (pythFeeds && pythFeeds.size > 0) {
      const feedKeys = Array.from(pythFeeds.values());
      const feedAccounts = await connection.getMultipleAccountsInfo(feedKeys);
      let i = 0;
      for (const [mintKey, feedPubkey] of pythFeeds.entries()) {
        const accountInfo = feedAccounts[i++];
        if (!accountInfo) continue;
        try {
          const priceData = parsePriceData(accountInfo.data);
          if (priceData.price !== undefined && priceData.price > 0) {
            collateralUsdPrices.set(mintKey, priceData.price);
          }
        } catch {
          // Price feed parse failed — skip
        }
      }
    }

    // 4. Parse vault accounts
    for (const { account } of vaultAccounts) {
      try {
        const vaultData = await program.account.collateralVault.coder.accounts.decode(
          'CollateralVault',
          account.data,
        );
        const vaultPda = getCollateralVaultPda(
          this.sssMint,
          wallet,
          vaultData.collateralMint as PublicKey,
          this.programId,
        );
        collateralEntries.push({
          mint: vaultData.collateralMint as PublicKey,
          deposited: BigInt(vaultData.depositedAmount.toString()),
          vaultPda,
          vaultTokenAccount: vaultData.vaultTokenAccount as PublicKey,
        });
      } catch {
        // Decode failed — skip
      }
    }

    // Fallback: if single-collateral position and no vaults found via scan, derive directly
    if (collateralEntries.length === 0 && lockedCollateralMint) {
      const vaultPda = getCollateralVaultPda(this.sssMint, wallet, lockedCollateralMint, this.programId);
      try {
        const vaultAccount = await program.account.collateralVault.fetch(vaultPda);
        collateralEntries.push({
          mint: lockedCollateralMint,
          deposited: BigInt(vaultAccount.depositedAmount.toString()),
          vaultPda,
          vaultTokenAccount: vaultAccount.vaultTokenAccount as PublicKey,
        });
      } catch { /* vault not found */ }
    }

    // 5. Compute health metrics
    const debtUsdc = Number(debtAmount) / 1e6;

    if (debtAmount === 0n) {
      return {
        owner: wallet,
        collateral: collateralEntries,
        debtUsdc: 0,
        ratio: Infinity,
        healthFactor: Infinity,
        liquidationPrice: 0,
      };
    }

    let totalCollateralUsd = 0;
    for (const entry of collateralEntries) {
      const price = collateralUsdPrices.get(entry.mint.toBase58()) ?? 0;
      totalCollateralUsd += (Number(entry.deposited) / 1e6) * price;
    }

    const ratio = totalCollateralUsd > 0 ? totalCollateralUsd / debtUsdc : 0;
    const liquidationRatio = LIQUIDATION_THRESHOLD_BPS / 10_000; // 1.2
    const healthFactor =
      totalCollateralUsd > 0 ? totalCollateralUsd / (debtUsdc * liquidationRatio) : 0;

    let liquidationPrice = 0;
    if (collateralEntries.length > 0 && debtAmount > 0n) {
      const firstEntry = collateralEntries[0];
      const depositedUnits = Number(firstEntry.deposited) / 1e6;
      if (depositedUnits > 0) {
        liquidationPrice = (debtUsdc * liquidationRatio) / depositedUnits;
      }
    }

    return {
      owner: wallet,
      collateral: collateralEntries,
      debtUsdc,
      ratio,
      healthFactor,
      liquidationPrice,
    };
  }

  // ─── fetchCollateralTypes ─────────────────────────────────────────────────

  /**
   * Enumerate all distinct collateral types currently in use across all CDP
   * positions for this SSS mint, by scanning on-chain `CollateralVault` PDAs.
   *
   * Optionally fetches live Pyth prices for each collateral type.
   *
   * @param connection    - Solana connection
   * @param pythFeeds     - Optional map of collateral mint → Pyth price feed PublicKey
   */
  async fetchCollateralTypes(
    connection: Connection,
    pythFeeds?: Map<string, PublicKey>,
  ): Promise<CollateralType[]> {
    const program = await this._loadProgram();

    // Fetch all CollateralVault PDAs for this program
    // Discriminator filter: first 8 bytes of sha256("account:CollateralVault")
    const COLLATERAL_VAULT_DISCRIMINATOR = Buffer.from([
      0xdd, 0xf0, 0xee, 0x06, 0xf8, 0x78, 0x4c, 0x5e,
    ]);

    const vaultAccounts = await connection.getProgramAccounts(this.programId, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: COLLATERAL_VAULT_DISCRIMINATOR.toString('base64'),
          },
        },
      ],
    });

    // Aggregate by collateral mint
    const mintStats = new Map<
      string,
      { mint: PublicKey; activeVaults: number; totalDeposited: bigint }
    >();

    for (const { account } of vaultAccounts) {
      try {
        const vaultData = program.coder.accounts.decode('CollateralVault', account.data);
        const mint = vaultData.collateralMint as PublicKey;
        const mintKey = mint.toBase58();
        const existing = mintStats.get(mintKey);
        const deposited = BigInt(vaultData.depositedAmount.toString());
        if (existing) {
          existing.activeVaults += 1;
          existing.totalDeposited += deposited;
        } else {
          mintStats.set(mintKey, { mint, activeVaults: 1, totalDeposited: deposited });
        }
      } catch {
        // Skip malformed accounts
      }
    }

    // Fetch Pyth prices if feeds are provided
    const priceMap = new Map<string, number>();
    if (pythFeeds && pythFeeds.size > 0) {
      const mintKeys = Array.from(pythFeeds.keys());
      const feedPubkeys = mintKeys.map((k) => pythFeeds.get(k)!);
      const feedAccounts = await connection.getMultipleAccountsInfo(feedPubkeys);

      for (let i = 0; i < mintKeys.length; i++) {
        const accountInfo = feedAccounts[i];
        if (!accountInfo) continue;
        try {
          const priceData = parsePriceData(accountInfo.data);
          if (priceData.price !== undefined && priceData.price > 0) {
            priceMap.set(mintKeys[i], priceData.price);
          }
        } catch {
          // Malformed price feed — skip
        }
      }
    }

    // Build result
    const result: CollateralType[] = [];
    for (const [mintKey, stats] of mintStats.entries()) {
      const pythPriceFeed = pythFeeds?.get(mintKey);
      result.push({
        mint: stats.mint,
        activeVaults: stats.activeVaults,
        totalDeposited: stats.totalDeposited,
        usdPrice: priceMap.get(mintKey),
        pythPriceFeed,
      });
    }

    return result;
  }

  // ─── PDA utilities ───────────────────────────────────────────────────────

  /** Derive the CollateralVault PDA for a (user, collateral mint) pair. */
  getCollateralVaultPda(user: PublicKey, collateralMint: PublicKey): PublicKey {
    return getCollateralVaultPda(this.sssMint, user, collateralMint, this.programId);
  }

  /** Derive the CdpPosition PDA for a user. */
  getCdpPositionPda(user: PublicKey): PublicKey {
    return getCdpPositionPda(this.sssMint, user, this.programId);
  }
}
