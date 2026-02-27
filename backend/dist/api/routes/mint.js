"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mintRouter = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const mintService_1 = require("../services/mintService");
const logger_1 = require("../../shared/logger");
const router = (0, express_1.Router)();
exports.mintRouter = router;
const mintService = new mintService_1.MintService();
router.post("/", [
    (0, express_validator_1.body)("recipient")
        .isString()
        .matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
    (0, express_validator_1.body)("amount").isString().matches(/^\d+$/),
    (0, express_validator_1.body)("authority").optional().isString(),
], async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: "Validation failed",
                details: errors.array(),
            });
        }
        const { recipient, amount, authority } = req.body;
        logger_1.logger.info(`Mint request: ${amount} tokens to ${recipient}`);
        const result = await mintService.mint({
            recipient,
            amount,
            authority,
        });
        if (result.success) {
            return res.status(200).json({
                success: true,
                data: {
                    signature: result.signature,
                    recipient,
                    amount,
                },
            });
        }
        else {
            return res.status(400).json({
                success: false,
                error: result.error,
            });
        }
    }
    catch (error) {
        next(error);
    }
});
router.get("/queue", async (req, res) => {
    try {
        const queue = await mintService.getPendingMints();
        res.json({ success: true, data: queue });
    }
    catch (error) {
        res.status(500).json({ success: false, error: "Failed to get queue" });
    }
});
