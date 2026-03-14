import { Connection, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, Idl, EventParser, BorshCoder } from "@coral-xyz/anchor";
import { Pool } from "pg";

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8899";
const PROGRAM_ID = new PublicKey(
  process.env.STABLECOIN_PROGRAM_ID || "HCzhfNz2Kc2wBfacsWzLsM5EdyUEeypFHRzbpDeMb9RM"
);

console.log(`Starting SSS Indexer for program ${PROGRAM_ID.toBase58()} at ${RPC_URL}`);

const connection = new Connection(RPC_URL, "finalized");

// Event definitions for persistent audit trail
const IDL_PLACEHOLDER = {
    address: PROGRAM_ID.toBase58(),
    metadata: { name: "sss", version: "0.1.0", spec: "0.1.0" },
    instructions: [], accounts: [], types: [], 
    events: [
        { name: "MintEvent", discriminator: [183, 103, 126, 172, 19, 218, 59, 137], fields: [{ name: "amount", type: "u64", index: false }] },
        { name: "BurnEvent", discriminator: [217, 17, 196, 68, 50, 194, 212, 114], fields: [{ name: "amount", type: "u64", index: false }] },
        { name: "BlacklistAddEvent", discriminator: [213, 23, 115, 69, 114, 237, 240, 105], fields: [{ name: "account", type: "publicKey", index: false }, { name: "reason", type: "string", index: false }] },
        { name: "SeizeEvent", discriminator: [224, 76, 124, 185, 235, 128, 50, 247], fields: [{ name: "amount", type: "u64", index: false }] }
    ], 
    errors: [],
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/sss',
});

// Seed DB
pool.query(`
  CREATE TABLE IF NOT EXISTS stablecoin_events (
    id SERIAL PRIMARY KEY,
    tx_signature TEXT UNIQUE,
    event_name TEXT,
    data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(console.error);

async function main() {
    console.log("Subscribing to program logs and persisting to PostgreSQL...");

    const coder = new BorshCoder(IDL_PLACEHOLDER as unknown as Idl);
    const eventParser = new EventParser(PROGRAM_ID, coder);

    connection.onLogs(
        PROGRAM_ID,
        async (logs, ctx) => {
            if (logs.err) return;
            
            for (let event of eventParser.parseLogs(logs.logs)) {
                console.log(`[Indexer] Persisting ${event.name}: ${logs.signature}`);
                try {
                    await pool.query(
                        'INSERT INTO stablecoin_events (tx_signature, event_name, data) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                        [logs.signature, event.name, event.data]
                    );
                } catch (e) {
                    console.error("Persistence failed", e);
                }
            }
        },
        "finalized"
    );
}

main().catch(console.error);
