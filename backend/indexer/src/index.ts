import fs from 'node:fs';
import { Connection, PublicKey } from '@solana/web3.js';
import { createLogger, createPool, loadEnv, runMigrations } from '@stbr/backend-shared';
import express from 'express';

interface IndexedEvent {
  signature: string;
  slot: number;
  blockTime: number | null;
  action: string;
  payload: Record<string, unknown>;
}

function extractAction(logs: string[]): string {
  const marker = logs.find((line) => line.includes('Instruction:'));
  if (!marker) {
    return 'unknown';
  }

  const [, action] = marker.split('Instruction:');
  return action?.trim().toLowerCase() ?? 'unknown';
}

async function dispatchWebhook(
  webhookUrl: string,
  eventId: number,
  event: IndexedEvent,
  retries: number,
  pool: ReturnType<typeof createPool>,
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
      });

      const body = await response.text();
      await pool.query(
        `INSERT INTO webhook_deliveries(event_id, attempt, status, response_code, response_body)
         VALUES ($1, $2, $3, $4, $5)`,
        [eventId, attempt, response.ok ? 'ok' : 'error', response.status, body],
      );

      if (response.ok) {
        return;
      }
    } catch (error) {
      await pool.query(
        `INSERT INTO webhook_deliveries(event_id, attempt, status, response_body)
         VALUES ($1, $2, $3, $4)`,
        [eventId, attempt, 'error', (error as Error).message],
      );
    }
  }
}

async function indexOnce(params: {
  connection: Connection;
  programId: PublicKey;
  pool: ReturnType<typeof createPool>;
  webhookUrl?: string;
  webhookRetries: number;
  logger: ReturnType<typeof createLogger>;
}): Promise<void> {
  const signatures = await params.connection.getSignaturesForAddress(params.programId, {
    limit: 50,
  });

  for (const item of signatures.reverse()) {
    const tx = await params.connection.getTransaction(item.signature, {
      maxSupportedTransactionVersion: 0,
    });
    const logs = tx?.meta?.logMessages ?? [];

    const action = extractAction(logs);
    const event: IndexedEvent = {
      signature: item.signature,
      slot: item.slot,
      blockTime: item.blockTime ?? null,
      action,
      payload: {
        logs,
      },
    };

    const insert = await params.pool.query(
      `INSERT INTO sss_events(signature, slot, block_time, action, payload)
       VALUES ($1, $2, to_timestamp($3), $4, $5::jsonb)
       ON CONFLICT(signature, action)
       DO NOTHING
       RETURNING id`,
      [
        event.signature,
        event.slot,
        event.blockTime ?? 0,
        event.action,
        JSON.stringify(event.payload),
      ],
    );

    if (!insert.rowCount) {
      continue;
    }

    params.logger.info(
      { signature: event.signature, action: event.action, slot: event.slot },
      'event indexed',
    );

    if (params.webhookUrl) {
      await dispatchWebhook(
        params.webhookUrl,
        Number(insert.rows[0].id),
        event,
        params.webhookRetries,
        params.pool,
      );
    }
  }
}

async function main(): Promise<void> {
  const env = loadEnv({ PORT: Number(process.env.PORT ?? 8082) });
  const logger = createLogger('indexer');

  const lock = JSON.parse(fs.readFileSync(env.SSS_LOCKFILE_PATH, 'utf8')) as {
    stablecoinProgramId: string;
  };

  const connection = new Connection(env.RPC_URL, 'confirmed');
  const programId = new PublicKey(lock.stablecoinProgramId);

  const pool = createPool(env.DATABASE_URL);
  await runMigrations(pool);

  setInterval(() => {
    indexOnce({
      connection,
      programId,
      pool,
      webhookUrl: env.WEBHOOK_URL,
      webhookRetries: env.WEBHOOK_MAX_RETRIES,
      logger,
    }).catch((error) => logger.error({ error }, 'index cycle failed'));
  }, env.POLL_INTERVAL_MS);

  const app = express();
  app.get('/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'indexer' });
  });

  app.get('/events', async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const rows = await pool.query(
      'SELECT id, signature, slot, block_time, action, payload, created_at FROM sss_events ORDER BY id DESC LIMIT $1',
      [limit],
    );
    res.json(rows.rows);
  });

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'indexer started');
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
