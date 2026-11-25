import { config } from '../config/env.js';

export function createKafkaProducer(kafka, topic = config.kafka.topic) {
  const producer = kafka.producer({ allowAutoTopicCreation: true });
  let connected = false;

  async function connect() {
    if (!connected) {
      await producer.connect();
      connected = true;
    }
  }

  async function publishEvents(events) {
    await connect();
    const list = Array.isArray(events) ? events : [events];
    const messages = list.map((evt) => ({
      key: String(evt.product_id || 'unknown'),
      value: JSON.stringify(evt),
    }));

    await producer.send({
      topic,
      messages,
    });

    return list.length;
  }

  async function disconnect() {
    if (connected) {
      await producer.disconnect();
      connected = false;
    }
  }

  return {
    connect,
    publishEvents,
    disconnect,
    isConnected: () => connected,
  };
}
