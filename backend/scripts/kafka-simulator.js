import { config } from '../src/config/env.js';
import { createKafkaClient } from '../src/kafka/client.js';
import { ensureTopicExists } from '../src/kafka/topic.js';
import { createKafkaProducer } from '../src/kafka/producer.js';
import { generateSimulatedBatch } from '../src/kafka/simulatorEvents.js';

function parseArgs() {
  const args = process.argv.slice(2);
  let count = 8;
  let delayMs = 600;

  for (let i = 0; i < args.length; i += 1) {
    if ((args[i] === '--count' || args[i] === '-n') && args[i + 1]) {
      count = Number(args[i + 1]);
    }
    if ((args[i] === '--delay' || args[i] === '-d') && args[i + 1]) {
      delayMs = Number(args[i + 1]);
    }
  }

  return {
    count: Math.min(Math.max(Number(count) || 8, 1), 50),
    delayMs: Math.max(Number(delayMs) || 600, 0),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const { count, delayMs } = parseArgs();
  const kafka = createKafkaClient(config.kafka);
  const producer = createKafkaProducer(kafka, config.kafka.topic);

  console.log(`Connecting to Kafka brokers: ${config.kafka.brokers.join(', ')}`);
  await ensureTopicExists(kafka, config.kafka.topic);
  await producer.connect();

  const events = generateSimulatedBatch(Math.min(Math.max(count, 5), 10));
  console.log(`Streaming ${events.length} inventory events to topic "${config.kafka.topic}"...\n`);

  for (const event of events) {
    await producer.publishEvents([event]);
    const priceLabel = event.unit_price !== undefined ? ` @ $${event.unit_price}` : ' (FIFO cost)';
    console.log(
      `[PRODUCED] ${event.timestamp} | ${event.event_type.toUpperCase().padEnd(8)} | ${event.product_id} | qty=${event.quantity}${priceLabel}`
    );
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  await producer.disconnect();
  console.log('\nSimulation complete.');
}

run().catch((err) => {
  console.error('Kafka simulator failed:', err);
  process.exit(1);
});
