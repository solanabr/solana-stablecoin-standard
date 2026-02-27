"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const mint_1 = require("./routes/mint");
const burn_1 = require("./routes/burn");
const health_1 = require("./routes/health");
const error_1 = require("./middleware/error");
const rateLimit_1 = require("./middleware/rateLimit");
const logger_1 = require("../shared/logger");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Security middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
// Rate limiting
app.use(rateLimit_1.rateLimiter);
// Body parsing
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Routes
app.use("/health", health_1.healthRouter);
app.use("/api/mint", mint_1.mintRouter);
app.use("/api/burn", burn_1.burnRouter);
// Error handling
app.use(error_1.errorHandler);
// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, error: "Not found" });
});
app.listen(PORT, () => {
    logger_1.logger.info(`SSS Token API running on port ${PORT}`);
    logger_1.logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
});
exports.default = app;
