import { Router } from 'express';

export function createHealthRouter({ pool, getKafkaStatus }) {
  const router = Router();

  router.get('/', async (_req, res) => {
    let dbOk = false;
    try {
      await pool.query('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }

    const kafka = getKafkaStatus ? getKafkaStatus() : { consumerRunning: false, producerConnected: false };

    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ok' : 'degraded',
      database: dbOk ? 'connected' : 'disconnected',
      kafka,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
