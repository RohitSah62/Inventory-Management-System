import { config } from '../config/env.js';

export async function ensureTopicExists(kafka, topic = config.kafka.topic) {
  const admin = kafka.admin();
  await admin.connect();
  try {
    const existing = await admin.listTopics();
    if (!existing.includes(topic)) {
      await admin.createTopics({
        waitForLeaders: true,
        topics: [
          {
            topic,
            numPartitions: 1,
            replicationFactor: 1,
          },
        ],
      });
    }
  } finally {
    await admin.disconnect();
  }
}
