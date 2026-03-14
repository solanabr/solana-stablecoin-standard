import { Pool } from 'pg';

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sss_events (
      id BIGSERIAL PRIMARY KEY,
      signature TEXT NOT NULL,
      slot BIGINT NOT NULL,
      block_time TIMESTAMPTZ,
      action TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(signature, action)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES sss_events(id) ON DELETE CASCADE,
      attempt INTEGER NOT NULL,
      status TEXT NOT NULL,
      response_code INTEGER,
      response_body TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
