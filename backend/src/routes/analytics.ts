import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { getSolanaConnection } from '../utils/solana.js';

const router = Router();

/**
 * @swagger
 * /api/v1/analytics/overview:
 *   get:
 *     summary: Get analytics overview
 *     tags: [Analytics]
 *     responses:
 *       200:
 *         description: Analytics overview
 */
router.get('/overview', asyncHandler(async (_req: Request, res: Response) => {
  // In production, these would be computed from indexed data
  const overview = {
    totalSupply: '1000000000000000', // 1T units
    circulatingSupply: '750000000000000',
    totalHolders: 15432,
    activeHolders24h: 2341,
    totalTransactions: 892341,
    transactions24h: 12453,
    volume24h: '45000000000000', // $45M
    volume7d: '312000000000000', // $312M
    uniqueUsers24h: 3421,
    avgTransactionSize: '3612500000', // $3,612.50
    largestTransaction24h: '100000000000000', // $100M
    confidentialTransfers: {
      total: 45231,
      last24h: 1234,
      percentageOfTotal: 13.8,
    },
    transferFees: {
      collected24h: '125000000000', // $125k
      collected7d: '875000000000', // $875k
      collectedTotal: '15000000000000', // $15M
    },
    compliance: {
      frozenAccounts: 12,
      complianceAlerts24h: 3,
      successfulAudits: 156,
    },
    timestamp: new Date().toISOString(),
  };

  res.json({
    success: true,
    data: overview,
  });
}));

/**
 * @swagger
 * /api/v1/analytics/supply:
 *   get:
 *     summary: Get supply history
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [24h, 7d, 30d, 90d, 1y]
 *           default: 7d
 *     responses:
 *       200:
 *         description: Supply history data
 */
router.get('/supply', asyncHandler(async (req: Request, res: Response) => {
  const range = (req.query.range as string) || '7d';
  
  // Generate mock time series data
  const dataPoints = generateTimeSeriesData(range, 'supply');

  res.json({
    success: true,
    data: {
      range,
      dataPoints,
      summary: {
        start: dataPoints[0]?.value,
        end: dataPoints[dataPoints.length - 1]?.value,
        change: '+5.2%',
        high: Math.max(...dataPoints.map(d => Number(d.value))),
        low: Math.min(...dataPoints.map(d => Number(d.value))),
      },
    },
  });
}));

/**
 * @swagger
 * /api/v1/analytics/transactions:
 *   get:
 *     summary: Get transaction analytics
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [24h, 7d, 30d, 90d]
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [hour, day, week]
 *     responses:
 *       200:
 *         description: Transaction analytics
 */
router.get('/transactions', asyncHandler(async (req: Request, res: Response) => {
  const range = (req.query.range as string) || '7d';
  const groupBy = (req.query.groupBy as string) || 'day';

  const dataPoints = generateTimeSeriesData(range, 'transactions');

  res.json({
    success: true,
    data: {
      range,
      groupBy,
      dataPoints,
      breakdown: {
        transfers: 78.5,
        confidentialTransfers: 13.8,
        mints: 4.2,
        burns: 2.1,
        other: 1.4,
      },
      avgPerPeriod: 12453,
      peakPeriod: {
        timestamp: new Date().toISOString(),
        count: 23412,
      },
    },
  });
}));

/**
 * @swagger
 * /api/v1/analytics/volume:
 *   get:
 *     summary: Get volume analytics
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [24h, 7d, 30d, 90d]
 *     responses:
 *       200:
 *         description: Volume analytics
 */
router.get('/volume', asyncHandler(async (req: Request, res: Response) => {
  const range = (req.query.range as string) || '7d';
  const dataPoints = generateTimeSeriesData(range, 'volume');

  res.json({
    success: true,
    data: {
      range,
      dataPoints,
      summary: {
        total: '312000000000000',
        avgPerDay: '44571428571428',
        peak: '85000000000000',
        peakDate: '2026-03-10',
      },
    },
  });
}));

/**
 * @swagger
 * /api/v1/analytics/holders:
 *   get:
 *     summary: Get holder distribution
 *     tags: [Analytics]
 *     responses:
 *       200:
 *         description: Holder distribution
 */
