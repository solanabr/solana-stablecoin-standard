-- Events table
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    signature VARCHAR(100) NOT NULL UNIQUE,
    timestamp TIMESTAMP NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_signature ON events(signature);

-- Blacklist table
CREATE TABLE IF NOT EXISTS blacklist (
    id SERIAL PRIMARY KEY,
    address VARCHAR(44) NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    blacklisted_by VARCHAR(44) NOT NULL,
    blacklisted_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_blacklist_address ON blacklist(address);
CREATE INDEX idx_blacklist_active ON blacklist(is_active);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    actor VARCHAR(44) NOT NULL,
    target VARCHAR(44),
    details JSONB,
    signature VARCHAR(100),
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_actor ON audit_log(actor);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);

-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    event_types TEXT[] NOT NULL,
    is_active BOOLEAN DEFAULT true,
    retry_count INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Webhook deliveries table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id SERIAL PRIMARY KEY,
    webhook_id INTEGER REFERENCES webhooks(id),
    event_id INTEGER REFERENCES events(id),
    status VARCHAR(20) NOT NULL,
    attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP,
    response_code INTEGER,
    response_body TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
