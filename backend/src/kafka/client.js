import { Kafka, logLevel } from 'kafkajs';
import { config } from '../config/env.js';

export function createKafkaClient(kafkaConfig = config.kafka) {
  const clientOptions = {
    clientId: kafkaConfig.clientId,
    brokers: kafkaConfig.brokers,
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 300,
      retries: 8,
    },
  };

  if (kafkaConfig.ssl) {
    clientOptions.ssl = true;
  }

  if (kafkaConfig.saslMechanism && kafkaConfig.saslUsername && kafkaConfig.saslPassword) {
    clientOptions.sasl = {
      mechanism: kafkaConfig.saslMechanism,
      username: kafkaConfig.saslUsername,
      password: kafkaConfig.saslPassword,
    };
  }

  return new Kafka(clientOptions);
}
