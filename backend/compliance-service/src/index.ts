import express from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { Pool } from 'pg';
import winston from 'winston';

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
const PORT = process.env.PORT || 3003;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || 'Hx1FiL4UdbdqiFr9pseWnkDpLtYYm4KsevHSgvgBX4oh');
const DATABASE_URL = process.env.DATABASE_URL;

// Database connection
const pool = new Pool({
  connectionString: DATABASE_URL,
});

// Solana connection
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'compliance-service',
    timestamp: new Date().toISOString(),
    network: SOLANA_RPC_URL
  });
});

// Add address to blacklist
app.post('/api/blacklist/add', async (req, res) => {
  try {
    const { address, reason, authority } = req.body;

    if (!address || !reason || !authority) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate address
    try {
      new PublicKey(address);
    } catch {
      return res.status(400).json({ error: 'Invalid address' });
    }

    logger.info('Blacklist add request', { address, reason });

    // Store in database
    await pool.query(
      `INSERT INTO blacklist (address, reason, blacklisted_by, blacklisted_at, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (address) DO UPDATE SET
         reason = $2,
         blacklisted_by = $3,
         blacklisted_at = $4,
         is_active = true,
         updated_at = CURRENT_TIMESTAMP`,
      [address, reason, authority, new Date()]
    );

    // Log to audit trail
    await pool.query(
      `INSERT INTO audit_log (action, actor, target, details, timestamp)
       VALUES ($1, $2, $3, $4, $5)`,
      ['blacklist_add', authority, address, JSON.stringify({ reason }), new Date()]
    );

    logger.info('Address blacklisted', { address });
    res.json({
      success: true,
      address,
      reason,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Blacklist add failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Remove address from blacklist
app.post('/api/blacklist/remove', async (req, res) => {
  try {
    const { address, authority } = req.body;

    if (!address || !authority) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    logger.info('Blacklist remove request', { address });

    // Update database
    await pool.query(
      `UPDATE blacklist SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE address = $1`,
      [address]
    );

    // Log to audit trail
    await pool.query(
      `INSERT INTO audit_log (action, actor, target, timestamp)
       VALUES ($1, $2, $3, $4)`,
      ['blacklist_remove', authority, address, new Date()]
    );

    logger.info('Address removed from blacklist', { address });
    res.json({
      success: true,
      address,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Blacklist remove failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Check if address is blacklisted
app.get('/api/blacklist/check/:address', async (req, res) => {
  try {
    const { address } = req.params;

    const result = await pool.query(
      'SELECT * FROM blacklist WHERE address = $1 AND is_active = true',
      [address]
    );

    const isBlacklisted = result.rows.length > 0;
    const data = isBlacklisted ? result.rows[0] : null;

    res.json({
      address,
      isBlacklisted,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Blacklist check failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get all blacklisted addresses
app.get('/api/blacklist', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM blacklist WHERE is_active = true ORDER BY blacklisted_at DESC'
    );

    res.json({
      count: result.rows.length,
      addresses: result.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Blacklist fetch failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Export audit log
app.get('/api/audit-log', async (req, res) => {
  try {
    const { from, to, action, actor } = req.query;

    let query = 'SELECT * FROM audit_log WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (from) {
      query += ` AND timestamp >= $${paramIndex}`;
      params.push(from);
      paramIndex++;
    }

    if (to) {
      query += ` AND timestamp <= $${paramIndex}`;
      params.push(to);
      paramIndex++;
    }

    if (action) {
      query += ` AND action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    if (actor) {
      query += ` AND actor = $${paramIndex}`;
      params.push(actor);
      paramIndex++;
    }

    query += ' ORDER BY timestamp DESC LIMIT 1000';

    const result = await pool.query(query, params);

    res.json({
      count: result.rows.length,
      logs: result.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Audit log export failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Transaction monitoring endpoint
app.post('/api/monitor/transaction', async (req, res) => {
  try {
    const { signature } = req.body;

    if (!signature) {
      return res.status(400).json({ error: 'Missing signature' });
    }

    logger.info('Transaction monitoring request', { signature });

    // TODO: Implement transaction analysis
    // Check for suspicious patterns, large amounts, etc.

    res.json({
      signature,
      status: 'monitored',
      flags: [],
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Transaction monitoring failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Compliance service started on port ${PORT}`);
  logger.info(`Connected to Solana: ${SOLANA_RPC_URL}`);
  logger.info(`Program ID: ${PROGRAM_ID.toBase58()}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});
