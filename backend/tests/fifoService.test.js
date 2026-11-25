import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';
import request from 'supertest';

import { createFifoService } from '../src/services/fifoService.js';
import { createEventBus } from '../src/services/eventBus.js';
import { createKafkaConsumer } from '../src/kafka/consumer.js';
import { createApp } from '../src/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupTestDb() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const schemaPath = path.join(__dirname, '../src/db/schema.sql');
  let schemaSql = await fs.readFile(schemaPath, 'utf8');
  // pg-mem does not support partial index WHERE predicates in all versions; strip partial WHERE for in-memory test
  schemaSql = schemaSql.replace(/\s+WHERE remaining_quantity > 0/g, '');
  db.public.none(schemaSql);

  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const eventBus = createEventBus();
  const fifoService = createFifoService(pool, eventBus, { useRowLock: false });

  return { pool, eventBus, fifoService };
}

test('FIFO logic: consumes oldest batches first and tracks exact allocations', async () => {
  const { pool, fifoService } = await setupTestDb();

  await fifoService.processEvent({
    product_id: 'PRD001',
    event_type: 'purchase',
    quantity: 50,
    unit_price: 100.0,
    timestamp: '2025-07-12T10:00:00Z',
  });

  await fifoService.processEvent({
    product_id: 'PRD001',
    event_type: 'purchase',
    quantity: 30,
    unit_price: 120.0,
    timestamp: '2025-07-12T11:00:00Z',
  });

  const saleResult = await fifoService.processEvent({
    product_id: 'PRD001',
    event_type: 'sale',
    quantity: 60,
    timestamp: '2025-07-12T12:00:00Z',
  });

  assert.equal(saleResult.status, 'processed');
  assert.equal(saleResult.sale.quantity_sold, 60);
  // 50 * 100 + 10 * 120 = 6200
  assert.equal(saleResult.sale.total_cost, 6200);
  assert.equal(saleResult.sale.allocations.length, 2);
  assert.equal(saleResult.sale.allocations[0].quantity_consumed, 50);
  assert.equal(saleResult.sale.allocations[0].unit_price, 100);
  assert.equal(saleResult.sale.allocations[0].cost, 5000);
  assert.equal(saleResult.sale.allocations[1].quantity_consumed, 10);
  assert.equal(saleResult.sale.allocations[1].unit_price, 120);
  assert.equal(saleResult.sale.allocations[1].cost, 1200);

  const overview = await fifoService.getStockOverview();
  assert.equal(overview.length, 1);
  assert.equal(overview[0].product_id, 'PRD001');
  assert.equal(overview[0].current_quantity, 20);
  assert.equal(overview[0].total_inventory_cost, 2400);
  assert.equal(overview[0].average_cost_per_unit, 120);
  assert.equal(overview[0].active_batches, 1);

  const ledger = await fifoService.getTransactionLedger({ productId: 'PRD001' });
  assert.equal(ledger.length, 3);
  assert.equal(ledger[0].event_type, 'sale');
  assert.equal(ledger[0].total_cost, 6200);
  assert.equal(ledger[0].allocations.length, 2);

  await pool.end();
});

test('FIFO logic: handles decimal quantities cleanly and rejects insufficient stock', async () => {
  const { pool, fifoService } = await setupTestDb();

  await fifoService.processEvent({
    product_id: 'PRD002',
    event_type: 'purchase',
    quantity: 0.3,
    unit_price: 10,
    timestamp: '2025-07-12T10:00:00Z',
  });

  const saleOk = await fifoService.processEvent({
    product_id: 'PRD002',
    event_type: 'sale',
    quantity: 0.1,
    timestamp: '2025-07-12T10:05:00Z',
  });
  assert.equal(saleOk.status, 'processed');
  assert.equal(saleOk.sale.total_cost, 1);

  const saleFail = await fifoService.processEvent({
    product_id: 'PRD002',
    event_type: 'sale',
    quantity: 0.5,
    timestamp: '2025-07-12T10:10:00Z',
  });
  assert.equal(saleFail.status, 'rejected');
  assert.match(saleFail.reason, /Insufficient stock/);

  const overview = await fifoService.getStockOverview();
  assert.equal(overview[0].current_quantity, 0.2);
  assert.equal(overview[0].total_inventory_cost, 2);

  const rejected = await fifoService.getRejectedEvents();
  assert.equal(rejected.length, 1);

  await pool.end();
});

