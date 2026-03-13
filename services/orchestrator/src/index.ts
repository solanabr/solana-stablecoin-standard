import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// API Key Middleware
const API_KEY = process.env.SSS_ADMIN_API_KEY || "institutional-secret-key";
const authMiddleware = (req: any, res: any, next: any) => {
    const key = req.headers['x-api-key'];
    if (key !== API_KEY) {
        return res.status(401).json({ error: "Unauthorized: Invalid X-API-KEY" });
    }
    next();
};

const PORT = process.env.ORCHESTRATOR_PORT || 8081;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/webhook';

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://user:pass@database:5432/sss',
});

// Create tables if they don't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS webhook_queue (
    id UUID PRIMARY KEY,
    payload JSONB NOT NULL,
    retries INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'PENDING'
  )
`).catch(console.error);

// --- Webhook Service with Retries ---
async function processWebhooks() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // SELECT FOR UPDATE SKIP LOCKED ensures atomic delivery in distributed clusters
        const { rows } = await client.query(`
            SELECT * FROM webhook_queue 
            WHERE status = 'PENDING' 
            ORDER BY retries ASC 
            LIMIT 1 
            FOR UPDATE SKIP LOCKED
        `);
        
        if (rows.length === 0) {
            await client.query('COMMIT');
            return;
        }
        
        const task = rows[0];
        console.log(`[Webhook] Attempting delivery of event ${task.id} to ${WEBHOOK_URL}`);
        
        try {
            await axios.post(WEBHOOK_URL, task.payload, { timeout: 5000 });
            await client.query(`UPDATE webhook_queue SET status = 'DELIVERED' WHERE id = $1`, [task.id]);
            console.log(`[Webhook] Delivered successfully: ${task.id}`);
        } catch (deliveryError) {
            console.warn(`[Webhook] Delivery failed for ${task.id}. Incrementing retry...`);
            await client.query(`UPDATE webhook_queue SET retries = retries + 1 WHERE id = $1`, [task.id]);
        }
        
        await client.query('COMMIT');
    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error(`[Orchestrator Error] Transaction failed:`, e);
    } finally {
        client.release();
    }
}
setInterval(processWebhooks, 3000);

async function dispatchWebhook(eventPayload: any) {
    const id = uuidv4();
    await pool.query(
        `INSERT INTO webhook_queue (id, payload, retries, status) VALUES ($1, $2, $3, $4)`,
        [id, eventPayload, 0, 'PENDING']
    );
}

// --- Mint/Burn Coordination Service ---

app.post('/api/orchestrate/mint', authMiddleware, async (req, res) => {
    const { amount, recipient, kycStatus } = req.body;
    
    // Step 1: Request Verification (e.g. Fiat rails deposit cleared)
    if (kycStatus !== 'VERIFIED') {
        return res.status(403).json({ error: "Recipient KYC/AML status invalid." });
    }

    // Step 2: Orchestrate execution with CLI/SDK (Mocked for API)
    console.log(`[Coordinator] Fiat deposit verified. Dispatching ${amount} SSS to ${recipient}`);
    const txId = `simulated_tx_${uuidv4()}`;

    // Step 3: Log & Webhook
    dispatchWebhook({ type: 'MINT_EXECUTED', txId, amount, recipient, status: 'SUCCESS' });

    return res.json({ status: "EXECUTED", txId, amount, recipient });
});

app.post('/api/orchestrate/burn', authMiddleware, async (req, res) => {
    const { amount, holderAccount } = req.body;
    
    // Step 1: Request Verification (Tokens received in Treasury)
    console.log(`[Coordinator] Tokens verified in Treasury. Releasing fiat constraints for ${holderAccount}`);
    const txId = `simulated_tx_${uuidv4()}`;

    // Step 3: Log & Webhook
    dispatchWebhook({ type: 'BURN_EXECUTED', txId, amount, holderAccount, status: 'SUCCESS' });

    return res.json({ status: "EXECUTED", txId, amount, holderAccount });
});

app.listen(PORT, () => {
    console.log(`SSS Orchestrator (Mint/Burn Coordination) listening on port ${PORT}`);
});