router.get('/holders', asyncHandler(async (_req: Request, res: Response) => {
  const distribution = {
    totalHolders: 15432,
    distribution: [
      { range: '< 100', holders: 8234, percentage: 53.4 },
      { range: '100 - 1K', holders: 4532, percentage: 29.4 },
      { range: '1K - 10K', holders: 1876, percentage: 12.2 },
      { range: '10K - 100K', holders: 612, percentage: 4.0 },
      { range: '100K - 1M', holders: 143, percentage: 0.9 },
      { range: '> 1M', holders: 35, percentage: 0.2 },
    ],
    topHolders: [
      { rank: 1, address: 'Treasury...', balance: '100000000000000', percentage: 10.0 },
      { rank: 2, address: 'Exchange1...', balance: '75000000000000', percentage: 7.5 },
      { rank: 3, address: 'Exchange2...', balance: '50000000000000', percentage: 5.0 },
      { rank: 4, address: 'Fund1...', balance: '35000000000000', percentage: 3.5 },
      { rank: 5, address: 'Whale1...', balance: '25000000000000', percentage: 2.5 },
    ],
    gini: 0.72, // Wealth concentration coefficient
    timestamp: new Date().toISOString(),
  };

  res.json({
    success: true,
    data: distribution,
  });
}));

/**
 * @swagger
 * /api/v1/analytics/confidential:
 *   get:
 *     summary: Get confidential transfer analytics
 *     tags: [Analytics]
 *     responses:
 *       200:
 *         description: CT analytics
 */
router.get('/confidential', asyncHandler(async (_req: Request, res: Response) => {
  const ctAnalytics = {
    totalCTTransactions: 45231,
    ctVolume: '89000000000000',
    ctPercentage: 13.8,
    breakdown: {
      deposits: 15234,
      transfers: 25421,
      withdrawals: 4576,
    },
    avgPendingTime: '45 seconds',
    proofSuccessRate: 99.98,
    trend: '+23.5%', // vs previous period
    topCTAccounts: 234,
    timestamp: new Date().toISOString(),
  };

  res.json({
    success: true,
    data: ctAnalytics,
  });
}));

/**
 * @swagger
 * /api/v1/analytics/fees:
 *   get:
 *     summary: Get transfer fee analytics
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: [24h, 7d, 30d, 90d]
 *     responses:
 *       200:
 *         description: Fee analytics
 */
router.get('/fees', asyncHandler(async (req: Request, res: Response) => {
  const range = (req.query.range as string) || '7d';
  const dataPoints = generateTimeSeriesData(range, 'fees');

  res.json({
    success: true,
    data: {
      range,
      dataPoints,
      summary: {
        totalCollected: '875000000000',
        avgPerTransaction: '70000',
        feeRate: '0.50%',
        maxFee: '1000000',
        pendingWithdrawal: '125000000000',
      },
    },
  });
}));

/**
 * @swagger
 * /api/v1/analytics/network:
 *   get:
 *     summary: Get network status
 *     tags: [Analytics]
 *     responses:
 *       200:
 *         description: Network analytics
 */
router.get('/network', asyncHandler(async (_req: Request, res: Response) => {
  const connection = getSolanaConnection();
  
  try {
    const [slot, blockHeight, version] = await Promise.all([
      connection.getSlot(),
      connection.getBlockHeight(),
      connection.getVersion(),
    ]);

    res.json({
      success: true,
      data: {
        network: process.env.SOLANA_NETWORK || 'devnet',
        rpcEndpoint: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
        currentSlot: slot,
        blockHeight,
        version: version['solana-core'],
        status: 'healthy',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to fetch network status:', error);
    res.json({
      success: true,
      data: {
        network: process.env.SOLANA_NETWORK || 'devnet',
        status: 'degraded',
        error: 'Failed to connect to RPC',
        timestamp: new Date().toISOString(),
      },
    });
  }
}));

// Helper function to generate mock time series data
function generateTimeSeriesData(
  range: string,
  type: 'supply' | 'transactions' | 'volume' | 'fees'
): Array<{ timestamp: string; value: string }> {
  const now = Date.now();
  const points: Array<{ timestamp: string; value: string }> = [];
  
  let intervals: number;
  let intervalMs: number;
  
  switch (range) {
    case '24h':
      intervals = 24;
      intervalMs = 60 * 60 * 1000;
      break;
    case '7d':
      intervals = 7;
      intervalMs = 24 * 60 * 60 * 1000;
      break;
    case '30d':
      intervals = 30;
      intervalMs = 24 * 60 * 60 * 1000;
      break;
    case '90d':
      intervals = 90;
      intervalMs = 24 * 60 * 60 * 1000;
      break;
    default:
      intervals = 7;
      intervalMs = 24 * 60 * 60 * 1000;
  }

  const baseValues: Record<string, number> = {
    supply: 1000000000000000,
    transactions: 12000,
    volume: 45000000000000,
    fees: 125000000000,
  };

  for (let i = intervals - 1; i >= 0; i--) {
    const timestamp = new Date(now - i * intervalMs).toISOString();
    const variance = (Math.random() - 0.5) * 0.1; // ±5% variance
    const value = Math.round(baseValues[type] * (1 + variance));
    points.push({ timestamp, value: value.toString() });
  }

  return points;
}

export const analyticsRoutes = router;
