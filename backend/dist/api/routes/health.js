"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const express_1 = require("express");
const web3_js_1 = require("@solana/web3.js");
const router = (0, express_1.Router)();
exports.healthRouter = router;
router.get("/", async (req, res) => {
    res.json({
        success: true,
        data: {
            status: "healthy",
            timestamp: new Date().toISOString(),
            service: "sss-token-api",
            version: "0.1.0",
        },
    });
});
router.get("/solana", async (req, res) => {
    try {
        const network = process.env.SOLANA_NETWORK || "devnet";
        const connection = new web3_js_1.Connection(process.env.SOLANA_RPC_URL || (0, web3_js_1.clusterApiUrl)("devnet"), "confirmed");
        const slot = await connection.getSlot();
        const blockTime = await connection.getBlockTime(slot);
        res.json({
            success: true,
            data: {
                network,
                slot,
                blockTime,
                rpc: process.env.SOLANA_RPC_URL || (0, web3_js_1.clusterApiUrl)("devnet"),
            },
        });
    }
    catch (error) {
        res.status(503).json({
            success: false,
            error: "Solana connection failed",
            message: error.message,
        });
    }
});
