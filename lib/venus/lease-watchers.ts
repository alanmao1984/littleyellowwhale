import { start } from 'workflow/api'
import { pendingWatchers, reconcileUserLeases } from './execution'
import { watchLease } from '@/workflows/lease-watch'
import { claimLeaseDispatch, finishLeaseDispatch } from './dispatch'
import { recoverSettlementWatchers } from './settlement-watchers'

export async function recoverLeaseWatchers(userId: string) {
  await reconcileUserLeases(userId)
  const pending = await pendingWatchers(userId)
  for (const item of pending) {
    if (!item.attemptId) continue
    const claimId = await claimLeaseDispatch(userId, item.attemptId)
    if (!claimId) continue
    try {
      const run = await start(watchLease, [userId, item.attemptId])
      await finishLeaseDispatch(userId, item.attemptId, claimId, run.runId)
    } catch {
      // Keep the unstarted outbox row for the next heartbeat/list request.
      // Lease expiration is always checked in the database before accepting work.
      await finishLeaseDispatch(userId, item.attemptId, claimId, null).catch(() => undefined)
      console.warn('Venus lease watcher start deferred')
    }
  }
  await recoverSettlementWatchers(userId)
}
