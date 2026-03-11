-- SSS Backend Services: Initial Schema

-- Indexer: raw events
CREATE TABLE IF NOT EXISTS sss_events (
  id            BIGSERIAL PRIMARY KEY,
  signature     TEXT NOT NULL UNIQUE,
  slot          BIGINT NOT NULL,
  block_time    TIMESTAMPTZ,
  event_type    TEXT NOT NULL,
  mint          TEXT NOT NULL,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_mint_type ON sss_events(mint, event_type);
CREATE INDEX IF NOT EXISTS idx_events_slot ON sss_events(slot);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON sss_events(created_at DESC);

-- Indexer: off-chain state per mint
CREATE TABLE IF NOT EXISTS mint_state (
  mint          TEXT PRIMARY KEY,
  total_supply  NUMERIC NOT NULL DEFAULT 0,
  is_paused     BOOLEAN NOT NULL DEFAULT false,
  last_slot     BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Indexer: polling cursor
CREATE TABLE IF NOT EXISTS indexer_cursor (
  program_id     TEXT PRIMARY KEY,
  last_signature TEXT NOT NULL,
  last_slot      BIGINT NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Mint/Burn: request lifecycle
CREATE TABLE IF NOT EXISTS mint_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE,
  mint            TEXT NOT NULL,
  recipient       TEXT NOT NULL,
  amount          NUMERIC NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  tx_signature    TEXT,
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mint_requests_status ON mint_requests(status);
CREATE INDEX IF NOT EXISTS idx_mint_requests_mint ON mint_requests(mint);

CREATE TABLE IF NOT EXISTS burn_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE,
  mint            TEXT NOT NULL,
  from_account    TEXT NOT NULL,
  amount          NUMERIC NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  tx_signature    TEXT,
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_burn_requests_status ON burn_requests(status);
CREATE INDEX IF NOT EXISTS idx_burn_requests_mint ON burn_requests(mint);

-- Webhook: subscriptions
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url           TEXT NOT NULL,
  secret        TEXT NOT NULL,
  event_types   TEXT[] NOT NULL,
  mint_filter   TEXT,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_subs_active ON webhook_subscriptions(active);

-- Webhook: delivery attempts
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              BIGSERIAL PRIMARY KEY,
  subscription_id UUID REFERENCES webhook_subscriptions(id),
  event_id        BIGINT REFERENCES sss_events(id),
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INT DEFAULT 0,
  last_status_code INT,
  next_retry_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deliveries_status_retry ON webhook_deliveries(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_sub ON webhook_deliveries(subscription_id);

-- Compliance: screening results
CREATE TABLE IF NOT EXISTS screening_results (
  id            BIGSERIAL PRIMARY KEY,
  address       TEXT NOT NULL,
  provider      TEXT NOT NULL,
  result        TEXT NOT NULL,
  details       JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_screening_address ON screening_results(address);

-- Compliance: alerts
CREATE TABLE IF NOT EXISTS compliance_alerts (
  id            BIGSERIAL PRIMARY KEY,
  event_id      BIGINT REFERENCES sss_events(id),
  mint          TEXT NOT NULL,
  rule          TEXT NOT NULL,
  severity      TEXT NOT NULL,
  details       JSONB,
  resolved      BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_mint_severity ON compliance_alerts(mint, severity);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON compliance_alerts(resolved);
