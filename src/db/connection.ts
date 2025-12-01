/**
 * PostgreSQL connection pool configuration
 */
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Handle pool errors - exit on idle client error per node-postgres best practice
// See: https://node-postgres.com/features/pooling
pool.on('error', (err, _client) => {
  console.error('[Database] Unexpected error on idle client', err);
  console.error('[Database] Exiting process due to pool error');
  process.exit(1);
});
