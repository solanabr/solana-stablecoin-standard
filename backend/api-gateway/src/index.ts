import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import winston from 'winston';

const app = express();

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Environment variables
const PORT = process.env.PORT || 3000;
const MINT_SERVICE_URL = process.env.MINT_SERVICE_URL || 'http://mint-service:3001';
const COMPLIANCE_SERVICE_URL = process.env.COMPLIANCE_SERVICE_URL || 'http://compliance-service:3003';
const WEBHOOK_SERVICE_URL = process.env.WEBHOOK_SERVICE_URL || 'http://webhook-service:3004';

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  logger.info('Request received', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Service status
app.get('/api/status', async (req, res) => {
  const services = {
    mintService: MINT_SERVICE_URL,
    complianceService: COMPLIANCE_SERVICE_URL,
    webhookService: WEBHOOK_SERVICE_URL,
  };

  res.json({
    gateway: 'healthy',
    services,
    timestamp: new Date().toISOString(),
  });
});

// Proxy to Mint Service
app.use(
  '/api/mint',
  createProxyMiddleware({
    target: MINT_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      '^/api/mint': '/api',
    },
    onProxyReq: (proxyReq, req) => {
      logger.info('Proxying to mint service', { path: req.path });
    },
    onError: (err, req, res) => {
      logger.error('Mint service proxy error', { error: err.message });
      res.status(503).json({ error: 'Mint service unavailable' });
    },
  })
);

// Proxy to Compliance Service
app.use(
  '/api/compliance',
  createProxyMiddleware({
    target: COMPLIANCE_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      '^/api/compliance': '/api',
    },
    onProxyReq: (proxyReq, req) => {
      logger.info('Proxying to compliance service', { path: req.path });
    },
    onError: (err, req, res) => {
      logger.error('Compliance service proxy error', { error: err.message });
      res.status(503).json({ error: 'Compliance service unavailable' });
    },
  })
);

// Proxy to Webhook Service
app.use(
  '/api/webhooks',
  createProxyMiddleware({
    target: WEBHOOK_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      '^/api/webhooks': '/api/webhooks',
    },
    onProxyReq: (proxyReq, req) => {
      logger.info('Proxying to webhook service', { path: req.path });
    },
    onError: (err, req, res) => {
      logger.error('Webhook service proxy error', { error: err.message });
      res.status(503).json({ error: 'Webhook service unavailable' });
    },
  })
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    timestamp: new Date().toISOString(),
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`API Gateway started on port ${PORT}`);
  logger.info('Service endpoints:', {
    mint: MINT_SERVICE_URL,
    compliance: COMPLIANCE_SERVICE_URL,
    webhook: WEBHOOK_SERVICE_URL,
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});
