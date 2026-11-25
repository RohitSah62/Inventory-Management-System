import dotenv from 'dotenv';

dotenv.config();

/**
 * Parses boolean environment flags consistently.
 */
function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Builds and validates runtime configuration from environment variables.
 * In production, required secrets and origins must be explicitly configured.
 */
export function buildConfig(env = process.env) {
  const nodeEnv = (env.NODE_ENV || 'development').trim() || 'development';
  const isProduction = nodeEnv === 'production';

  if (isProduction) {
    const requiredKeys = ['AUTH_USERNAME', 'AUTH_PASSWORD', 'DATABASE_URL', 'KAFKA_BROKERS', 'CORS_ORIGIN'];
    const missing = requiredKeys.filter((key) => !hasValue(env[key]));
    if (missing.length > 0) {
      throw new Error(
        `Missing required production environment variable(s): ${missing.join(', ')}`
      );
    }

    const corsOrigin = env.CORS_ORIGIN.trim();
    if (corsOrigin === '*') {
      throw new Error(
        'Invalid production configuration for CORS_ORIGIN: wildcard "*" is not allowed; set an explicit origin'
      );
    }

    const brokers = env.KAFKA_BROKERS.split(',')
      .map((b) => b.trim())
      .filter(Boolean);
    if (brokers.length === 0) {
      throw new Error('Missing required production environment variable(s): KAFKA_BROKERS');
    }

    return {
      port: Number(env.PORT || 4000),
      nodeEnv,
      corsOrigin,
      auth: {
        username: env.AUTH_USERNAME.trim(),
        password: env.AUTH_PASSWORD,
      },
      database: {
        connectionString: env.DATABASE_URL.trim(),
        ssl: parseBool(env.DATABASE_SSL, false),
      },
      kafka: {
        brokers,
        topic: env.KAFKA_TOPIC || 'inventory-events',
        groupId: env.KAFKA_GROUP_ID || 'inventory-fifo-consumer',
        clientId: env.KAFKA_CLIENT_ID || 'inventory-fifo-service',
        ssl: parseBool(env.KAFKA_SSL, false),
        saslMechanism: env.KAFKA_SASL_MECHANISM || '',
        saslUsername: env.KAFKA_SASL_USERNAME || '',
        saslPassword: env.KAFKA_SASL_PASSWORD || '',
      },
    };
  }

  // Non-production defaults for local development and automated tests only
  return {
    port: Number(env.PORT || 4000),
    nodeEnv,
    corsOrigin: env.CORS_ORIGIN || '*',
    auth: {
      username: env.AUTH_USERNAME || 'admin',
      password: env.AUTH_PASSWORD || 'inventory-fifo-secret',
    },
    database: {
      connectionString:
        env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/inventory_fifo',
      ssl: parseBool(env.DATABASE_SSL, false),
    },
    kafka: {
      brokers: (env.KAFKA_BROKERS || 'localhost:19092')
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean),
      topic: env.KAFKA_TOPIC || 'inventory-events',
      groupId: env.KAFKA_GROUP_ID || 'inventory-fifo-consumer',
      clientId: env.KAFKA_CLIENT_ID || 'inventory-fifo-service',
      ssl: parseBool(env.KAFKA_SSL, false),
      saslMechanism: env.KAFKA_SASL_MECHANISM || '',
      saslUsername: env.KAFKA_SASL_USERNAME || '',
      saslPassword: env.KAFKA_SASL_PASSWORD || '',
    },
  };
}

export const config = buildConfig(process.env);
