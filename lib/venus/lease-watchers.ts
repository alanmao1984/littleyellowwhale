import { start } from 'workflow/api'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { taskItem } from '@/lib/db/schema'
import { pendingWatchers, reconcileUserLeases } from './execution'
import { watchLease } from '@/workflows/lease-watch'

export async function recoverLeaseWatchers(userId: string) {
  await reconcileUserLeases(userId)
  const pending = await pendingWatchers(userId)
  for (const item of pending) {
    if (!item.attemptId) continue
    try {
      const run = await start(watchLease, [userId, item.attemptId])
      await db.update(taskItem).set({ watcherRunId: run.runId }).where(and(eq(taskItem.userId, userId), eq(taskItem.attemptId, item.attemptId), isNull(taskItem.watcherRunId)))
    } catch {
      // Keep the unstarted outbox row for the next heartbeat/list request.
      // Lease expiration is always checked in the database before accepting work.
      console.warn('Venus lease watcher start deferred')
    }
  }
}
