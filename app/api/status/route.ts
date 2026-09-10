import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { getDatabase } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let health: { database: 'connected' | 'unavailable' | 'pending'; checkedAt: string; expires: number } | null = null

export async function GET() {
  if (!health || health.expires < Date.now()) {
    let database: 'connected' | 'unavailable' | 'pending' = 'pending'
    if (process.env.DATABASE_URL) {
      try { await getDatabase().db.execute(sql`SELECT 1 AS connected`); database = 'connected' }
      catch { database = 'unavailable' }
    }
    health = { database, checkedAt: new Date().toISOString(), expires: Date.now() + 30000 }
  }
  const authenticationConfigured = (process.env.BETTER_AUTH_SECRET?.length ?? 0) >= 32 && health.database === 'connected'
  return NextResponse.json({ database: health.database, authentication: authenticationConfigured ? 'ready' : 'pending', authenticationConfigured, checkedAt: health.checkedAt }, { headers: { 'Cache-Control': 'no-store' } })
}
