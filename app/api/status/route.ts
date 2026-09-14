import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DatabaseHealth = 'connected' | 'unavailable' | 'pending'
type DeploymentRole = 'primary' | 'disaster-recovery' | 'unknown'

let health: { database: DatabaseHealth; checkedAt: string; expires: number } | null = null

function getDeploymentRole(): DeploymentRole {
  if (process.env.DEPLOYMENT_ROLE === 'primary' || process.env.DEPLOYMENT_ROLE === 'disaster-recovery') {
    return process.env.DEPLOYMENT_ROLE
  }
  return process.env.VERCEL ? 'disaster-recovery' : 'unknown'
}

function getRevision() {
  return process.env.BUILD_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown'
}

export async function GET() {
  if (!health || health.expires < Date.now()) {
    let database: DatabaseHealth = 'pending'
    if (process.env.DATABASE_URL) {
      try {
        const { getDatabase } = await import('@/lib/db')
        await getDatabase().db.execute(sql`SELECT 1 AS connected`)
        database = 'connected'
      } catch {
        database = 'unavailable'
      }
    }
    health = { database, checkedAt: new Date().toISOString(), expires: Date.now() + 10000 }
  }

  const authenticationConfigured = (process.env.BETTER_AUTH_SECRET?.length ?? 0) >= 32
  const ready = health.database === 'connected' && authenticationConfigured
  const role = getDeploymentRole()
  const revision = getRevision()

  return NextResponse.json(
    {
      status: ready ? 'ready' : 'unavailable',
      role,
      revision,
      database: health.database,
      authentication: authenticationConfigured ? 'ready' : 'unavailable',
      checkedAt: health.checkedAt,
    },
    {
      status: ready ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
        'X-Deployment-Role': role,
        'X-Build-Revision': revision,
      },
    },
  )
}
