import { Router, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { getMint, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { getSolanaConnection } from '../utils/solana.js';

const router = Router();

// SSS Token Program (from deployment)
// Use environment variable or default placeholder - will be set during deployment
const SSS_TOKEN_PROGRAM = new PublicKey(
  process.env.SSS_PROGRAM_ID || '11111111111111111111111111111111'
);
const SSS_TRANSFER_HOOK = new PublicKey(
  process.env.SSS_TRANSFER_HOOK_ID || '11111111111111111111111111111111'
);

/**
 * @swagger
 * components:
 *   schemas:
 *     Token:
 *       type: object
 *       properties:
 *         mint:
 *           type: string
 *           description: Token mint address
 *         name:
 *           type: string
 *         symbol:
 *           type: string
 *         decimals:
 *           type: number
 *         supply:
 *           type: string
 *         freezeAuthority:
 *           type: string
 *         mintAuthority:
 *           type: string
 *         extensions:
 *           type: array
 *           items:
 *             type: string
 */

/**
 * @swagger
 * /api/v1/tokens:
 *   get:
 *     summary: List all SSS-compliant tokens
 *     tags: [Tokens]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tokens:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Token'
 *                 pagination:
 *                   type: object
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  // In production, this would query an indexed database
  // For now, return mock data structure
  const tokens = [
    {
      mint: 'SSSUSDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      name: 'SSS USD',
      symbol: 'SSSUSD',
      decimals: 6,
      supply: '1000000000000',
      mintAuthority: SSS_TOKEN_PROGRAM.toBase58(),
      freezeAuthority: SSS_TOKEN_PROGRAM.toBase58(),
      extensions: [
        'TransferFeeConfig',
        'MetadataPointer',
        'ConfidentialTransferMint',
        'TransferHook',
        'PermanentDelegate',
      ],
      compliance: {
        status: 'active',
        lastAudit: new Date().toISOString(),
        reserves: {
          total: '1000000000000',
          verified: true,
        },
      },
    },
  ];

  res.json({
    success: true,
    data: {
      tokens,
      pagination: {
        page,
        limit,
        total: tokens.length,
        totalPages: Math.ceil(tokens.length / limit),
      },
    },
  });
}));

/**
 * @swagger
 * /api/v1/tokens/backing/status:
 *   get:
 *     summary: Get reserve backing and bank wiring integration status
 *     tags: [Tokens]
 *     responses:
 *       200:
 *         description: Backing integrations status
 */
router.get('/backing/status', asyncHandler(async (_req: Request, res: Response) => {
  const wireProviders = (process.env.WIRE_PROVIDERS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const collateralProviders = (process.env.COLLATERAL_PROVIDERS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const status = {
    bankWiring: {
      enabled: process.env.BANK_WIRING_ENABLED === 'true',
      providers: wireProviders,
      webhookConfigured: Boolean(process.env.BANK_WEBHOOK_SECRET),
      apiBaseConfigured: Boolean(process.env.BANK_API_BASE_URL),
    },
    backingOptions: {
      fiatReservesEnabled: process.env.FIAT_RESERVES_ENABLED === 'true',
      collateralizedEnabled: process.env.COLLATERAL_BACKING_ENABLED === 'true',
      providerCount: collateralProviders.length,
      providers: collateralProviders,
      attestationEndpointConfigured: Boolean(process.env.RESERVE_ATTESTATION_URL),
      oracleConfigured: Boolean(process.env.SSS_ORACLE_ID),
    },
    runtime: {
      fullyOperational:
        process.env.BANK_WIRING_ENABLED === 'true' &&
        Boolean(process.env.BANK_API_BASE_URL) &&
        process.env.FIAT_RESERVES_ENABLED === 'true',
      environment: process.env.NODE_ENV || 'development',
      checkedAt: new Date().toISOString(),
    },
  };

  res.json({
    success: true,
    data: status,
  });
}));

/**
 * @swagger
 * /api/v1/tokens/{mint}:
 *   get:
 *     summary: Get token details by mint address
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: mint
 *         required: true
 *         schema:
 *           type: string
 *         description: Token mint address
 *     responses:
 *       200:
 *         description: Token details
 *       404:
 *         description: Token not found
 */
router.get('/:mint', asyncHandler(async (req: Request, res: Response) => {
  const { mint } = req.params;

  try {
    const connection = getSolanaConnection();
    const mintPubkey = new PublicKey(mint);
    const mintInfo = await getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);

    res.json({
      success: true,
      data: {
        mint: mintPubkey.toBase58(),
        supply: mintInfo.supply.toString(),
        decimals: mintInfo.decimals,
        mintAuthority: mintInfo.mintAuthority?.toBase58() || null,
        freezeAuthority: mintInfo.freezeAuthority?.toBase58() || null,
        isInitialized: mintInfo.isInitialized,
        // Extension info would be parsed here
      },
    });
  } catch (error) {
    logger.error(`Failed to fetch token ${mint}:`, error);
    throw new ApiError('Token not found', 404);
  }
}));

/**
 * @swagger
 * /api/v1/tokens/{mint}/holders:
 *   get:
 *     summary: Get token holders
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: mint
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       200:
 *         description: List of token holders
 */
router.get('/:mint/holders', asyncHandler(async (req: Request, res: Response) => {
  const { mint } = req.params;
  const limit = parseInt(req.query.limit as string) || 100;

  const connection = getSolanaConnection();
  const mintPubkey = new PublicKey(mint);

  try {
    // Get all token accounts for this mint
    const accounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
      filters: [
        { dataSize: 165 }, // Token account size
        { memcmp: { offset: 0, bytes: mintPubkey.toBase58() } },
      ],
    });

    const holders = accounts.slice(0, limit).map((account) => ({
      address: account.pubkey.toBase58(),
      // Balance would be decoded from account.account.data
    }));

    res.json({
      success: true,
      data: {
        mint,
        totalHolders: accounts.length,
        holders,
      },
    });
  } catch (error) {
    logger.error(`Failed to fetch holders for ${mint}:`, error);
    throw new ApiError('Failed to fetch holders', 500);
  }
}));

/**
 * @swagger
 * /api/v1/tokens/{mint}/extensions:
 *   get:
 *     summary: Get token extensions info
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: mint
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Token extensions
 */
router.get('/:mint/extensions', asyncHandler(async (req: Request, res: Response) => {
  const { mint } = req.params;

  // In a real implementation, this would parse Token-2022 extensions
  const extensions = {
    transferFeeConfig: {
      enabled: true,
      feeBasisPoints: 50, // 0.5%
      maxFee: '1000000', // 1 USDC
      transferFeeConfigAuthority: SSS_TOKEN_PROGRAM.toBase58(),
      withdrawWithheldAuthority: SSS_TOKEN_PROGRAM.toBase58(),
    },
    confidentialTransfer: {
      enabled: true,
      autoApproveNewAccounts: false,
      auditorElgamalPubkey: null,
    },
    transferHook: {
      enabled: true,
      programId: SSS_TRANSFER_HOOK.toBase58(),
      authority: SSS_TOKEN_PROGRAM.toBase58(),
    },
    metadataPointer: {
      enabled: true,
      metadataAddress: mint,
    },
    permanentDelegate: {
      enabled: true,
      delegate: SSS_TOKEN_PROGRAM.toBase58(),
    },
  };

  res.json({
    success: true,
    data: {
      mint,
      extensions,
      sssCompliant: true,
      complianceLevel: 'SSS-3', // Full compliance with CT
    },
  });
}));

export const tokenRoutes = router;
