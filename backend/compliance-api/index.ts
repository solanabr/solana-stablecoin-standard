import express from 'express';
import cors from 'cors';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as os from 'os';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8899';
const PROGRAM_ID = process.env.PROGRAM_ID || '451UiDzutoMvqZkEj94PSNQTZELV4JqWRdiSoiJB9bxp';

// Настраиваем подключение (read-only для индексатора)
const connection = new Connection(RPC_URL, 'confirmed');

// База данных в памяти (для хакатона этого достаточно)
const auditLogs: any[] = [];
const blacklistDb: string[] = [];

// --- ЭНДПОИНТЫ REST API ---

// 1. Получить историю всех событий (Audit Trail)
app.get('/api/audit', (req, res) => {
    res.json({
        success: true,
        count: auditLogs.length,
        logs: auditLogs
    });
});

// 2. Внешняя проверка KYC/AML (Mock)
app.post('/api/aml-check', (req, res) => {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Address is required' });

    // Симуляция: адреса, начинающиеся на 'B' (Bad), блокируются
    const isSanctioned = address.startsWith('B') || blacklistDb.includes(address);
    
    res.json({
        address,
        isSanctioned,
        riskScore: isSanctioned ? 99 : 12,
        recommendedAction: isSanctioned ? 'BLACKLIST' : 'ALLOW'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Compliance API & Indexer running on http://localhost:${PORT}`);
    console.log(`📡 Listening to Solana network at ${RPC_URL}`);
    console.log(`👀 Watching Program ID: ${PROGRAM_ID}`);
});