import { Router } from 'express';
import { generateSimulatedBatch } from '../kafka/simulatorEvents.js';
import { validateInventoryEvent } from '../services/fifoService.js';

export function createEventsRouter({ eventBus, producer, basicAuthMiddleware, sseAuthMiddleware }) {
  const router = Router();

  router.get('/stream', sseAuthMiddleware, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (type, payload) => {
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    sendEvent('connected', { message: 'Subscribed to live inventory stream' });

    const unsubscribe = eventBus.subscribe((msg) => {
      sendEvent(msg.type, msg);
    });

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  });

  router.post('/simulate', basicAuthMiddleware, async (req, res, next) => {
    try {
      if (!producer) {
        return res.status(503).json({ error: 'Kafka producer is not configured' });
      }

      let events;
      if (req.body && req.body.event) {
        const validated = validateInventoryEvent(req.body.event);
        events = [validated];
      } else {
        const count = req.body?.count ?? 8;
        events = generateSimulatedBatch(count);
      }

      const publishedCount = await producer.publishEvents(events);
      res.status(202).json({
        status: 'published',
        published_count: publishedCount,
        events,
      });
    } catch (err) {
      if (err.message && (err.message.includes('required') || err.message.includes('must be'))) {
        return res.status(400).json({ error: err.message });
      }
      return next(err);
    }
  });

  return router;
}
