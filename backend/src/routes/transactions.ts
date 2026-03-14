import { Router, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { getSolanaConnection } from '../utils/solana.js';

const router = Router();

// ── Simple TTL in-memory cache ─────────────────────────────────────────────
interface CacheEntry<T> { data: T; expiresAt: number }
const cache = new Map<string, CacheEntry<unknown>>();
const TTL_MS = 15_000; // 15 s for live endpoints
const TTL_TX_MS = 10_000; // 10 s for tx list

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}
function cacheSet<T>(key: string, data: T, ttl = TTL_MS): void {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

const getTrackingAddress = (mint?: string): PublicKey => {
  const address = mint || process.env.SSS_TOKEN_MINT || process.env.SSS_PROGRAM_ID || '11111111111111111111111111111111';
  return new PublicKey(address);
};

const estimateTokenAmount = (tx: any): string => {
  if (!tx?.meta?.preTokenBalances?.length || !tx.meta.postTokenBalances?.length) {
    return '0';
  }

  const pre = tx.meta.preTokenBalances[0];
  const post = tx.meta.postTokenBalances.find((entry: any) => entry.mint === pre.mint);

  if (!pre || !post) {
    return '0';
  }

  const preAmount = Number(pre.uiTokenAmount.amount);
  const postAmount = Number(post.uiTokenAmount.amount);

  if (Number.isNaN(preAmount) || Number.isNaN(postAmount)) {
    return '0';
  }

  return Math.abs(postAmount - preAmount).toString();
};

const isLikelyConfidentialTx = (tx: any): boolean => {
  if (!tx) {
    return false;
  }

  const logs = tx.meta?.logMessages ?? [];
  const hasConfidentialLog = logs.some((log: string) => /confidential|elgamal|zk|proof/i.test(log));

  const hasToken2022Instruction = tx.transaction.message.instructions.some((instruction: any) => {
    if ('programId' in instruction) {
      return instruction.programId.toBase58() === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
    }
    return false;
  });

  return hasConfidentialLog || hasToken2022Instruction;
};

/**
 * @swagger
 * components:
 *   schemas:
 *     Transaction:
 *       type: object
 *       properties:
 *         signature:
 *           type: string
 *         blockTime:
 *           type: number
 *         slot:
 *           type: number
 *         type:
 *           type: string
 *           enum: [transfer, mint, burn, freeze, confidential_transfer]
 *         status:
 *           type: string
 *           enum: [success, failed]
 *         fee:
 *           type: number
 */

/**
 * @swagger
 * /api/v1/transactions:
 *   get:
 *     summary: List recent transactions
 *     tags: [Transactions]
 *     parameters:
 *       - in: query
 *         name: mint
 *         schema:
 *           type: string
 *         description: Filter by token mint
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [transfer, mint, burn, freeze, confidential_transfer]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of transactions
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { mint, type } = req.query;
  const limit = parseInt(req.query.limit as string) || 50;

  const cacheKey = `txList:${mint ?? 'default'}:${type ?? ''}:${limit}`;
  const cached = cacheGet<object>(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT');
    res.json(cached);
    return;
  }

  const connection = getSolanaConnection();
  const trackingAddress = getTrackingAddress(mint as string | undefined);

  const signatures = await connection.getSignaturesForAddress(trackingAddress, { limit });
  const transactions = signatures.map((entry) => ({
    signature: entry.signature,
    slot: entry.slot,
    blockTime: entry.blockTime,
    timestamp: entry.blockTime ? new Date(entry.blockTime * 1000).toISOString() : null,
    type: 'unknown',
    status: entry.err ? 'failed' : 'success',
    fee: null,
    mint: mint || process.env.SSS_TOKEN_MINT || null,
  }));

  const response = {
    success: true,
    data: {
      transactions: type ? transactions.filter(tx => tx.type === type) : transactions,
      pagination: { limit, hasMore: signatures.length === limit },
    },
  };
  cacheSet(cacheKey, response, TTL_TX_MS);
  res.set('X-Cache', 'MISS');
  res.json(response);
}));

/**
 * @swagger
 * /api/v1/transactions/confidential:
 *   get:
 *     summary: Get confidential transfer transactions
 *     tags: [Transactions]
 *     description: Returns CT transactions with ZK proof verification status
 *     parameters:
 *       - in: query
 *         name: mint
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of CT transactions
 */
router.get('/confidential', asyncHandler(async (req: Request, res: Response) => {
  const { mint } = req.query;
  const limit = parseInt(req.query.limit as string) || 50;

  const cacheKey = `ctTxList:${mint ?? 'default'}:${limit}`;
  const cached = cacheGet<object>(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT');
    res.json(cached);
    return;
  }

  const connection = getSolanaConnection();
  const trackingAddress = getTrackingAddress(mint as string | undefined);

  // Fetch only 2x the needed limit (not 3x/300), cap at 60 to avoid RPC blast
  const sigLimit = Math.min(limit * 2, 60);
  const signatures = await connection.getSignaturesForAddress(trackingAddress, { limit: sigLimit });

  // Fetch parsed txs in controlled batches of 10 to avoid parallel RPC spike
  const BATCH = 10;
  const parsed: (Awaited<ReturnType<typeof connection.getParsedTransaction>>)[] = [];
  for (let i = 0; i < signatures.length; i += BATCH) {
    const batch = signatures.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((entry) =>
        connection.getParsedTransaction(entry.signature, { maxSupportedTransactionVersion: 0 })
          .catch(() => null)
      )
    );
    parsed.push(...results);
    // Bail early once we have enough CT candidates
    const ctSoFar = parsed.filter((tx, idx) => isLikelyConfidentialTx(tx) && !signatures[idx]?.err).length;
    if (ctSoFar >= limit) break;
  }

    const transactions = signatures
      .map((entry, index) => ({ entry, parsed: parsed[index] }))
      .filter(({ parsed: tx }) => isLikelyConfidentialTx(tx))
      .slice(0, limit)
      .map(({ entry, parsed: tx }) => ({
        signature: entry.signature,
        type: 'confidential_transfer',
        blockTime: entry.blockTime,
        timestamp: entry.blockTime ? new Date(entry.blockTime * 1000).toISOString() : null,
        status: entry.err ? 'failed' : 'verified',
        mint: mint || process.env.SSS_TOKEN_MINT || null,
        amount: estimateTokenAmount(tx),
        proofs: {
          verified: !entry.err,
          source: 'onchain-log-patterns',
        },
      }));

  const ctResponse = {
    success: true,
    data: {
      transactions,
      pagination: { limit, hasMore: signatures.length >= limit },
    },
  };
  cacheSet(cacheKey, ctResponse, TTL_TX_MS);
  res.set('X-Cache', 'MISS');
  res.json(ctResponse);
}));

