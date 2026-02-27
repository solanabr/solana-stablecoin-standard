import { Pool } from "pg";
import { logger } from "../shared/logger";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
  pool,
};

export async function initializeDatabase(): Promise<void> {
  logger.info("Initializing database...");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Transfers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transfers (
        id SERIAL PRIMARY KEY,
        signature VARCHAR(100) UNIQUE NOT NULL,
        slot BIGINT NOT NULL,
        block_time BIGINT,
        source VARCHAR(50),
        destination VARCHAR(50),
        amount BIGINT,
        program_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Fee updates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS fee_updates (
        id SERIAL PRIMARY KEY,
        signature VARCHAR(100) UNIQUE NOT NULL,
        slot BIGINT NOT NULL,
        block_time BIGINT,
        program_id VARCHAR(50) NOT NULL,
        data JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Blacklist events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS blacklist_events (
        id SERIAL PRIMARY KEY,
        signature VARCHAR(100) UNIQUE NOT NULL,
        slot BIGINT NOT NULL,
        block_time BIGINT,
        address VARCHAR(50) NOT NULL,
        action VARCHAR(10) NOT NULL,
        program_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Whitelist events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS whitelist_events (
        id SERIAL PRIMARY KEY,
        signature VARCHAR(100) UNIQUE NOT NULL,
        slot BIGINT NOT NULL,
        block_time BIGINT,
        address VARCHAR(50) NOT NULL,
        action VARCHAR(10) NOT NULL,
        program_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_transfers_source ON transfers(source)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_transfers_destination ON transfers(destination)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_transfers_slot ON transfers(slot)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_blacklist_address ON blacklist_events(address)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_whitelist_address ON whitelist_events(address)"
    );

    await client.query("COMMIT");
    logger.info("Database initialized successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export default db;
