import { Router, Request, Response } from 'express';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

const router = Router();

// In-memory webhook storage (use Redis/DB in production)
const webhooks = new Map<string, WebhookConfig>();

interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: Date;
  lastTriggered?: Date;
  failureCount: number;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Webhook:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         url:
 *           type: string
 *           format: uri
 *         events:
 *           type: array
 *           items:
 *             type: string
 *             enum: [transfer, mint, burn, freeze, confidential_deposit, confidential_transfer, confidential_withdraw]
 *         active:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/v1/webhooks:
 *   get:
 *     summary: List all webhooks
 *     tags: [Webhooks]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of webhooks
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const webhookList = Array.from(webhooks.values()).map(wh => ({
    id: wh.id,
    url: wh.url,
    events: wh.events,
    active: wh.active,
    createdAt: wh.createdAt,
    lastTriggered: wh.lastTriggered,
    failureCount: wh.failureCount,
  }));

  res.json({
    success: true,
    data: { webhooks: webhookList },
  });
}));

/**
 * @swagger
 * /api/v1/webhooks:
 *   post:
 *     summary: Register a new webhook
 *     tags: [Webhooks]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *               - events
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Webhook created
 *       400:
 *         description: Invalid request
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { url, events } = req.body;

  if (!url || !events || !Array.isArray(events)) {
    throw new ApiError('URL and events array are required', 400);
  }

  const validEvents = [
    'transfer', 'mint', 'burn', 'freeze',
    'confidential_deposit', 'confidential_transfer', 'confidential_withdraw',
    'compliance_alert', 'reserve_update',
  ];

  const invalidEvents = events.filter(e => !validEvents.includes(e));
  if (invalidEvents.length > 0) {
    throw new ApiError(`Invalid events: ${invalidEvents.join(', ')}`, 400);
  }

  const id = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString('hex');

  const webhook: WebhookConfig = {
    id,
    url,
    secret,
    events,
    active: true,
    createdAt: new Date(),
    failureCount: 0,
  };

  webhooks.set(id, webhook);

  logger.info(`Webhook registered: ${id} for events: ${events.join(', ')}`);

  res.status(201).json({
    success: true,
    data: {
      id,
      url,
      events,
      secret, // Only returned once on creation
      active: true,
      createdAt: webhook.createdAt,
    },
  });
}));

/**
 * @swagger
 * /api/v1/webhooks/{id}:
 *   get:
 *     summary: Get webhook details
 *     tags: [Webhooks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook details
 *       404:
 *         description: Webhook not found
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const webhook = webhooks.get(id);

  if (!webhook) {
    throw new ApiError('Webhook not found', 404);
  }

  res.json({
    success: true,
    data: {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      active: webhook.active,
      createdAt: webhook.createdAt,
      lastTriggered: webhook.lastTriggered,
      failureCount: webhook.failureCount,
    },
  });
}));

/**
 * @swagger
 * /api/v1/webhooks/{id}:
 *   patch:
 *     summary: Update webhook
 *     tags: [Webhooks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Webhook updated
 */
router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const { url, events, active } = req.body;

  const webhook = webhooks.get(id);
  if (!webhook) {
    throw new ApiError('Webhook not found', 404);
  }

  if (url) webhook.url = url;
  if (events) webhook.events = events;
  if (active !== undefined) webhook.active = active;

  webhooks.set(id, webhook);

  res.json({
    success: true,
    data: {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      active: webhook.active,
    },
  });
}));

/**
 * @swagger
 * /api/v1/webhooks/{id}:
 *   delete:
 *     summary: Delete webhook
 *     tags: [Webhooks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Webhook deleted
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!webhooks.has(id)) {
    throw new ApiError('Webhook not found', 404);
  }

  webhooks.delete(id);
  logger.info(`Webhook deleted: ${id}`);

  res.status(204).send();
}));

/**
 * @swagger
 * /api/v1/webhooks/{id}/test:
 *   post:
 *     summary: Send test webhook
 *     tags: [Webhooks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Test webhook sent
 */
router.post('/:id/test', asyncHandler(async (req: Request, res: Response) => {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const webhook = webhooks.get(id);

  if (!webhook) {
    throw new ApiError('Webhook not found', 404);
  }

  const testPayload = {
    event: 'test',
    timestamp: new Date().toISOString(),
    data: {
      message: 'This is a test webhook from SSS API',
    },
  };

  // Generate signature
  const signature = crypto
    .createHmac('sha256', webhook.secret)
    .update(JSON.stringify(testPayload))
    .digest('hex');

  // In production, actually send the webhook
  logger.info(`Test webhook sent to ${webhook.url}`);

  res.json({
    success: true,
    data: {
      sent: true,
      payload: testPayload,
      signature: `sha256=${signature}`,
    },
  });
}));

/**
 * @swagger
 * /api/v1/webhooks/events:
 *   get:
 *     summary: List available webhook events
 *     tags: [Webhooks]
 *     responses:
 *       200:
 *         description: List of events
 */
router.get('/events', asyncHandler(async (_req: Request, res: Response) => {
  const events = [
    { name: 'transfer', description: 'Token transfer completed' },
    { name: 'mint', description: 'New tokens minted' },
    { name: 'burn', description: 'Tokens burned' },
    { name: 'freeze', description: 'Account frozen/unfrozen' },
    { name: 'confidential_deposit', description: 'CT deposit completed' },
    { name: 'confidential_transfer', description: 'CT transfer completed' },
    { name: 'confidential_withdraw', description: 'CT withdrawal completed' },
    { name: 'compliance_alert', description: 'Compliance check triggered' },
    { name: 'reserve_update', description: 'Reserve status changed' },
  ];

  res.json({
    success: true,
    data: { events },
  });
}));

// Webhook dispatch helper (exported for indexer use)
export async function dispatchWebhook(
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const activeWebhooks = Array.from(webhooks.values()).filter(
    wh => wh.active && wh.events.includes(event)
  );

  for (const webhook of activeWebhooks) {
    try {
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      // In production, use a job queue (BullMQ) for reliability
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SSS-Signature': `sha256=${signature}`,
          'X-SSS-Event': event,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        webhook.failureCount++;
        logger.warn(`Webhook ${webhook.id} failed: ${response.status}`);
      } else {
        webhook.lastTriggered = new Date();
        webhook.failureCount = 0;
      }
    } catch (error) {
      webhook.failureCount++;
      logger.error(`Webhook ${webhook.id} error:`, error);
    }

    // Disable webhook after 10 consecutive failures
    if (webhook.failureCount >= 10) {
      webhook.active = false;
      logger.warn(`Webhook ${webhook.id} disabled due to failures`);
    }
  }
}

export const webhookRoutes = router;