/**
 * @swagger
 * /api/v1/transactions/account/{address}:
 *   get:
 *     summary: Get transactions for an account
 *     tags: [Transactions]
 */
router.get('/account/:address', asyncHandler(async (req: Request, res: Response) => {
  const { address } = req.params;
  const limit = parseInt(req.query.limit as string) || 20;
  const before = req.query.before as string | undefined;

  try {
    const connection = getSolanaConnection();
    const pubkey = new PublicKey(address);

    const signatures = await connection.getSignaturesForAddress(pubkey, {
      limit,
      before,
    });

    const transactions = signatures.map(sig => ({
      signature: sig.signature,
      slot: sig.slot,
      blockTime: sig.blockTime,
      timestamp: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : null,
      status: sig.err ? 'failed' : 'success',
      memo: sig.memo,
    }));

    res.json({
      success: true,
      data: {
        address,
        transactions,
        pagination: {
          limit,
          hasMore: signatures.length === limit,
          lastSignature: signatures[signatures.length - 1]?.signature,
        },
      },
    });
  } catch (error) {
    logger.error(`Failed to fetch transactions for ${address}:`, error);
    throw new ApiError('Failed to fetch account transactions', 500);
  }
}));

/**
 * @swagger
 * /api/v1/transactions/{signature}:
 *   get:
 *     summary: Get transaction details
 *     tags: [Transactions]
 *     parameters:
 *       - in: path
 *         name: signature
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Transaction details
 *       404:
 *         description: Transaction not found
 */
router.get('/:signature', asyncHandler(async (req: Request, res: Response) => {
  const signatureParam = req.params.signature;
  const signature = Array.isArray(signatureParam) ? signatureParam[0] : signatureParam;

  if (!signature || signature.length < 32 || signature.length > 128) {
    throw new ApiError('Invalid transaction signature format', 400);
  }

  try {
    const connection = getSolanaConnection();
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      throw new ApiError('Transaction not found', 404);
    }

    res.json({
      success: true,
      data: {
        signature,
        slot: tx.slot,
        blockTime: tx.blockTime,
        fee: tx.meta?.fee,
        status: tx.meta?.err ? 'failed' : 'success',
        error: tx.meta?.err,
        instructions: tx.transaction.message.instructions.length,
        accounts: tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58()),
        logs: tx.meta?.logMessages || [],
      },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error(`Failed to fetch transaction ${signature}:`, error);
    throw new ApiError('Failed to fetch transaction', 500);
  }
}));

export const transactionRoutes = router;
