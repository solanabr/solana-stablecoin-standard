-- Solana Stablecoin Standard — database schema
-- Shared across all backend services

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Mint/Burn requests ──────────────────────────────────────────────────────

CREATE TABLE mint_requests (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mint        TEXT NOT NULL,
    recipient   TEXT NOT NULL,
    amount      NUMERIC(30, 0) NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending', -- pending | verified | executed | failed
    tx_sig      TEXT,
    minter      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    error       TEXT
);

CREATE TABLE burn_requests (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mint        TEXT NOT NULL,
    from_wallet TEXT NOT NULL,
    amount      NUMERIC(30, 0) NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    tx_sig      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    error       TEXT
);

-- ─── Event log (indexed from chain) ──────────────────────────────────────────

CREATE TABLE onchain_events (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mint        TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    tx_sig      TEXT NOT NULL UNIQUE,
    slot        BIGINT NOT NULL,
    block_time  TIMESTAMPTZ,
    data        JSONB NOT NULL DEFAULT '{}',
    indexed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_mint ON onchain_events(mint);
CREATE INDEX idx_events_type ON onchain_events(event_type);
CREATE INDEX idx_events_slot ON onchain_events(slot);

-- Track last processed slot per mint
CREATE TABLE indexer_state (
    mint            TEXT PRIMARY KEY,
    last_slot       BIGINT NOT NULL DEFAULT 0,
    last_signature  TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Compliance (SSS-2) ───────────────────────────────────────────────────────

CREATE TABLE blacklist_actions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mint        TEXT NOT NULL,
    address     TEXT NOT NULL,
    action      TEXT NOT NULL, -- 'add' | 'remove'
    reason      TEXT NOT NULL,
    tx_sig      TEXT,
    actor       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blacklist_address ON blacklist_actions(address);
CREATE INDEX idx_blacklist_mint ON blacklist_actions(mint);

CREATE TABLE seize_actions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mint        TEXT NOT NULL,
    from_wallet TEXT NOT NULL,
    to_wallet   TEXT NOT NULL,
    amount      NUMERIC(30, 0) NOT NULL,
    tx_sig      TEXT,
    seizer      TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mint        TEXT NOT NULL,
    action      TEXT NOT NULL,
    actor       TEXT NOT NULL,
    target      TEXT,
    amount      NUMERIC(30, 0),
    reason      TEXT,
    tx_sig      TEXT,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_mint ON audit_log(mint);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_actor ON audit_log(actor);

-- ─── Webhooks ─────────────────────────────────────────────────────────────────

CREATE TABLE webhook_endpoints (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url         TEXT NOT NULL,
    secret      TEXT,
    events      TEXT[] NOT NULL DEFAULT '{}',  -- [] = all events
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE webhook_deliveries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    endpoint_id     UUID NOT NULL REFERENCES webhook_endpoints(id),
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending', -- pending | delivered | failed
    attempts        INT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    next_retry_at   TIMESTAMPTZ,
    response_code   INT,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_deliveries_endpoint ON webhook_deliveries(endpoint_id);
CREATE INDEX idx_deliveries_next_retry ON webhook_deliveries(next_retry_at) WHERE status = 'pending';