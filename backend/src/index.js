import { config } from './config/env.js';
import { pool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { eventBus } from './services/eventBus.js';
import { createFifoService } from './services/fifoService.js';
import { createKafkaClient } from './kafka/client.js';
import { ensureTopicExists } from './kafka/topic.js';
import { createKafkaProducer } from './kafka/producer.js';
import { createKafkaConsumer } from './kafka/consumer.js';
import { createApp } from './app.js';

async function bootstrap() {
  console.log('Applying database migrations...');
  await runMigrations(pool);
  console.log('Database ready.');

  const fifoService = createFifoService(pool, eventBus);
  const kafka = createKafkaClient(config.kafka);
  const producer = createKafkaProducer(kafka, config.kafka.topic);
  const consumer = createKafkaConsumer({
    kafka,
    fifoService,
    topic: config.kafka.topic,
    groupId: config.kafka.groupId,
  });

  const app = createApp({
    pool,
    fifoService,
    eventBus,
    producer,
    getKafkaStatus: () => ({
      topic: config.kafka.topic,
      consumerRunning: consumer.isRunning(),
      producerConnected: producer.isConnected(),
    }),
  });

  const server = app.listen(config.port, () => {
    console.log(`Inventory FIFO API listening on port ${config.port}`);
  });

  // Start Kafka producer and consumer with retry resilience.
  // In production, skip ensureTopicExists: the topic must already exist on the
  // managed broker (Redpanda Cloud / Confluent Cloud). The admin listTopics /
  // createTopics calls require Cluster-level ACLs that a regular app user does
  // not hold on managed Kafka services.
  try {
    if (config.nodeEnv !== 'production') {
      await ensureTopicExists(kafka, config.kafka.topic);
    } else {
      console.log(
        `Production mode: skipping auto-topic creation for "${config.kafka.topic}". ` +
        'Ensure the topic exists on your managed Kafka cluster.'
      );
    }
    await producer.connect();
    await consumer.start();
    console.log(`Kafka consumer listening on topic "${config.kafka.topic}"`);
  } catch (err) {
    console.error('Kafka initialization error:', err.message);
  }

  const shutdown = async (signal) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    server.close();
    await Promise.allSettled([consumer.stop(), producer.disconnect(), pool.end()]);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
