import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import dotenv from 'dotenv';

import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { tokenRoutes } from './routes/tokens.js';
import { transactionRoutes } from './routes/transactions.js';
import { webhookRoutes } from './routes/webhooks.js';
import { analyticsRoutes } from './routes/analytics.js';
import { healthRoutes } from './routes/health.js';
import { operationsRoutes } from './routes/operations.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// =============================================================================
// Swagger Configuration
// =============================================================================
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Solana Stablecoin Standard API',
      version: '1.0.0',
      description: `
## SSS Backend API

Professional backend services for the Solana Stablecoin Standard (SSS) protocol.

### Features
- **Token Management**: Query and manage SSS-compliant stablecoins
- **Transaction Tracking**: Real-time transaction monitoring and history
- **Webhooks**: Event-driven notifications for on-chain events
- **Analytics**: Comprehensive metrics and reporting
- **Confidential Transfers**: Full SSS-3 CT lifecycle support

### Authentication
API key authentication via \`X-API-Key\` header.

### Rate Limits
- Standard: 100 requests/minute
- Premium: 1000 requests/minute
      `,
      contact: {
        name: 'SSS Team',
        url: 'https://github.com/solana-stablecoin-standard',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      { url: 'http://localhost:3001', description: 'Development' },
      { url: 'https://api.sss.dev', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// =============================================================================
// Middleware
// =============================================================================

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Body parsing & compression
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Logging
app.use(morgan('combined', {
  stream: { write: (message: string) => logger.http(message.trim()) },
}));

// =============================================================================
// Routes
// =============================================================================

// Swagger documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'SSS API Documentation',
}));

// API routes
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/tokens', tokenRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/operations', operationsRoutes);

// Root redirect to docs
app.get('/', (_, res) => {
  res.redirect('/api/docs');
});

// Error handling
app.use(errorHandler);

// =============================================================================
// Server Start
// =============================================================================

app.listen(PORT, () => {
  logger.info(`🚀 SSS Backend API running on port ${PORT}`);
  logger.info(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
  logger.info(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
