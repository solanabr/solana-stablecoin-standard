"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.burnRouter = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const burnService_1 = require("../services/burnService");
const logger_1 = require("../../shared/logger");
const router = (0, express_1.Router)();
exports.burnRouter = router;
const burnService = new burnService_1.BurnService();
router.post("/", [
    (0, express_validator_1.body)("amount").isString().matches(/^\d+$/),
    (0, express_validator_1.body)("authority").optional().isString(),
    (0, express_validator_1.body)("account").optional().isString(),
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
        const { amount, authority, account } = req.body;
        logger_1.logger.info(`Burn request: ${amount} tokens`);
        const result = await burnService.burn({
            amount,
            authority,
            account,
        });
        if (result.success) {
            return res.status(200).json({
                success: true,
                data: {
                    signature: result.signature,
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
