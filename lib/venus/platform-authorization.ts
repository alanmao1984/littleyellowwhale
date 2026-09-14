import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { platformAuditEvent, platformRole } from '@/lib/db/schema'

// The only platform-level role. It is intentionally NOT derived from any Better
// Auth user field or organization membership — the sole source of truth is an
// active row in platform_roles, re-checked from the database on every call.
export type PlatformRole = 'platform_admin'

// Anything that can run an insert: the shared `db` or a Drizzle transaction.
// Used so audit rows are written in the same transaction as the change.
export type AuditExecutor = Pick<typeof db, 'insert'>

export type PlatformAuditInput = {
  actorId: string
  action: string
  targetType: string
  targetId?: string | null
  requestId?: string | null
  summary?: Record<string, unknown>
}

export async function getPlatformRole(userId: string): Promise<PlatformRole | null> {
  const [row] = await db
    .select({ role: platformRole.role })
    .from(platformRole)
    .where(and(eq(platformRole.userId, userId), eq(platformRole.status, 'active')))
    .limit(1)
  return row?.role === 'platform_admin' ? 'platform_admin' : null
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  return (await getPlatformRole(userId)) === 'platform_admin'
}

// Returns the userId only when it maps to an active platform_admin, otherwise
// null. Write paths call this and return 403 on null; hiding UI is never enough.
export async function requirePlatformAdmin(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null
  return (await getPlatformRole(userId)) === 'platform_admin' ? userId : null
}

export async function writePlatformAudit(executor: AuditExecutor, event: PlatformAuditInput): Promise<void> {
  await executor.insert(platformAuditEvent).values({
    id: randomUUID(),
    actorId: event.actorId,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId ?? null,
    requestId: event.requestId ?? null,
    summary: event.summary ?? {},
  })
}
