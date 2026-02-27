"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const web3_js_1 = require("@solana/web3.js");
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("../shared/logger");
const database_1 = require("./database");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use(express_1.default.json());
const PROGRAM_ID = new web3_js_1.PublicKey(process.env.SSS2_PROGRAM_ID || "97WYcUSr6Y9YaDTM55PJYuAXpLL552HS6WXxVBmxAGmx");
const connection = new web3_js_1.Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
// ==================== COMPLIANCE CHECKS ====================
/**
 * Check if an address is blacklisted
 */
app.post("/check/blacklist", [
    (0, express_validator_1.body)("address")
        .isString()
        .matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Invalid address" });
    }
    const { address } = req.body;
    try {
        // Check database
        const result = await database_1.db.query("SELECT * FROM blacklist_events WHERE address = $1 AND action = 'add' ORDER BY slot DESC LIMIT 1", [address]);
        const isBlacklisted = result.rows.length > 0;
        logger_1.logger.info(`Blacklist check: ${address} = ${isBlacklisted}`);
        res.json({
            success: true,
            data: {
                address,
                isBlacklisted,
                details: isBlacklisted ? result.rows[0] : null,
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Blacklist check error:", error);
        res.status(500).json({ error: "Check failed" });
    }
});
/**
 * Check if an address is whitelisted
 */
app.post("/check/whitelist", [
    (0, express_validator_1.body)("address")
        .isString()
        .matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Invalid address" });
    }
    const { address } = req.body;
    try {
        const result = await database_1.db.query("SELECT * FROM whitelist_events WHERE address = $1 AND action = 'add' ORDER BY slot DESC LIMIT 1", [address]);
        const isWhitelisted = result.rows.length > 0;
        res.json({
            success: true,
            data: {
                address,
                isWhitelisted,
                details: isWhitelisted ? result.rows[0] : null,
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Whitelist check error:", error);
        res.status(500).json({ error: "Check failed" });
    }
});
/**
 * Full compliance check for a transfer
 */
app.post("/check/transfer", [
    (0, express_validator_1.body)("source")
        .isString()
        .matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
    (0, express_validator_1.body)("destination")
        .isString()
        .matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
    (0, express_validator_1.body)("amount").optional().isString(),
], async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Invalid input" });
    }
    const { source, destination, amount } = req.body;
    try {
        const startTime = Date.now();
        // Check both source and destination
        const [sourceBlacklist, destBlacklist] = await Promise.all([
            checkBlacklist(source),
            checkBlacklist(destination),
        ]);
        // Check whitelist status
        const [sourceWhitelist, destWhitelist] = await Promise.all([
            checkWhitelist(source),
            checkWhitelist(destination),
        ]);
        const isCompliant = !sourceBlacklist && !destBlacklist;
        const responseTime = Date.now() - startTime;
        logger_1.logger.info(`Transfer check: ${source.slice(0, 8)}... -> ${destination.slice(0, 8)}... = ${isCompliant ? "COMPLIANT" : "REJECTED"}`);
        res.json({
            success: true,
            data: {
                source: {
                    address: source,
                    isBlacklisted: sourceBlacklist,
                    isWhitelisted: sourceWhitelist,
                },
                destination: {
                    address: destination,
                    isBlacklisted: destBlacklist,
                    isWhitelisted: destWhitelist,
                },
                amount,
                isCompliant,
                shouldProceed: isCompliant,
                responseTimeMs: responseTime,
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Transfer check error:", error);
        res.status(500).json({ error: "Check failed" });
    }
});
/**
 * Batch compliance check
 */
app.post("/check/batch", [(0, express_validator_1.body)("addresses").isArray({ min: 1, max: 100 })], async (req, res) => {
    const { addresses } = req.body;
    try {
        const results = await Promise.all(addresses.map(async (address) => {
            const [isBlacklisted, isWhitelisted] = await Promise.all([
                checkBlacklist(address),
                checkWhitelist(address),
            ]);
            return {
                address,
                isBlacklisted,
                isWhitelisted,
                status: isBlacklisted
                    ? "blocked"
                    : isWhitelisted
                        ? "whitelisted"
                        : "standard",
            };
        }));
        res.json({
            success: true,
            data: {
                total: results.length,
                blocked: results.filter((r) => r.isBlacklisted).length,
                whitelisted: results.filter((r) => r.isWhitelisted).length,
                results,
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Batch check error:", error);
        res.status(500).json({ error: "Batch check failed" });
    }
});
/**
 * Get compliance stats
 */
app.get("/stats", async (req, res) => {
    try {
        const [blacklistCount, whitelistCount] = await Promise.all([
            database_1.db.query("SELECT COUNT(DISTINCT address) as count FROM blacklist_events WHERE action = 'add'"),
            database_1.db.query("SELECT COUNT(DISTINCT address) as count FROM whitelist_events WHERE action = 'add'"),
        ]);
        res.json({
            success: true,
            data: {
                blacklist: {
                    totalAddresses: parseInt(blacklistCount.rows[0].count),
                },
                whitelist: {
                    totalAddresses: parseInt(whitelistCount.rows[0].count),
                },
                program: PROGRAM_ID.toString(),
                network: process.env.SOLANA_NETWORK || "devnet",
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Stats error:", error);
        res.status(500).json({ error: "Failed to get stats" });
    }
});
// Health check
app.get("/health", (req, res) => {
    res.json({ status: "healthy", service: "compliance" });
});
// Helper functions
async function checkBlacklist(address) {
    const result = await database_1.db.query("SELECT 1 FROM blacklist_events WHERE address = $1 AND action = 'add' LIMIT 1", [address]);
    return result.rows.length > 0;
}
async function checkWhitelist(address) {
    const result = await database_1.db.query("SELECT 1 FROM whitelist_events WHERE address = $1 AND action = 'add' LIMIT 1", [address]);
    return result.rows.length > 0;
}
// Initialize database
Promise.resolve().then(() => __importStar(require("./database"))).then(async ({ initializeDatabase }) => {
    await initializeDatabase();
    app.listen(PORT, () => {
        logger_1.logger.info(`Compliance Service running on port ${PORT}`);
    });
});
exports.default = app;
