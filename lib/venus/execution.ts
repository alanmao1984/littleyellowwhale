import { createHash, randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, lte, isNull, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { node, nodeHeartbeat, task, taskItem, taskSettlement, wallet, ledgerEntry } from '@/lib/db/schema'
import { addStr, gte, multiplyStr, subStr } from './money'
import { canExecute, supportsWork, readPolicy, LEASE_MS, MAX_ATTEMPT_MS, type NodePrincipal, type ResultInput, type Assignment } from '@/packages/node-protocol'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Item = typeof taskItem.$inferSelect
type Task = typeof task.$inferSelect
const scopedTask = (userId: string, taskId: string) => and(eq(task.userId, userId), eq(task.id, taskId))
const scopedItems = (userId: string, taskId: string) => and(eq(taskItem.userId, userId), eq(taskItem.taskId, taskId))
const scopedNode = (p: NodePrincipal) => and(eq(node.userId, p.userId), eq(node.id, p.nodeId))

async function updateSummary(tx: Tx, userId: string, taskId: string) {
  const items = await tx.select({ status: taskItem.status }).from(taskItem).where(scopedItems(userId, taskId))
  const [tk] = await tx.select({ cancelRequested: task.cancelRequested, nodeId: task.nodeId }).from(task).where(scopedTask(userId, taskId))
  const running = items.some(i => i.status === 'running')
  const pending = items.some(i => i.status === 'pending')
  const review = items.some(i => i.status === 'review')
  const status = running ? (tk.cancelRequested ? 'cancelling' : 'running') : pending && !tk.cancelRequested ? (tk.nodeId ? 'queued' : 'pending_nodes') : review ? 'review' : 'cancelled'
  await tx.update(task).set({ status }).where(scopedTask(userId, taskId))
}

async function expireItems(tx: Tx, userId: string, taskId: string) {
  const expired = await tx.update(taskItem).set({ status: 'review', errorCode: 'lease_expired', finishedAt: new Date() })
    .where(and(scopedItems(userId, taskId), eq(taskItem.status, 'running'), lte(taskItem.leaseExpiresAt, new Date())))
    .returning({ id: taskItem.id })
  if (expired.length) await updateSummary(tx, userId, taskId)
}

function assignment(tk: Task, item: Item): Assignment {
  return { attemptId: item.attemptId!, fence: item.fence, taskId: tk.id, taskType: (tk.taskType || 'text') as Assignment['taskType'], operation: (tk.operation || 'infer') as Assignment['operation'], mediaSpec: (tk.mediaSpec ?? { taskType: 'text', operation: 'infer' }) as Assignment['mediaSpec'], billingUnits: item.billingUnits, model: tk.model!, instruction: tk.instruction,
    input: item.text, maxOutputTokens: tk.maxOutputTokens, leaseExpiresAt: item.leaseExpiresAt!.toISOString() }
}

export async function claimWork(p: NodePrincipal, requestId: string) {
  return db.transaction(async tx => {
    // The node lock serializes slot allocation, including claims for different tasks.
    const [n] = await tx.select().from(node).where(scopedNode(p)).for('update').limit(1)
    if (!n || n.status !== 'enrolled') return { assignment: null, reason: 'node_not_accepting' }
    const policy = readPolicy(n.resourcePolicy)
    const [hb] = await tx.select().from(nodeHeartbeat).where(and(eq(nodeHeartbeat.userId, p.userId), eq(nodeHeartbeat.nodeId, p.nodeId))).limit(1)
    if (!hb || Date.now() - hb.lastSeenAt.getTime() >= LEASE_MS) return { assignment: null, reason: 'heartbeat_required' }
    const claimKey = `${p.nodeId}:${requestId}`
    const [previous] = await tx.select().from(taskItem).where(and(eq(taskItem.userId, p.userId), eq(taskItem.nodeId, p.nodeId), eq(taskItem.claimKey, claimKey))).limit(1)
    if (previous) {
      const [tk] = await tx.select().from(task).where(scopedTask(p.userId, previous.taskId)).for('update').limit(1)
      if (!tk || tk.cancelRequested || previous.status !== 'running' || !previous.leaseExpiresAt || previous.leaseExpiresAt.getTime() <= Date.now() || !canExecute(policy, tk.model!) || !supportsWork(policy.allowedCapabilities, tk.taskType, tk.operation) || !supportsWork(hb.capabilities, tk.taskType, tk.operation)) return { assignment: null, reason: 'claim_no_longer_valid' }
      return { assignment: assignment(tk, previous), reason: null }
    }
    const active = await tx.select({ id: taskItem.id }).from(taskItem).where(and(eq(taskItem.userId, p.userId), eq(taskItem.nodeId, p.nodeId), eq(taskItem.status, 'running')))
    if (active.length >= policy.maxConcurrency) return { assignment: null, reason: 'concurrency_limit' }
    const candidates = await tx.select().from(task).where(and(eq(task.userId, p.userId), eq(task.nodeId, p.nodeId), eq(task.cancelRequested, false), inArray(task.status, ['queued', 'running']))).orderBy(asc(task.createdAt)).limit(100)
    for (const candidate of candidates) {
      if (!candidate.consentedAt || !candidate.model || !canExecute(policy, candidate.model) || !hb.models?.includes(candidate.model) || !supportsWork(policy.allowedCapabilities, candidate.taskType, candidate.operation) || !supportsWork(hb.capabilities, candidate.taskType, candidate.operation)) continue
      const [tk] = await tx.select().from(task).where(scopedTask(p.userId, candidate.id)).for('update').limit(1)
      if (tk.cancelRequested || !['queued', 'running'].includes(tk.status)) continue
      const busy = await tx.select({ id: taskItem.id }).from(taskItem).where(and(scopedItems(p.userId, tk.id), eq(taskItem.status, 'running')))
      if (busy.length >= tk.concurrency) continue
      const [item] = await tx.select().from(taskItem).where(and(scopedItems(p.userId, tk.id), eq(taskItem.status, 'pending'))).orderBy(asc(taskItem.idx)).for('update').limit(1)
      if (!item) continue
      const [claimed] = await tx.update(taskItem).set({ status: 'running', nodeId: p.nodeId, attemptId: randomUUID(), claimKey, fence: item.fence + 1, startedAt: new Date(), leaseExpiresAt: new Date(Date.now() + LEASE_MS) })
        .where(and(scopedItems(p.userId, tk.id), eq(taskItem.id, item.id), eq(taskItem.status, 'pending'))).returning()
      await tx.update(task).set({ status: 'running' }).where(scopedTask(p.userId, tk.id))
      return { assignment: assignment(tk, claimed), reason: null }
    }
    return { assignment: null, reason: 'no_matching_task' }
  })
}

async function lockAttempt(tx: Tx, p: NodePrincipal, attemptId: string) {
  const [n] = await tx.select().from(node).where(scopedNode(p)).for('update').limit(1)
  if (!n || n.status === 'revoked') return null
  const scope = and(eq(taskItem.userId, p.userId), eq(taskItem.nodeId, p.nodeId), eq(taskItem.attemptId, attemptId))
  const [found] = await tx.select().from(taskItem).where(scope).limit(1)
  if (!found) return null
  const [tk] = await tx.select().from(task).where(scopedTask(p.userId, found.taskId)).for('update').limit(1)
  const [item] = await tx.select().from(taskItem).where(scope).for('update').limit(1)
  return tk && item ? { n, tk, item, scope } : null
}

export async function renewLease(p: NodePrincipal, attemptId: string, fence: number) {
  return db.transaction(async tx => {
    const found = await lockAttempt(tx, p, attemptId)
    if (!found) return { ok: false as const, error: 'not_found' }
    const { n, tk, item, scope } = found
    if (item.fence !== fence || item.status !== 'running' || !item.leaseExpiresAt || item.leaseExpiresAt.getTime() <= Date.now()) {
      await expireItems(tx, p.userId, tk.id)
      return { ok: false as const, error: 'lease_lost' }
    }
    const policy = readPolicy(n.resourcePolicy)
    const cancel = tk.cancelRequested || n.status !== 'enrolled' || !canExecute(policy, tk.model!) || !supportsWork(policy.allowedCapabilities, tk.taskType, tk.operation)
    const cap = item.startedAt!.getTime() + MAX_ATTEMPT_MS
    if (cancel || cap <= Date.now()) return { ok: true as const, cancelRequested: true, leaseExpiresAt: item.leaseExpiresAt.toISOString() }
    const expiresAt = new Date(Math.min(Date.now() + LEASE_MS, cap))
    await tx.update(taskItem).set({ leaseExpiresAt: expiresAt }).where(scope)
    return { ok: true as const, cancelRequested: false, leaseExpiresAt: expiresAt.toISOString() }
  })
}

export async function completeAttempt(p: NodePrincipal, input: ResultInput) {
  const normalized = { outcome: input.outcome, model: input.model, output: input.output ?? null, resultMeta: input.resultMeta ?? null, usage: input.usage ?? null, errorCode: input.errorCode ?? null }
  const hash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
  return db.transaction(async tx => {
    const found = await lockAttempt(tx, p, input.attemptId)
    if (!found) return { ok: false as const, error: 'not_found' }
    const { tk, item, scope } = found
    if (item.fence !== input.fence || tk.model !== input.model) return { ok: false as const, error: 'lease_mismatch' }
    if (item.resultHash) return item.resultHash === hash ? { ok: true as const, duplicate: true, status: 'review' } : { ok: false as const, error: 'result_conflict' }
    if (item.status !== 'running' || !item.leaseExpiresAt || item.leaseExpiresAt.getTime() <= Date.now()) {
      await expireItems(tx, p.userId, tk.id)
      return { ok: false as const, error: 'lease_lost' }
    }
    if (input.usage && input.usage.outputTokens > tk.maxOutputTokens) return { ok: false as const, error: 'usage_limit' }
    // Node-reported output and usage are not proof of quality or honest metering.
    // Persist for review; never mint earnings or automatically retry uncertain work.
    await tx.update(taskItem).set({ status: 'review', result: input.outcome === 'completed' ? input.output : null,
      usage: input.usage ?? null, resultMeta: input.resultMeta ?? null, resultHash: hash, errorCode: input.outcome === 'uncertain' ? (input.errorCode ?? 'inference_error') : null, finishedAt: new Date() }).where(scope)
    await updateSummary(tx, p.userId, tk.id)
    return { ok: true as const, duplicate: false, status: 'review' }
  })
}

export async function cancelExecution(userId: string, taskId: string) {
  return db.transaction(async tx => {
    const [tk] = await tx.select().from(task).where(scopedTask(userId, taskId)).for('update').limit(1)
    if (!tk) return { ok: false as const, error: 'not_found' as const }
    if (tk.settlementStatus === 'settled') return { ok: false as const, error: 'not_cancellable' as const }
    if (tk.cancelRequested || tk.status === 'cancelled') return { ok: true as const, released: '0.0000' }
    const cancelled = await tx.update(taskItem).set({ status: 'cancelled', reviewDecision: 'cancelled', reviewedBy: userId, reviewedAt: new Date(), reviewReason: '用户取消尚未派发的记录' }).where(and(scopedItems(userId, taskId), eq(taskItem.status, 'pending'))).returning({ id: taskItem.id, billingUnits: taskItem.billingUnits })
    const released = cancelled.reduce((total, item) => addStr(total, multiplyStr(tk.unitPrice, item.billingUnits)), '0.0000')
    if (cancelled.length) {
      const [w] = await tx.select().from(wallet).where(eq(wallet.userId, userId)).for('update').limit(1)
      if (!w || !gte(w.spendingReserved, released) || !gte(tk.reservedAmount, released)) throw new Error('cancellation_reconciliation_required')
      const available = addStr(w.spendingAvailable, released)
      const reserved = subStr(w.spendingReserved, released)
      await tx.update(wallet).set({ spendingAvailable: available, spendingReserved: reserved, updatedAt: new Date() }).where(eq(wallet.userId, userId))
      await tx.insert(ledgerEntry).values([
        { id: randomUUID(), userId, taskId, kind: 'release', account: 'spending_reserved', amount: `-${released}`, balanceAfter: reserved, businessKey: `cancel-pending-out:${taskId}`, description: '释放未派发记录预留 / Release undispatched reservation' },
        { id: randomUUID(), userId, taskId, kind: 'release', account: 'spending_available', amount: released, balanceAfter: available, businessKey: `cancel-pending-in:${taskId}`, description: '释放未派发记录预留 / Release undispatched reservation' },
      ])
    }
    await tx.update(task).set({ cancelRequested: true, reservedAmount: subStr(tk.reservedAmount, released) }).where(scopedTask(userId, taskId))
    await expireItems(tx, userId, taskId)
    await updateSummary(tx, userId, taskId)
    return { ok: true as const, released }
  })
}

export async function inspectLease(userId: string, attemptId: string) {
  return db.transaction(async tx => {
    const [item] = await tx.select({ taskId: taskItem.taskId }).from(taskItem).where(and(eq(taskItem.userId, userId), eq(taskItem.attemptId, attemptId))).limit(1)
    if (!item) return null
    await tx.select({ id: task.id }).from(task).where(scopedTask(userId, item.taskId)).for('update')
    await expireItems(tx, userId, item.taskId)
    const [fresh] = await tx.select({ status: taskItem.status, leaseExpiresAt: taskItem.leaseExpiresAt }).from(taskItem).where(and(eq(taskItem.userId, userId), eq(taskItem.attemptId, attemptId)))
    return fresh?.status === 'running' ? fresh.leaseExpiresAt?.toISOString() ?? null : null
  })
}

export async function reconcileUserLeases(userId: string) {
  const expired = await db.select({ attemptId: taskItem.attemptId }).from(taskItem).where(and(eq(taskItem.userId, userId), eq(taskItem.status, 'running'), lte(taskItem.leaseExpiresAt, new Date()))).limit(100)
  for (const item of expired) if (item.attemptId) await inspectLease(userId, item.attemptId)
}

export async function pendingWatchers(userId: string) {
  return db.select({ attemptId: taskItem.attemptId }).from(taskItem).where(and(eq(taskItem.userId, userId), eq(taskItem.status, 'running'), isNull(taskItem.watcherRunId), or(isNull(taskItem.watcherClaimUntil), lte(taskItem.watcherClaimUntil, new Date())))).limit(20)
}

export async function getTaskResults(userId: string, taskId: string) {
  const [tk] = await db.select().from(task).where(scopedTask(userId, taskId)).limit(1)
  if (!tk) return null
  const items = await db.select({ id: taskItem.id, index: taskItem.idx, status: taskItem.status, input: taskItem.text, output: taskItem.result, resultMeta: taskItem.resultMeta, billingUnits: taskItem.billingUnits, usage: taskItem.usage, errorCode: taskItem.errorCode, attemptId: taskItem.attemptId, fence: taskItem.fence, reviewDecision: taskItem.reviewDecision, reviewedBy: taskItem.reviewedBy, reviewedAt: taskItem.reviewedAt, reviewReason: taskItem.reviewReason }).from(taskItem).where(scopedItems(userId, taskId)).orderBy(asc(taskItem.idx))
  const [settlement] = await db.select({ acceptedAmount: taskSettlement.acceptedAmount, refundedAmount: taskSettlement.refundedAmount, providerAmount: taskSettlement.providerAmount, brokerAmount: taskSettlement.brokerAmount, platformAmount: taskSettlement.platformAmount, status: taskSettlement.status, releaseAt: taskSettlement.releaseAt, releasedAt: taskSettlement.releasedAt }).from(taskSettlement).where(and(eq(taskSettlement.userId, userId), eq(taskSettlement.taskId, taskId))).limit(1)
  return { taskId, taskType: tk.taskType, operation: tk.operation, model: tk.model, nodeName: tk.nodeName, status: tk.status, settlement: tk.settlementStatus, reservedAmount: tk.reservedAmount, items, settlementDetail: settlement ? { ...settlement, releaseAt: settlement.releaseAt.toISOString(), releasedAt: settlement.releasedAt?.toISOString() ?? null } : null }
}
