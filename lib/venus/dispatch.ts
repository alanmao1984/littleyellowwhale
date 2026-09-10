import { randomUUID } from 'node:crypto'
import { and, eq, isNull, lte, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { taskItem, taskSettlement } from '@/lib/db/schema'

export const DISPATCH_LEASE_MS = 60_000
export async function claimLeaseDispatch(userId: string, attemptId: string) {
  const claimId = randomUUID()
  const [row] = await db.update(taskItem).set({ watcherClaimId: claimId, watcherClaimUntil: new Date(Date.now() + DISPATCH_LEASE_MS) })
    .where(and(eq(taskItem.userId, userId), eq(taskItem.attemptId, attemptId), eq(taskItem.status, 'running'), isNull(taskItem.watcherRunId), or(isNull(taskItem.watcherClaimUntil), lte(taskItem.watcherClaimUntil, new Date())))).returning({ id: taskItem.id })
  return row ? claimId : null
}
export async function finishLeaseDispatch(userId: string, attemptId: string, claimId: string, runId: string | null) {
  await db.update(taskItem).set({ watcherRunId: runId, watcherClaimId: null, watcherClaimUntil: null })
    .where(and(eq(taskItem.userId, userId), eq(taskItem.attemptId, attemptId), eq(taskItem.watcherClaimId, claimId), isNull(taskItem.watcherRunId)))
}
export async function claimReleaseDispatch(userId: string, settlementId: string) {
  const claimId = randomUUID()
  const [row] = await db.update(taskSettlement).set({ releaseClaimId: claimId, releaseClaimUntil: new Date(Date.now() + DISPATCH_LEASE_MS) })
    .where(and(eq(taskSettlement.userId, userId), eq(taskSettlement.id, settlementId), eq(taskSettlement.status, 'escrowed'), isNull(taskSettlement.releaseRunId), or(isNull(taskSettlement.releaseClaimUntil), lte(taskSettlement.releaseClaimUntil, new Date())))).returning({ id: taskSettlement.id })
  return row ? claimId : null
}
export async function finishReleaseDispatch(userId: string, settlementId: string, claimId: string, runId: string | null) {
  await db.update(taskSettlement).set({ releaseRunId: runId, releaseClaimId: null, releaseClaimUntil: null })
    .where(and(eq(taskSettlement.userId, userId), eq(taskSettlement.id, settlementId), eq(taskSettlement.releaseClaimId, claimId), isNull(taskSettlement.releaseRunId)))
}
