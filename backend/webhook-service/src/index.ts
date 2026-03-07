import express from 'express';
import { Pool } from 'pg';
import { createClient } from 'redis';
import winston from 'winston';
import axios from 'axios';

const app = express();
app.use(express.json());

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Environment variables
const PORT = process.env.PORT || 3004;
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

// Database connection
const pool = new Pool({
  connectionString: DATABASE_URL,
});

// Redis connection
const redis = createClient({ url: REDIS_URL });
redis.connect().catch(console.error);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'webhook-service',
    timestamp: new Date().toISOString()
  });
});

// Register a webhook
app.post('/api/webhooks', async (req, res) => {
  try {
    const { url, eventTypes, retryCount = 3 } = req.body;

    if (!url || !eventTypes || !Array.isArray(eventTypes)) {
      return res.status(400).json({ error: 'Invalid webhook configuration' });
    }

    logger.info('Webhook registration', { url, eventTypes });

    const result = await pool.query(
      `INSERT INTO webhooks (url, event_types, retry_count, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [url, eventTypes, retryCount]
    );

    res.json({
      success: true,
      webhook: result.rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Webhook registration failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// List all webhooks
app.get('/api/webhooks', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM webhooks ORDER BY created_at DESC'
    );

    res.json({
      count: result.rows.length,
      webhooks: result.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Webhook list failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get webhook by ID
app.get('/api/webhooks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM webhooks WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    res.json({
      webhook: result.rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Webhook fetch failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Update webhook
app.put('/api/webhooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { url, eventTypes, isActive, retryCount } = req.body;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (url) {
      updates.push(`url = $${paramIndex}`);
      params.push(url);
      paramIndex++;
    }

    if (eventTypes) {
      updates.push(`event_types = $${paramIndex}`);
      params.push(eventTypes);
      paramIndex++;
    }

    if (typeof isActive === 'boolean') {
      updates.push(`is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }

    if (retryCount !== undefined) {
      updates.push(`retry_count = $${paramIndex}`);
      params.push(retryCount);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const query = `UPDATE webhooks SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    res.json({
      success: true,
      webhook: result.rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Webhook update failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Delete webhook
app.delete('/api/webhooks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM webhooks WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    res.json({
      success: true,
      deleted: result.rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Webhook deletion failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get webhook delivery history
app.get('/api/webhooks/:id/deliveries', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;

    const result = await pool.query(
      `SELECT * FROM webhook_deliveries
       WHERE webhook_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [id, limit]
    );

    res.json({
      count: result.rows.length,
      deliveries: result.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Delivery history fetch failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Trigger webhook delivery (for testing)
app.post('/api/webhooks/:id/test', async (req, res) => {
  try {
    const { id } = req.params;

    const webhook = await pool.query(
      'SELECT * FROM webhooks WHERE id = $1 AND is_active = true',
      [id]
    );

    if (webhook.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook not found or inactive' });
    }

    const testPayload = {
      type: 'test',
      timestamp: new Date().toISOString(),
      data: { message: 'Test webhook delivery' }
    };

    const response = await axios.post(webhook.rows[0].url, testPayload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    });

    res.json({
      success: true,
      status: response.status,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Test webhook failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Webhook service started on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await pool.end();
  await redis.quit();
  process.exit(0);
});
