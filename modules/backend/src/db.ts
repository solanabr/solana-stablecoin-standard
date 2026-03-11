import { Pool } from "pg";
import pino from "pino";

const logger = pino({ name: "db" });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://sss:sss@localhost:5432/sss",
});

pool.on("error", (err) => {
  logger.error(err, "Unexpected database error");
});

export async function insertEvent(
  mint: string,
  eventType: string,
  txSignature: string,
  slot: number,
  data: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `INSERT INTO events (mint, event_type, transaction_signature, slot, data)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (transaction_signature) DO NOTHING`,
    [mint, eventType, txSignature, slot, JSON.stringify(data)]
  );
}

export async function updateBlacklistStatus(
  mint: string,
  wallet: string,
  isBlacklisted: boolean,
  reason?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO blacklist_status (mint, wallet, is_blacklisted, reason, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (mint, wallet) DO UPDATE SET
       is_blacklisted = $3, reason = $4, updated_at = NOW()`,
    [mint, wallet, isBlacklisted, reason || null]
  );
}

export async function updateMinterActivity(
  mint: string,
  minter: string,
  currentAllowance: bigint,
  totalMinted: bigint,
  isActive: boolean
): Promise<void> {
  await pool.query(
    `INSERT INTO minter_activity (mint, minter, current_allowance, total_minted, is_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (mint, minter) DO UPDATE SET
       current_allowance = $3, total_minted = $4, is_active = $5, updated_at = NOW()`,
    [mint, minter, currentAllowance.toString(), totalMinted.toString(), isActive]
  );
}

export async function getWebhookSubscriptions(
  mint: string,
  eventType: string
): Promise<Array<{ url: string; secret: string | null }>> {
  const result = await pool.query(
    `SELECT url, secret FROM webhook_subscriptions
     WHERE mint = $1 AND $2 = ANY(event_types) AND is_active = TRUE`,
    [mint, eventType]
  );
  return result.rows;
}

export async function getEvents(
  mint: string,
  eventType?: string,
  limit: number = 50
): Promise<any[]> {
  if (eventType) {
    const result = await pool.query(
      `SELECT * FROM events WHERE mint = $1 AND event_type = $2 ORDER BY slot DESC LIMIT $3`,
      [mint, eventType, limit]
    );
    return result.rows;
  }
  const result = await pool.query(
    `SELECT * FROM events WHERE mint = $1 ORDER BY slot DESC LIMIT $2`,
    [mint, limit]
  );
  return result.rows;
}

export { pool };
