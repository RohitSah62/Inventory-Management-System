import { config } from '../config/env.js';

export function createKafkaConsumer({ kafka, fifoService, topic = config.kafka.topic, groupId = config.kafka.groupId }) {
  const consumer = kafka.consumer({ groupId });
  let running = false;

  async function handleMessage({ message }) {
    if (!message || !message.value) return;
    const rawText = message.value.toString('utf8');

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      console.error('Invalid JSON received on Kafka topic:', rawText, err.message);
      return;
    }

    const result = await fifoService.processEvent(parsed);
    if (result.status === 'rejected') {
      console.warn('Kafka inventory event rejected:', result.reason);
    }
    return result;
  }

  async function start() {
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: true });
    running = true;

    await consumer.run({
      eachMessage: async ({ topic: msgTopic, partition, message }) => {
        try {
          await handleMessage({ topic: msgTopic, partition, message });
        } catch (err) {
          console.error('Error processing Kafka message:', err);
        }
      },
    });
  }

  async function stop() {
    if (running) {
      await consumer.disconnect();
      running = false;
    }
  }

  return {
    start,
    stop,
    handleMessage,
    isRunning: () => running,
  };
}
