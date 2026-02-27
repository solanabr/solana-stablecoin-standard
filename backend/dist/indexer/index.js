"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const web3_js_1 = require("@solana/web3.js");
const logger_1 = require("../shared/logger");
const database_1 = require("./database");
const node_cron_1 = __importDefault(require("node-cron"));
const PROGRAM_ID = new web3_js_1.PublicKey(process.env.SSS2_PROGRAM_ID || "97WYcUSr6Y9YaDTM55PJYuAXpLL552HS6WXxVBmxAGmx");
const POLLING_INTERVAL = parseInt(process.env.POLLING_INTERVAL || "5000");
class EventIndexer {
    constructor() {
        this.connection = new web3_js_1.Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
        this.currentSlot = 0;
        this.lastProcessedSignature = null;
    }
    async start() {
        logger_1.logger.info("Starting SSS Event Indexer...");
        logger_1.logger.info(`Monitoring program: ${PROGRAM_ID.toString()}`);
        // Initialize database
        await (0, database_1.initializeDatabase)();
        // Get starting slot
        const slot = await this.connection.getSlot();
        this.currentSlot = slot;
        logger_1.logger.info(`Starting from slot: ${slot}`);
        // Start polling
        this.pollEvents();
        // Also run cron job for backfill
        node_cron_1.default.schedule("*/5 * * * *", () => {
            this.backfillEvents();
        });
    }
    async pollEvents() {
        try {
            const signatures = await this.connection.getSignaturesForAddress(PROGRAM_ID, { limit: 10 }, "confirmed");
            for (const sigInfo of signatures) {
                if (sigInfo.signature === this.lastProcessedSignature) {
                    break;
                }
                await this.processTransaction(sigInfo.signature);
            }
            if (signatures.length > 0) {
                this.lastProcessedSignature = signatures[0].signature;
            }
        }
        catch (error) {
            logger_1.logger.error("Polling error:", error);
        }
        setTimeout(() => this.pollEvents(), POLLING_INTERVAL);
    }
    async processTransaction(signature) {
        try {
            const tx = await this.connection.getParsedTransaction(signature, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 0,
            });
            if (!tx || !tx.meta)
                return;
            const blockTime = tx.blockTime;
            const slot = tx.slot;
            // Process logs
            if (tx.meta.logMessages) {
                for (const log of tx.meta.logMessages) {
                    if (log.includes("Transfer hook executed")) {
                        await this.handleTransferEvent({
                            signature,
                            slot,
                            blockTime: blockTime || null,
                            programId: PROGRAM_ID.toString(),
                            instruction: "execute_transfer_hook",
                            data: this.parseTransferLog(log),
                        });
                    }
                    if (log.includes("Fee config updated")) {
                        await this.handleFeeUpdateEvent({
                            signature,
                            slot,
                            blockTime: blockTime || null,
                            programId: PROGRAM_ID.toString(),
                            instruction: "update_fee_config",
                            data: {},
                        });
                    }
                    if (log.includes("Added to BLACKLIST")) {
                        await this.handleBlacklistAdd({
                            signature,
                            slot,
                            blockTime: blockTime || null,
                            programId: PROGRAM_ID.toString(),
                            instruction: "add_blacklist",
                            data: this.parseAddressLog(log),
                        });
                    }
                    if (log.includes("Added to whitelist")) {
                        await this.handleWhitelistAdd({
                            signature,
                            slot,
                            blockTime: blockTime || null,
                            programId: PROGRAM_ID.toString(),
                            instruction: "add_whitelist",
                            data: this.parseAddressLog(log),
                        });
                    }
                }
            }
            logger_1.logger.info(`Processed: ${signature.substring(0, 20)}...`);
        }
        catch (error) {
            logger_1.logger.error(`Failed to process ${signature}:`, error);
        }
    }
    parseTransferLog(log) {
        // Parse log for transfer details
        const match = log.match(/Source:\s*(\S+)\.\s*Destination:\s*(\S+)\.\s*Amount:\s*(\d+)/i);
        if (match) {
            return {
                source: match[1],
                destination: match[2],
                amount: parseInt(match[3]),
            };
        }
        return {};
    }
    parseAddressLog(log) {
        const match = log.match(/:\s*([1-9A-HJ-NP-Za-km-z]{32,44})/);
        if (match) {
            return { address: match[1] };
        }
        return {};
    }
    async handleTransferEvent(event) {
        logger_1.logger.info(`Transfer event: ${event.data.source} -> ${event.data.destination}`);
        // Save to database
        await database_1.db.query(`INSERT INTO transfers (signature, slot, block_time, source, destination, amount, program_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (signature) DO NOTHING`, [
            event.signature,
            event.slot,
            event.blockTime || null,
            event.data.source,
            event.data.destination,
            event.data.amount,
            event.programId,
        ]);
    }
    async handleFeeUpdateEvent(event) {
        logger_1.logger.info(`Fee config updated in ${event.signature}`);
        await database_1.db.query(`INSERT INTO fee_updates (signature, slot, block_time, program_id, data)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (signature) DO NOTHING`, [
            event.signature,
            event.slot,
            event.blockTime || null,
            event.programId,
            JSON.stringify(event.data),
        ]);
    }
    async handleBlacklistAdd(event) {
        logger_1.logger.info(`Address blacklisted: ${event.data.address}`);
        await database_1.db.query(`INSERT INTO blacklist_events (signature, slot, block_time, address, action, program_id)
       VALUES ($1, $2, $3, $4, 'add', $5)
       ON CONFLICT (signature) DO NOTHING`, [
            event.signature,
            event.slot,
            event.blockTime,
            event.data.address,
            event.programId,
        ]);
    }
    async handleWhitelistAdd(event) {
        logger_1.logger.info(`Address whitelisted: ${event.data.address}`);
        await database_1.db.query(`INSERT INTO whitelist_events (signature, slot, block_time, address, action, program_id)
       VALUES ($1, $2, $3, $4, 'add', $5)
       ON CONFLICT (signature) DO NOTHING`, [
            event.signature,
            event.slot,
            event.blockTime || null,
            event.data.address,
            event.programId,
        ]);
    }
    async backfillEvents() {
        logger_1.logger.info("Running backfill...");
        // Implement backfill logic here
    }
}
// Start indexer
const indexer = new EventIndexer();
indexer.start().catch((error) => {
    logger_1.logger.error("Indexer failed to start:", error);
    process.exit(1);
});
exports.default = EventIndexer;
