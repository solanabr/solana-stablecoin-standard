CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    mint TEXT NOT NULL,
    event_type TEXT NOT NULL,
    transaction_signature TEXT UNIQUE NOT NULL,
    slot BIGINT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_mint_type ON events(mint, event_type);
CREATE INDEX IF NOT EXISTS idx_events_slot ON events(slot);

CREATE TABLE IF NOT EXISTS blacklist_status (
    mint TEXT NOT NULL,
    wallet TEXT NOT NULL,
    is_blacklisted BOOLEAN NOT NULL,
    reason TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (mint, wallet)
);

CREATE TABLE IF NOT EXISTS minter_activity (
    mint TEXT NOT NULL,
    minter TEXT NOT NULL,
    current_allowance BIGINT NOT NULL,
    total_minted BIGINT NOT NULL,
    is_active BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (mint, minter)
);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    mint TEXT NOT NULL,
    event_types TEXT[] NOT NULL,
    url TEXT NOT NULL,
    secret TEXT,
    is_active BOOLEAN DEFAULT TRUE
);
