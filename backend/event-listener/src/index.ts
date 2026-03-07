import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { Pool } from 'pg';
import winston from 'winston';
import axios from 'axios';

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
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || 'Hx1FiL4UdbdqiFr9pseWnkDpLtYYm4KsevHSgvgBX4oh');
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const DATABASE_URL = process.env.DATABASE_URL;

// Database connection
const pool = new Pool({
  connectionString: DATABASE_URL,
});

// Solana connection
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Event types
enum EventType {
  MINT = 'mint',
  BURN = 'burn',
  FREEZE = 'freeze',
  THAW = 'thaw',
  PAUSE = 'pause',
  UNPAUSE = 'unpause',
  BLACKLIST_ADD = 'blacklist_add',
  BLACKLIST_REMOVE = 'blacklist_remove',
}

interface StablecoinEvent {
  type: EventType;
  signature: string;
  timestamp: Date;
  data: any;
}

// Store event in database
async function storeEvent(event: StablecoinEvent): Promise<void> {
  try {
    await pool.query(
      'INSERT INTO events (type, signature, timestamp, data) VALUES ($1, $2, $3, $4)',
      [event.type, event.signature, event.timestamp, JSON.stringify(event.data)]
    );
    logger.info('Event stored', { type: event.type, signature: event.signature });
  } catch (error: any) {
    logger.error('Failed to store event', { error: error.message });
  }
}

// Send webhook notification
async function sendWebhook(event: StablecoinEvent): Promise<void> {
  if (!WEBHOOK_URL) return;

  try {
    await axios.post(WEBHOOK_URL, event, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    });
    logger.info('Webhook sent', { type: event.type });
  } catch (error: any) {
    logger.error('Webhook failed', { error: error.message });
  }
}

// Process event
async function processEvent(event: StablecoinEvent): Promise<void> {
  await storeEvent(event);
  await sendWebhook(event);
}

// Listen for program logs
async function startListener(): Promise<void> {
  logger.info('Starting event listener');
  logger.info(`Monitoring program: ${PROGRAM_ID.toBase58()}`);
  logger.info(`Connected to: ${SOLANA_RPC_URL}`);

  // Subscribe to program logs
  connection.onLogs(
    PROGRAM_ID,
    async (logs, context) => {
      try {
        logger.info('Program log received', {
          signature: logs.signature,
          slot: context.slot
        });

        // Parse logs to determine event type
        const logMessages = logs.logs.join(' ');
        let eventType: EventType | null = null;

        if (logMessages.includes('Minted')) eventType = EventType.MINT;
        else if (logMessages.includes('Burned')) eventType = EventType.BURN;
        else if (logMessages.includes('frozen')) eventType = EventType.FREEZE;
        else if (logMessages.includes('thawed')) eventType = EventType.THAW;
        else if (logMessages.includes('paused')) eventType = EventType.PAUSE;
        else if (logMessages.includes('resumed')) eventType = EventType.UNPAUSE;
        else if (logMessages.includes('blacklist')) {
          eventType = logMessages.includes('added')
            ? EventType.BLACKLIST_ADD
            : EventType.BLACKLIST_REMOVE;
        }

        if (eventType) {
          const event: StablecoinEvent = {
            type: eventType,
            signature: logs.signature,
            timestamp: new Date(),
            data: {
              logs: logs.logs,
              slot: context.slot,
            },
          };

          await processEvent(event);
        }
      } catch (error: any) {
        logger.error('Error processing log', { error: error.message });
      }
    },
    'confirmed'
  );

  logger.info('Event listener started successfully');
}

// Health check server
import express from 'express';
const app = express();

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'event-listener',
    timestamp: new Date().toISOString(),
    network: SOLANA_RPC_URL,
    programId: PROGRAM_ID.toBase58(),
  });
});

app.listen(3002, () => {
  logger.info('Health check server started on port 3002');
});

// Start the listener
startListener().catch((error) => {
  logger.error('Failed to start listener', { error: error.message });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});
