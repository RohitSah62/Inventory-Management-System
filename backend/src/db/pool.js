import pg from 'pg';
import { config } from '../config/env.js';

const { Pool } = pg;

export function createPool(dbConfig = config.database) {
  return new Pool({
    connectionString: dbConfig.connectionString,
    ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

export const pool = createPool();
