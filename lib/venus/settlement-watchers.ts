import { and, eq, isNull, lte, or } from 'drizzle-orm'
import { start } from 'workflow/api'
import { db } from '@/lib/db'
import { taskSettlement } from '@/lib/db/schema'
import { watchSettlementRelease } from '@/workflows/settlement-release'
import { claimReleaseDispatch, finishReleaseDispatch } from './dispatch'
import { releaseDueSettlements } from './settlements'

export async function recoverSettlementWatchers(userId: string) {
  await releaseDueSettlements(userId)
  const pending = await db.select({ id: taskSettlement.id }).from(taskSettlement).where(and(eq(taskSettlement.userId, userId), eq(taskSettlement.status, 'escrowed'), isNull(taskSettlement.releaseRunId), or(isNull(taskSettlement.releaseClaimUntil), lte(taskSettlement.releaseClaimUntil, new Date())))).limit(20)
  for (const row of pending) {
    const claimId = await claimReleaseDispatch(userId, row.id)
    if (!claimId) continue
    try {
      const run = await start(watchSettlementRelease, [userId, row.id])
      await finishReleaseDispatch(userId, row.id, claimId, run.runId)
    } catch {
      // Start and the database cannot share a transaction. Duplicate runs are safe:
      // the release step checks the persisted settlement under a row lock.
      await finishReleaseDispatch(userId, row.id, claimId, null).catch(() => undefined)
      console.warn('Venus settlement dispatch deferred')
    }
  }
}
