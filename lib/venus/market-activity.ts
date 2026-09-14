import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { apiRequest, marketDemoEvent, usageRecord } from '@/lib/db/schema'
import { requirePlatformAdmin, writePlatformAudit } from './platform-authorization'
import {
  clampLimit,
  composeMarketFeed,
  isDemoTransitionAllowed,
  MARKET_DISCLOSURE,
  parseDemoEventInput,
  redactDemoSummary,
  toDemoFeedItem,
  toRealFeedItem,
  type DemoMutationResult,
  type DemoStatus,
  type MarketActivityFeed,
  type MarketActivityItem,
} from './market-activity-core'

export * from './market-activity-core'

// Real-first transparent feed. Reads only completed + settled public API traffic
// and exposes model, token usage, VTEST settled amount, latency and completion
// time. Published demo rows backfill only the slots real data does not fill.
export async function listPublicMarketActivity(limit?: number): Promise<MarketActivityFeed> {
  const cap = clampLimit(limit ?? Number.NaN)
  const realRows = await db
    .select({
      id: apiRequest.id,
      model: apiRequest.model,
      settledAmount: apiRequest.settledAmount,
      latencyMs: apiRequest.latencyMs,
      completedAt: apiRequest.completedAt,
      inputTokens: usageRecord.inputTokens,
      outputTokens: usageRecord.outputTokens,
    })
    .from(apiRequest)
    .innerJoin(usageRecord, eq(usageRecord.apiRequestId, apiRequest.id))
    .where(and(eq(apiRequest.status, 'completed'), isNotNull(apiRequest.completedAt)))
    .orderBy(desc(apiRequest.completedAt))
    .limit(cap)

  const real = realRows
    .filter((row): row is typeof row & { completedAt: Date } => row.completedAt !== null)
    .map(toRealFeedItem)

  const remaining = cap - real.length
  let demo: MarketActivityItem[] = []
  if (remaining > 0) {
    const demoRows = await db
      .select()
      .from(marketDemoEvent)
      .where(eq(marketDemoEvent.status, 'published'))
      .orderBy(desc(marketDemoEvent.occurredAt), desc(marketDemoEvent.id))
      .limit(remaining)
    demo = demoRows.map(toDemoFeedItem)
  }

  const composed = composeMarketFeed(real, demo, cap)
  return { ...composed, limit: cap, disclosure: MARKET_DISCLOSURE }
}

// Admin-only listing that includes every status. Access is gated by the caller
// (route) which must pass a confirmed platform_admin userId.
export async function listDemoEventsForAdmin(_userId: string) {
  const rows = await db.select().from(marketDemoEvent).orderBy(desc(marketDemoEvent.occurredAt), desc(marketDemoEvent.id)).limit(100)
  return rows.map(row => ({
    id: row.id,
    status: row.status as DemoStatus,
    eventType: row.eventType,
    titleZh: row.titleZh,
    titleEn: row.titleEn,
    summaryZh: row.summaryZh,
    summaryEn: row.summaryEn,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    settledAmount: row.settledAmount,
    latencyMs: row.latencyMs,
    occurredAt: row.occurredAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

export async function createDemoEvent(userId: string | null | undefined, input: unknown, requestId?: string): Promise<DemoMutationResult> {
  const actorId = await requirePlatformAdmin(userId)
  if (!actorId) return { ok: false, error: 'forbidden' }
  const parsed = parseDemoEventInput(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  const id = randomUUID()
  await db.transaction(async tx => {
    await tx.insert(marketDemoEvent).values({
      id,
      ...parsed.data,
      occurredAt: new Date(parsed.data.occurredAt),
      status: 'draft',
      createdBy: actorId,
      updatedBy: actorId,
    })
    await writePlatformAudit(tx, { actorId, action: 'market_demo.created', targetType: 'market_demo_event', targetId: id, requestId, summary: redactDemoSummary(parsed.data) })
  })
  return { ok: true, id, status: 'draft' }
}

export async function updateDemoEvent(userId: string | null | undefined, id: string, input: unknown, requestId?: string): Promise<DemoMutationResult> {
  const actorId = await requirePlatformAdmin(userId)
  if (!actorId) return { ok: false, error: 'forbidden' }
  const parsed = parseDemoEventInput(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  return db.transaction(async tx => {
    const [existing] = await tx.select().from(marketDemoEvent).where(eq(marketDemoEvent.id, id)).for('update').limit(1)
    if (!existing) return { ok: false as const, error: 'not_found' as const }
    // Editing a live entry silently would change public content; require it to be
    // withdrawn first. Only draft or withdrawn rows are editable.
    if (existing.status === 'published') return { ok: false as const, error: 'invalid_transition' as const }
    await tx
      .update(marketDemoEvent)
      .set({ ...parsed.data, occurredAt: new Date(parsed.data.occurredAt), updatedBy: actorId, updatedAt: new Date() })
      .where(eq(marketDemoEvent.id, id))
    await writePlatformAudit(tx, { actorId, action: 'market_demo.updated', targetType: 'market_demo_event', targetId: id, requestId, summary: redactDemoSummary(parsed.data) })
    return { ok: true as const, id, status: existing.status as DemoStatus }
  })
}

async function transition(
  userId: string | null | undefined,
  id: string,
  next: Extract<DemoStatus, 'published' | 'withdrawn'>,
  action: string,
  requestId?: string,
): Promise<DemoMutationResult> {
  const actorId = await requirePlatformAdmin(userId)
  if (!actorId) return { ok: false, error: 'forbidden' }
  return db.transaction(async tx => {
    const [existing] = await tx.select().from(marketDemoEvent).where(eq(marketDemoEvent.id, id)).for('update').limit(1)
    if (!existing) return { ok: false as const, error: 'not_found' as const }
    if (!isDemoTransitionAllowed(existing.status as DemoStatus, next)) return { ok: false as const, error: 'invalid_transition' as const }
    const now = new Date()
    await tx
      .update(marketDemoEvent)
      .set({
        status: next,
        updatedBy: actorId,
        updatedAt: now,
        ...(next === 'published' ? { publishedAt: now } : { withdrawnAt: now }),
      })
      .where(eq(marketDemoEvent.id, id))
    await writePlatformAudit(tx, { actorId, action, targetType: 'market_demo_event', targetId: id, requestId, summary: { from: existing.status, to: next } })
    return { ok: true as const, id, status: next }
  })
}

export async function publishDemoEvent(userId: string | null | undefined, id: string, requestId?: string) {
  return transition(userId, id, 'published', 'market_demo.published', requestId)
}

export async function withdrawDemoEvent(userId: string | null | undefined, id: string, requestId?: string) {
  return transition(userId, id, 'withdrawn', 'market_demo.withdrawn', requestId)
}