test('FIFO logic: enforces idempotency when event_id is duplicated', async () => {
  const { pool, fifoService } = await setupTestDb();

  const evt = {
    event_id: 'evt-unique-001',
    product_id: 'PRD003',
    event_type: 'purchase',
    quantity: 25,
    unit_price: 40,
    timestamp: '2025-07-12T10:00:00Z',
  };

  const first = await fifoService.processEvent(evt);
  const second = await fifoService.processEvent(evt);

  assert.equal(first.status, 'processed');
  assert.equal(second.status, 'duplicate');

  const overview = await fifoService.getStockOverview();
  assert.equal(overview[0].current_quantity, 25);

  await pool.end();
});

test('Kafka consumer handler parses message payloads and updates DB', async () => {
  const { pool, fifoService } = await setupTestDb();

  const fakeKafka = {
    consumer: () => ({
      connect: async () => {},
      subscribe: async () => {},
      run: async () => {},
      disconnect: async () => {},
    }),
  };

  const consumer = createKafkaConsumer({ kafka: fakeKafka, fifoService });
  const result = await consumer.handleMessage({
    message: {
      value: Buffer.from(
        JSON.stringify({
          product_id: 'PRD009',
          event_type: 'purchase',
          quantity: 12,
          unit_price: 15.5,
          timestamp: '2025-07-12T12:00:00Z',
        })
      ),
    },
  });

  assert.equal(result.status, 'processed');
  const overview = await fifoService.getStockOverview();
  assert.equal(overview[0].product_id, 'PRD009');
  assert.equal(overview[0].total_inventory_cost, 186);

  await pool.end();
});

test('Express API enforces Basic Auth and serves overview, ledger, and simulator', async () => {
  const { pool, fifoService, eventBus } = await setupTestDb();
  const published = [];

  const mockProducer = {
    publishEvents: async (events) => {
      published.push(...events);
      for (const evt of events) {
        await fifoService.processEvent(evt);
      }
      return events.length;
    },
    isConnected: () => true,
  };

  const app = createApp({
    pool,
    fifoService,
    eventBus,
    producer: mockProducer,
    getKafkaStatus: () => ({ consumerRunning: true, producerConnected: true }),
    authConfig: { username: 'admin', password: 'secret' },
    corsOrigin: '*',
  });

  const authHeader = `Basic ${Buffer.from('admin:secret').toString('base64')}`;

  // Health endpoint is public
  const healthRes = await request(app).get('/health');
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.body.status, 'ok');

  // Protected endpoint rejects missing credentials
  const unauthRes = await request(app).get('/api/inventory/overview');
  assert.equal(unauthRes.status, 401);

  // Simulator publishes events via Kafka producer
  const simRes = await request(app)
    .post('/api/events/simulate')
    .set('Authorization', authHeader)
    .send({ count: 6 });

  assert.equal(simRes.status, 202);
  assert.equal(simRes.body.published_count, 6);
  assert.equal(published.length, 6);

  const overviewRes = await request(app)
    .get('/api/inventory/overview')
    .set('Authorization', authHeader);
  assert.equal(overviewRes.status, 200);
  assert.ok(overviewRes.body.products.length > 0);

  const ledgerRes = await request(app)
    .get('/api/inventory/ledger')
    .set('Authorization', authHeader);
  assert.equal(ledgerRes.status, 200);
  assert.equal(ledgerRes.body.entries.length, 6);

  await pool.end();
});
