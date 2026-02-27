import { Pool } from "pg";
import { logger } from "../shared/logger";

export const pool = new Pool({
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
  logger.info("Initializing compliance database...");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

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
      "CREATE INDEX IF NOT EXISTS idx_blacklist_address ON blacklist_events(address)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_whitelist_address ON whitelist_events(address)"
    );

    await client.query("COMMIT");
    logger.info("Compliance database initialized");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export default db;
