-- SSS Indexer Database Schema

CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    type VARCHAR(32) NOT NULL,
    signature VARCHAR(128) NOT NULL UNIQUE,
    slot BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_type ON events (type);
CREATE INDEX idx_events_slot ON events (slot);
CREATE INDEX idx_events_timestamp ON events (timestamp);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id VARCHAR(64) PRIMARY KEY,
    url TEXT NOT NULL,
    events TEXT[] NOT NULL DEFAULT '{"*"}',
    secret VARCHAR(128) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id BIGSERIAL PRIMARY KEY,
    subscription_id VARCHAR(64) NOT NULL REFERENCES webhook_subscriptions(id),
    event_signature VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    http_status INTEGER,
    error TEXT,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deliveries_status ON webhook_deliveries (status);
CREATE INDEX idx_deliveries_subscription ON webhook_deliveries (subscription_id);

CREATE TABLE IF NOT EXISTS compliance_alerts (
    id VARCHAR(128) PRIMARY KEY,
    type VARCHAR(64) NOT NULL,
    severity VARCHAR(16) NOT NULL,
    mint VARCHAR(64),
    details JSONB NOT NULL DEFAULT '{}',
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_severity ON compliance_alerts (severity);
CREATE INDEX idx_alerts_acknowledged ON compliance_alerts (acknowledged);

CREATE TABLE IF NOT EXISTS lifecycle_requests (
    id VARCHAR(64) PRIMARY KEY,
    type VARCHAR(8) NOT NULL, -- 'mint' or 'burn'
    mint VARCHAR(64) NOT NULL,
    destination VARCHAR(64),
    amount BIGINT NOT NULL,
    requested_by VARCHAR(64) NOT NULL,
    approved_by VARCHAR(64),
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    tx_signature VARCHAR(128),
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);

CREATE INDEX idx_lifecycle_status ON lifecycle_requests (status);
CREATE INDEX idx_lifecycle_mint ON lifecycle_requests (mint);
