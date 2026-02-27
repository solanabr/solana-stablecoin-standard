"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.pool = void 0;
exports.initializeDatabase = initializeDatabase;
const pg_1 = require("pg");
const logger_1 = require("../shared/logger");
exports.pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
exports.db = {
    query: (text, params) => exports.pool.query(text, params),
    pool: exports.pool,
};
async function initializeDatabase() {
    logger_1.logger.info("Initializing compliance database...");
    const client = await exports.pool.connect();
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
        await client.query("CREATE INDEX IF NOT EXISTS idx_blacklist_address ON blacklist_events(address)");
        await client.query("CREATE INDEX IF NOT EXISTS idx_whitelist_address ON whitelist_events(address)");
        await client.query("COMMIT");
        logger_1.logger.info("Compliance database initialized");
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
exports.default = exports.db;
