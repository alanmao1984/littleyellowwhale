import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

const globalDatabase = globalThis as unknown as { venusPool?: Pool }

function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('Database configuration pending')
  const existing = globalDatabase.venusPool ?? new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
    statement_timeout: 5000,
    query_timeout: 8000,
    maxUses: 500,
    maxLifetimeSeconds: 300,
  })
  globalDatabase.venusPool = existing
  return existing
}

// Shared pg Pool consumed by both Better Auth (lib/auth.ts) and Drizzle so the
// whole app uses one connection and one source of truth.
export const pool = getPool()
export const db = drizzle(pool, { schema })

export function getDatabase() {
  return { pool: getPool(), db }
}
