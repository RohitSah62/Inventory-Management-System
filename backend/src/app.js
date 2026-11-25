import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env.js';
import { createBasicAuthMiddleware } from './middleware/basicAuth.js';
import { createHealthRouter } from './routes/health.js';
import { createAuthRouter } from './routes/auth.js';
import { createInventoryRouter } from './routes/inventory.js';
import { createEventsRouter } from './routes/events.js';

export function createApp({
  pool,
  fifoService,
  eventBus,
  producer,
  getKafkaStatus,
  authConfig = config.auth,
  corsOrigin = config.corsOrigin,
}) {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(
    cors({
      origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  const basicAuth = createBasicAuthMiddleware(authConfig, { allowQueryToken: false });
  const sseAuth = createBasicAuthMiddleware(authConfig, { allowQueryToken: true });

  app.get('/', (_req, res) => {
    res.json({
      service: 'Inventory Management System (FIFO) API',
      health: '/health',
    });
  });

  app.use('/health', createHealthRouter({ pool, getKafkaStatus }));
  app.use('/api/auth', createAuthRouter(basicAuth));
  app.use('/api/inventory', basicAuth, createInventoryRouter(fifoService));
  app.use(
    '/api/events',
    createEventsRouter({
      eventBus,
      producer,
      basicAuthMiddleware: basicAuth,
      sseAuthMiddleware: sseAuth,
    })
  );

  app.use((err, _req, res, _next) => {
    console.error('Unhandled API error:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
    });
  });

  return app;
}
