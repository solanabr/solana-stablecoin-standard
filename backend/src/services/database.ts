import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { config } from "../config";
import { createLogger } from "../logger";

const log = createLogger("database");

// ── Types ───────────────────────────────────────────────────────────────────

export interface EventRow {
  id: number;
  event_type: string;
  program_id: string;
  signature: string;
  slot: number;
  block_time: number | null;
  data: string; // JSON-encoded event payload
  created_at: string;
}

export interface WebhookRow {
  id: number;
  url: string;
  event_types: string; // comma-separated list or "*" for all
  secret: string | null;
  active: number;
  created_at: string;
}

export interface WebhookDeliveryRow {
  id: number;
  webhook_id: number;
  event_id: number;
  attempt: number;
  status_code: number | null;
  response_body: string | null;
  error: string | null;
  delivered_at: string;
}

export interface AuditTrailRow {
  id: number;
  action: string;
  actor: string;
  target: string | null;
  details: string; // JSON
  timestamp: string;
}

// ── Singleton DB connection ─────────────────────────────────────────────────

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = config.database.path;
  const dir = path.dirname(dbPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log.info(`Created database directory: ${dir}`);
  }

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  initTables(db);
  log.info(`Database initialized at ${dbPath}`);

  return db;
}

function initTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type  TEXT    NOT NULL,
      program_id  TEXT    NOT NULL,
      signature   TEXT    NOT NULL,
      slot        INTEGER NOT NULL,
      block_time  INTEGER,
      data        TEXT    NOT NULL DEFAULT '{}',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_events_slot ON events(slot);
    CREATE INDEX IF NOT EXISTS idx_events_signature ON events(signature);

    CREATE TABLE IF NOT EXISTS webhooks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      url         TEXT    NOT NULL,
      event_types TEXT    NOT NULL DEFAULT '*',
      secret      TEXT,
      active      INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_id    INTEGER NOT NULL REFERENCES webhooks(id),
      event_id      INTEGER NOT NULL REFERENCES events(id),
      attempt       INTEGER NOT NULL DEFAULT 1,
      status_code   INTEGER,
      response_body TEXT,
      error         TEXT,
      delivered_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_deliveries_webhook ON webhook_deliveries(webhook_id);
    CREATE INDEX IF NOT EXISTS idx_deliveries_event ON webhook_deliveries(event_id);

    CREATE TABLE IF NOT EXISTS audit_trail (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      action    TEXT    NOT NULL,
      actor     TEXT    NOT NULL,
      target    TEXT,
      details   TEXT    NOT NULL DEFAULT '{}',
      timestamp TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_trail(action);
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_trail(actor);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_trail(timestamp);
  `);
}

// ── Query helpers ───────────────────────────────────────────────────────────

export function insertEvent(
  eventType: string,
  programId: string,
  signature: string,
  slot: number,
  blockTime: number | null,
  data: Record<string, unknown>
): EventRow {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO events (event_type, program_id, signature, slot, block_time, data)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    eventType,
    programId,
    signature,
    slot,
    blockTime,
    JSON.stringify(data)
  );
  return db
    .prepare("SELECT * FROM events WHERE id = ?")
    .get(result.lastInsertRowid) as EventRow;
}

export function queryEvents(params: {
  eventType?: string;
  programId?: string;
  limit?: number;
  offset?: number;
}): EventRow[] {
  const db = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.eventType) {
    conditions.push("event_type = ?");
    values.push(params.eventType);
  }
  if (params.programId) {
    conditions.push("program_id = ?");
    values.push(params.programId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  return db
    .prepare(`SELECT * FROM events ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...values, limit, offset) as EventRow[];
}

export function insertAuditEntry(
  action: string,
  actor: string,
  target: string | null,
  details: Record<string, unknown>
): AuditTrailRow {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO audit_trail (action, actor, target, details)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(action, actor, target, JSON.stringify(details));
  return db
    .prepare("SELECT * FROM audit_trail WHERE id = ?")
    .get(result.lastInsertRowid) as AuditTrailRow;
}

export function queryAuditTrail(params: {
  action?: string;
  actor?: string;
  limit?: number;
  offset?: number;
}): AuditTrailRow[] {
  const db = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.action) {
    conditions.push("action = ?");
    values.push(params.action);
  }
  if (params.actor) {
    conditions.push("actor = ?");
    values.push(params.actor);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  return db
    .prepare(
      `SELECT * FROM audit_trail ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(...values, limit, offset) as AuditTrailRow[];
}

export function getActiveWebhooks(eventType: string): WebhookRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM webhooks
       WHERE active = 1
         AND (event_types = '*' OR event_types LIKE ? OR event_types LIKE ? OR event_types LIKE ? OR event_types = ?)`
    )
    .all(
      `${eventType},%`,
      `%,${eventType},%`,
      `%,${eventType}`,
      eventType
    ) as WebhookRow[];
}

export function insertWebhookDelivery(
  webhookId: number,
  eventId: number,
  attempt: number,
  statusCode: number | null,
  responseBody: string | null,
  error: string | null
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO webhook_deliveries (webhook_id, event_id, attempt, status_code, response_body, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(webhookId, eventId, attempt, statusCode, responseBody, error);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    log.info("Database connection closed");
  }
}
