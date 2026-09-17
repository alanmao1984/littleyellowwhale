import { createHash, randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, lte, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { node, nodeHeartbeat, task, taskItem, taskSettlement, wallet, ledgerEntry } from '@/lib/db/schema'
import { addStr, gte, multiplyStr, subStr } from './money'
import { auditUsage } from './usage-audit'
import { canExecute, supportsWork, readPolicy, LEASE_MS, MAX_ATTEMPT_MS, type NodePrincipal, type ResultInput, type Assignment } from '@/packages/node-protocol'
import { decideDispatch, type DispatchReason } from './dispatch/reason'

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

export async function claimWork(p: NodePrincipal, requestId: string): Promise<{ assignment: Assignment | null; reason: DispatchReason; retryAfterMs: number }> {
  return db.transaction(async tx => {
    // The node row lock serializes all slot allocation for this runtime.
    const [n] = await tx.select().from(node).where(scopedNode(p)).for('update').limit(1)
    if (!n) return { assignment: null, reason: 'node_not_enrolled', retryAfterMs: 30_000 }
    const policy = readPolicy(n.resourcePolicy)
    const [hb] = await tx.select().from(nodeHeartbeat).where(and(eq(nodeHeartbeat.userId, p.userId), eq(nodeHeartbeat.nodeId, p.nodeId))).limit(1)
    const heartbeatFresh = !!hb && Date.now() - hb.lastSeenAt.getTime() < LEASE_MS
    if (!hb) return { assignment: null, reason: 'heartbeat_required', retryAfterMs: 15_000 }
    const claimKey = `${p.nodeId}:${requestId}`
    const [previous] = await tx.select().from(taskItem).where(and(eq(taskItem.nodeId, p.nodeId), eq(taskItem.claimKey, claimKey))).limit(1)
    if (previous) {
      const [tk] = await tx.select().from(task).where(scopedTask(previous.userId, previous.taskId)).for('update').limit(1)
      if (tk && tk.nodeId === p.nodeId && !tk.cancelRequested && previous.status === 'running' && previous.leaseExpiresAt && previous.leaseExpiresAt.getTime() > Date.now()) {
        return { assignment: assignment(tk, previous), reason: 'accepted', retryAfterMs: 0 }
      }
      return { assignment: null, reason: 'task_not_ready', retryAfterMs: 3_000 }
    }
    const active = await tx.select({ id: taskItem.id }).from(taskItem).where(and(eq(taskItem.nodeId, p.nodeId), eq(taskItem.status, 'running')))
    const nodeLimit = Math.min(n.maxConcurrentTasks, policy.maxConcurrency)
    if (active.length >= nodeLimit) return { assignment: null, reason: 'node_capacity_reached', retryAfterMs: 3_000 }
    const candidates = await tx.select().from(task).where(and(eq(task.nodeId, p.nodeId), eq(task.cancelRequested, false), inArray(task.status, ['queued', 'running']))).orderBy(asc(task.createdAt)).limit(100)
    let lastReason: DispatchReason = 'no_matching_task'
    let retryAfterMs = 15_000
    for (const candidate of candidates) {
      if (!candidate.model) { lastReason = 'model_not_allowed'; continue }
      const [tk] = await tx.select().from(task).where(scopedTask(candidate.userId, candidate.id)).for('update').limit(1)
      const busy = await tx.select({ id: taskItem.id }).from(taskItem).where(and(scopedItems(tk.userId, tk.id), eq(taskItem.status, 'running')))
      const decision = decideDispatch({
        taskStatus: tk.status,
        consented: !!tk.consentedAt,
        nodeStatus: n.status,
        heartbeatFresh,
        policy,
        model: tk.model ?? '',
        reportedModels: hb.models ?? [],
        taskType: tk.taskType,
        operation: tk.operation,
        reportedCapabilities: hb.capabilities,
        nodeActive: active.length,
        nodeLimit,
        taskActive: busy.length,
        taskLimit: tk.concurrency,
      })
      if (!decision.accepted) { lastReason = decision.reason; retryAfterMs = decision.retryAfterMs; continue }
      const [item] = await tx.select().from(taskItem).where(and(scopedItems(tk.userId, tk.id), eq(taskItem.status, 'pending'))).orderBy(asc(taskItem.idx)).for('update').limit(1)
      if (!item) { lastReason = 'task_not_ready'; continue }
      const [claimed] = await tx.update(taskItem).set({ status: 'running', nodeId: p.nodeId, attemptId: randomUUID(), claimKey, fence: item.fence + 1, startedAt: new Date(), leaseExpiresAt: new Date(Date.now() + LEASE_MS) })
        .where(and(scopedItems(tk.userId, tk.id), eq(taskItem.id, item.id), eq(taskItem.status, 'pending'))).returning()
      await tx.update(task).set({ status: 'running' }).where(scopedTask(tk.userId, tk.id))
      return { assignment: assignment(tk, claimed), reason: 'accepted', retryAfterMs: 0 }
    }
    return { assignment: null, reason: lastReason, retryAfterMs }
  })
}

export async function claimWorkBatch(p: NodePrincipal, requestId: string, limit: number) {
  const assignments: Assignment[] = []
  let reason: DispatchReason = 'no_matching_task'
  let retryAfterMs = 15_000
  for (let index = 0; index < Math.min(32, Math.max(1, limit)); index++) {
    const result = await claimWork(p, `${requestId}:${index}`)
    reason = result.reason
    retryAfterMs = result.retryAfterMs
    if (!result.assignment) break
    assignments.push(result.assignment)
  }
  return { assignments, reason: assignments.length ? 'accepted' : reason, retryAfterMs: assignments.length ? 0 : retryAfterMs }
}

export async function getTaskDispatchDecision(userId: string, taskId: string) {
  const [tk] = await db.select().from(task).where(scopedTask(userId, taskId)).limit(1)
  if (!tk) return null
  if (!tk.nodeId || !tk.model) return { accepted: false, reason: 'task_not_ready' as const, retryAfterMs: 30_000, nodeActive: 0, nodeLimit: 0, taskActive: 0, taskLimit: tk.concurrency }
  const [n] = await db.select().from(node).where(and(eq(node.id, tk.nodeId), eq(node.userId, tk.userId))).limit(1)
  const [hb] = await db.select().from(nodeHeartbeat).where(and(eq(nodeHeartbeat.nodeId, tk.nodeId), eq(nodeHeartbeat.userId, tk.userId))).limit(1)
  if (!n) return { accepted: false, reason: 'node_not_enrolled' as const, retryAfterMs: 30_000, nodeActive: 0, nodeLimit: 0, taskActive: 0, taskLimit: tk.concurrency }
  const policy = readPolicy(n.resourcePolicy)
  const [nodeActive, taskActive] = await Promise.all([
    db.select({ id: taskItem.id }).from(taskItem).where(and(eq(taskItem.nodeId, n.id), eq(taskItem.status, 'running'))),
    db.select({ id: taskItem.id }).from(taskItem).where(and(scopedItems(userId, taskId), eq(taskItem.status, 'running'))),
  ])
  const nodeLimit = Math.min(n.maxConcurrentTasks, policy.maxConcurrency)
  const decision = decideDispatch({ taskStatus: tk.status, consented: !!tk.consentedAt, nodeStatus: n.status, heartbeatFresh: !!hb && Date.now() - hb.lastSeenAt.getTime() < LEASE_MS, policy, model: tk.model, reportedModels: hb?.models ?? [], taskType: tk.taskType, operation: tk.operation, reportedCapabilities: hb?.capabilities ?? [], nodeActive: nodeActive.length, nodeLimit, taskActive: taskActive.length, taskLimit: tk.concurrency })
  return { ...decision, nodeActive: nodeActive.length, nodeLimit, taskActive: taskActive.length, taskLimit: tk.concurrency }
}

async function lockAttempt(tx: Tx, p: NodePrincipal, attemptId: string) {
  const [n] = await tx.select().from(node).where(scopedNode(p)).for('update').limit(1)
  if (!n || n.status === 'revoked') return null
  const scope = and(eq(taskItem.nodeId, p.nodeId), eq(taskItem.attemptId, attemptId))
  const [found] = await tx.select().from(taskItem).where(scope).limit(1)
  if (!found) return null
  const [tk] = await tx.select().from(task).where(scopedTask(found.userId, found.taskId)).for('update').limit(1)
  const [item] = await tx.select().from(taskItem).where(scope).for('update').limit(1)
  return tk && item ? { n, tk, item, scope } : null
}

export async function renewLease(p: NodePrincipal, attemptId: string, fence: number) {
  return db.transaction(async tx => {
    const found = await lockAttempt(tx, p, attemptId)
    if (!found) return { ok: false as const, error: 'not_found' }
    const { n, tk, item, scope } = found
    if (item.fence !== fence || item.status !== 'running' || !item.leaseExpiresAt || item.leaseExpiresAt.getTime() <= Date.now()) {
      await expireItems(tx, tk.userId, tk.id)
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
    if (item.resultHash) return item.resultHash === hash ? { ok: true as const, duplicate: true, status: 'review', usageVerified: item.usageVerified } : { ok: false as const, error: 'result_conflict' }
    if (item.status !== 'running' || !item.leaseExpiresAt || item.leaseExpiresAt.getTime() <= Date.now()) {
      await expireItems(tx, tk.userId, tk.id)
      return { ok: false as const, error: 'lease_lost' }
    }
    if (input.usage && input.usage.outputTokens > tk.maxOutputTokens) return { ok: false as const, error: 'usage_limit' }
    const [heartbeat] = await tx.select({ publicKey: nodeHeartbeat.attestationPublicKey }).from(nodeHeartbeat).where(and(eq(nodeHeartbeat.nodeId, p.nodeId), eq(nodeHeartbeat.userId, p.userId))).limit(1)
    const audit = await auditUsage(tx, { input, nodeId: p.nodeId, userId: p.userId, taskId: tk.id, expectedInput: `${tk.instruction}\n${item.text}`, publicKey: heartbeat?.publicKey ?? null })
    // A verified signature proves the enrolled runtime signed this exact input,
    // output and usage envelope. Quality still requires the user's review.
    await tx.update(taskItem).set({ status: 'review', result: input.outcome === 'completed' ? input.output : null,
      usage: input.usage ?? null, usageVerified: audit.verified, usageAuditHash: audit.eventHash, resultMeta: input.resultMeta ?? null, resultHash: hash, errorCode: input.outcome === 'uncertain' ? (input.errorCode ?? 'inference_error') : null, finishedAt: new Date() }).where(scope)
    await tx.update(node).set({ pogwScore: audit.verified ? sql`least(1000, ${node.pogwScore} + 1)` : sql`greatest(0, ${node.pogwScore} - 10)` }).where(scopedNode(p))
    await updateSummary(tx, tk.userId, tk.id)
    return { ok: true as const, duplicate: false, status: 'review', usageVerified: audit.verified }
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
  const items = await db.select({ id: taskItem.id, index: taskItem.idx, status: taskItem.status, input: taskItem.text, output: taskItem.result, resultMeta: taskItem.resultMeta, billingUnits: taskItem.billingUnits, usage: taskItem.usage, usageVerified: taskItem.usageVerified, usageAuditHash: taskItem.usageAuditHash, errorCode: taskItem.errorCode, attemptId: taskItem.attemptId, fence: taskItem.fence, reviewDecision: taskItem.reviewDecision, reviewedBy: taskItem.reviewedBy, reviewedAt: taskItem.reviewedAt, reviewReason: taskItem.reviewReason }).from(taskItem).where(scopedItems(userId, taskId)).orderBy(asc(taskItem.idx))
  const [settlement] = await db.select({ acceptedAmount: taskSettlement.acceptedAmount, refundedAmount: taskSettlement.refundedAmount, providerAmount: taskSettlement.providerAmount, brokerAmount: taskSettlement.brokerAmount, platformAmount: taskSettlement.platformAmount, status: taskSettlement.status, releaseAt: taskSettlement.releaseAt, releasedAt: taskSettlement.releasedAt }).from(taskSettlement).where(and(eq(taskSettlement.userId, userId), eq(taskSettlement.taskId, taskId))).limit(1)
  return { taskId, taskType: tk.taskType, operation: tk.operation, model: tk.model, nodeName: tk.nodeName, status: tk.status, settlement: tk.settlementStatus, reservedAmount: tk.reservedAmount, items, settlementDetail: settlement ? { ...settlement, releaseAt: settlement.releaseAt.toISOString(), releasedAt: settlement.releasedAt?.toISOString() ?? null } : null }
}
