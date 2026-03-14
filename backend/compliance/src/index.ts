import fs from 'node:fs';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createLogger, createPool, loadEnv, runMigrations } from '@stbr/backend-shared';
import { SolanaStablecoin } from '@stbr/sss-token';
import express from 'express';
import { z } from 'zod';

const AddSchema = z.object({
  wallet: z.string(),
  reason: z.string().min(1),
});

const RemoveSchema = z.object({
  wallet: z.string(),
});

async function main(): Promise<void> {
  const env = loadEnv({ PORT: Number(process.env.PORT ?? 8083) });
  const logger = createLogger('compliance');

  const lock = JSON.parse(fs.readFileSync(env.SSS_LOCKFILE_PATH, 'utf8')) as {
    mint: string;
    stablecoinProgramId: string;
    transferHookProgramId: string;
  };

  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(env.SSS_KEYPAIR_PATH, 'utf8')) as number[]),
  );

  const connection = new Connection(env.RPC_URL, 'confirmed');
  const client = SolanaStablecoin.fromExisting({
    connection,
    payer,
    mint: new PublicKey(lock.mint),
    stablecoinProgramId: new PublicKey(lock.stablecoinProgramId),
    transferHookProgramId: new PublicKey(lock.transferHookProgramId),
  });

  const pool = createPool(env.DATABASE_URL);
  await runMigrations(pool);

  const app = express();
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'compliance' });
  });

  app.post('/blacklist/add', async (req, res) => {
    const parsed = AddSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }

    try {
      const wallet = new PublicKey(parsed.data.wallet);
      const signature = await client.compliance.blacklistAdd(payer, wallet, parsed.data.reason);

      await pool.query(
        `INSERT INTO sss_events(signature, slot, action, payload)
         VALUES ($1, 0, $2, $3::jsonb)
         ON CONFLICT DO NOTHING`,
        [
          signature,
          'blacklist_add',
          JSON.stringify({ wallet: wallet.toBase58(), reason: parsed.data.reason }),
        ],
      );

      logger.info({ signature, wallet: wallet.toBase58() }, 'wallet blacklisted');
      res.json({ ok: true, signature });
    } catch (error) {
      logger.error({ error }, 'blacklist add failed');
      res.status(500).json({ ok: false, error: (error as Error).message });
    }
  });

  app.post('/blacklist/remove', async (req, res) => {
    const parsed = RemoveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: parsed.error.flatten() });
      return;
    }

    try {
      const wallet = new PublicKey(parsed.data.wallet);
      const signature = await client.compliance.blacklistRemove(payer, wallet);

      await pool.query(
        `INSERT INTO sss_events(signature, slot, action, payload)
         VALUES ($1, 0, $2, $3::jsonb)
         ON CONFLICT DO NOTHING`,
        [signature, 'blacklist_remove', JSON.stringify({ wallet: wallet.toBase58() })],
      );

      logger.info({ signature, wallet: wallet.toBase58() }, 'wallet removed from blacklist');
      res.json({ ok: true, signature });
    } catch (error) {
      logger.error({ error }, 'blacklist remove failed');
      res.status(500).json({ ok: false, error: (error as Error).message });
    }
  });

  app.get('/blacklist/:wallet', async (req, res) => {
    try {
      const wallet = new PublicKey(req.params.wallet);
      const recordPda = SolanaStablecoin.deriveComplianceRecordPda(
        client.addresses.mint,
        wallet,
        client.stablecoinProgramId,
      );
      const account = await connection.getAccountInfo(recordPda, 'confirmed');

      if (!account) {
        res.json({ wallet: wallet.toBase58(), blacklisted: false, reasonHash: null });
        return;
      }

      const reasonHash = Buffer.from(account.data.subarray(8 + 66, 8 + 98)).toString('hex');
      const blacklisted = account.data[8 + 65] === 1;

      res.json({
        wallet: wallet.toBase58(),
        blacklisted,
        reasonHash,
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: (error as Error).message });
    }
  });

  app.get('/audit/export', async (req, res) => {
    const action = req.query.action as string | undefined;
    const format = (req.query.format as string | undefined) ?? 'json';

    const sql = action
      ? 'SELECT * FROM sss_events WHERE action = $1 ORDER BY id DESC LIMIT 1000'
      : 'SELECT * FROM sss_events ORDER BY id DESC LIMIT 1000';
    const result = await pool.query(sql, action ? [action] : []);

    if (format === 'csv') {
      const header = 'id,signature,slot,block_time,action,created_at\n';
      const body = result.rows
        .map((row) =>
          [row.id, row.signature, row.slot, row.block_time, row.action, row.created_at]
            .map((v) => String(v).replaceAll(',', ' '))
            .join(','),
        )
        .join('\n');
      res.setHeader('content-type', 'text/csv');
      res.send(`${header}${body}\n`);
      return;
    }

    res.json(result.rows);
  });

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'compliance service started');
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
