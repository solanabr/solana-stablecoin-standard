"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const logger_1 = require("../../shared/logger");
function errorHandler(err, req, res, next) {
    logger_1.logger.error("Error:", {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).json({
        success: false,
        error: "Internal server error",
        message: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
}
