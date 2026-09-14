import { and, count, eq, gt, gte, isNotNull, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { apiRequest, node, nodeHeartbeat, usageRecord } from '@/lib/db/schema'
import { buildPublicPlatformSummary, unavailablePublicPlatformSummary } from './public-summary-core'

const ONLINE_WINDOW_MS = 90_000
const AVAILABILITY_WINDOW_MS = 24 * 60 * 60_000

export async function getPublicPlatformSummary() {
  const measuredAt = new Date()
  const todayUtc = new Date(Date.UTC(measuredAt.getUTCFullYear(), measuredAt.getUTCMonth(), measuredAt.getUTCDate()))
  const availabilitySince = new Date(measuredAt.getTime() - AVAILABILITY_WINDOW_MS)
  const onlineSince = new Date(measuredAt.getTime() - ONLINE_WINDOW_MS)

  try {
    const [tokenRows, requestRows, nodeRows, settledRows] = await Promise.all([
      db
        .select({ total: sql<number>`coalesce(sum(${usageRecord.inputTokens} + ${usageRecord.outputTokens}), 0)`.mapWith(Number) })
        .from(usageRecord)
        .where(gte(usageRecord.createdAt, todayUtc)),
      db
        .select({
          total: count(),
          completed: sql<number>`count(*) filter (where ${apiRequest.status} = 'completed')`.mapWith(Number),
        })
        .from(apiRequest)
        .where(gte(apiRequest.createdAt, availabilitySince)),
      db
        .select({ total: count() })
        .from(node)
        .innerJoin(nodeHeartbeat, eq(nodeHeartbeat.nodeId, node.id))
        .where(and(eq(node.visibility, 'public'), ne(node.status, 'revoked'), gt(nodeHeartbeat.lastSeenAt, onlineSince))),
      db
        .select({ total: count() })
        .from(apiRequest)
        .where(and(eq(apiRequest.status, 'completed'), isNotNull(apiRequest.completedAt))),
    ])

    return buildPublicPlatformSummary({
      todayTokens: tokenRows[0]?.total ?? 0,
      completedRequests: requestRows[0]?.completed ?? 0,
      totalRequests: requestRows[0]?.total ?? 0,
      activePublicNodes: nodeRows[0]?.total ?? 0,
      settledCalls: settledRows[0]?.total ?? 0,
      measuredAt,
    })
  } catch {
    return unavailablePublicPlatformSummary(measuredAt)
  }
}
