import { createHash, randomUUID } from 'crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { ledgerEntry, node, nodeHeartbeat, task, taskItem, wallet } from '@/lib/db/schema'
import { prepareTaskDraft } from './task-draft'
import { taskSubmissionSchema, type TaskSubmission } from './task-submission'
import { readPolicy } from '@/packages/node-protocol'
import { cancelExecution } from './execution'
import { CURRENCY, INITIAL_GRANT, UNIT_PRICE, addStr, gte, multiplyStr, percentageStr, subStr } from './money'

export type WalletView = {
  currency: string
  spendingAvailable: string
  spendingReserved: string
  earningEscrowed: string
  earningAvailable: string
}

export type TaskView = {
  id: string
  instruction: string
  taskType: string
  operation: string
  itemCount: number
  concurrency: number
  unitPrice: string
  reservedAmount: string
  currency: string
  status: string
  model: string | null
  nodeName: string | null
  cancelRequested: boolean
  settlementStatus: string
  createdAt: string
}

export type LedgerView = {
  id: string
  kind: string
  account: string
  amount: string
  balanceAfter: string
  taskId: string | null
  description: string
  createdAt: string
}

// Creates the per-user test wallet with a one-time grant on first access.
// Both writes are idempotent (unique userId / businessKey), so repeated calls
// never double-grant test funds.
export async function ensureWallet(userId: string): Promise<void> {
  await db
    .insert(wallet)
    .values({ id: randomUUID(), userId, currency: CURRENCY, spendingAvailable: INITIAL_GRANT })
    .onConflictDoNothing({ target: wallet.userId })
  await db
    .insert(ledgerEntry)
    .values({
      id: randomUUID(),
      userId,
      kind: 'grant',
      account: 'spending_available',
      amount: INITIAL_GRANT,
      balanceAfter: INITIAL_GRANT,
      businessKey: `grant:${userId}`,
      description: '测试初始额度 · 不可提现 / Test allowance (non-withdrawable)',
    })
    .onConflictDoNothing({ target: ledgerEntry.businessKey })
}

export async function getWallet(userId: string): Promise<WalletView> {
  await ensureWallet(userId)
  const [row] = await db.select().from(wallet).where(eq(wallet.userId, userId)).limit(1)
  return {
    currency: row.currency,
    spendingAvailable: row.spendingAvailable,
    spendingReserved: row.spendingReserved,
    earningEscrowed: row.earningEscrowed,
    earningAvailable: row.earningAvailable,
  }
}

export async function listTasks(userId: string): Promise<TaskView[]> {
  const rows = await db
    .select()
    .from(task)
    .where(eq(task.userId, userId))
    .orderBy(desc(task.createdAt))
    .limit(100)
  return rows.map((row) => ({
    id: row.id,
    instruction: row.instruction,
    taskType: row.taskType,
    operation: row.operation,
    itemCount: row.itemCount,
    concurrency: row.concurrency,
    unitPrice: row.unitPrice,
    reservedAmount: row.reservedAmount,
    currency: row.currency,
    status: row.status,
    model: row.model,
    nodeName: row.nodeName,
    cancelRequested: row.cancelRequested,
    settlementStatus: row.settlementStatus,
    createdAt: row.createdAt.toISOString(),
  }))
}

export async function listLedger(userId: string): Promise<LedgerView[]> {
  const rows = await db
    .select()
    .from(ledgerEntry)
    .where(eq(ledgerEntry.userId, userId))
    .orderBy(desc(ledgerEntry.createdAt))
    .limit(50)
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    account: row.account,
    amount: row.amount,
    balanceAfter: row.balanceAfter,
    taskId: row.taskId,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  }))
}

export type CreateTaskResult =
  | { ok: true; taskId: string; reserved: string; itemCount: number }
  | { ok: false; error: 'invalid_input' | 'too_many_records' | 'record_too_long' | 'media_line_json' | 'media_line_invalid' | 'invalid_media_spec' | 'insufficient_budget' | 'invalid_node' | 'idempotency_conflict' }

// Atomically reserves the server-computed test budget and persists the task and
// its items. The wallet row is locked FOR UPDATE so concurrent submissions can
// never over-reserve, and paired ledger entries keep the test books balanced.
export async function createTask(userId: string, input: TaskSubmission): Promise<CreateTaskResult> {
  const parsed = taskSubmissionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
  const requestKey = `${userId}:${parsed.data.requestId}`
  const requestHash = createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex')
  const execution = parsed.data.execution
  const prepared = prepareTaskDraft(parsed.data)
  if (!prepared.ok) return { ok: false, error: prepared.error }
  const { instruction, concurrency, items, taskType, operation, mediaSpec } = prepared.draft
  const itemCount = items.length
  // Price is always recomputed from server-validated billing units; client amounts are ignored.
  const price = items.reduce((total, item) => addStr(total, multiplyStr(UNIT_PRICE, item.billingUnits ?? 1)), '0.0000')
  await ensureWallet(userId)

  return db.transaction(async (tx) => {
    let nodeName: string | null = null
    if (execution) {
      const [n] = await tx.select().from(node).where(and(eq(node.userId, userId), eq(node.id, execution.nodeId))).for('update').limit(1)
      const policy = readPolicy(n?.resourcePolicy)
      const [hb] = await tx.select().from(nodeHeartbeat).where(and(eq(nodeHeartbeat.userId, userId), eq(nodeHeartbeat.nodeId, execution.nodeId))).limit(1)
      if (!n || n.status === 'revoked' || !policy.enabled || !policy.allowedModels.includes(execution.model) || !hb?.models?.includes(execution.model)) return { ok: false as const, error: 'invalid_node' as const }
      nodeName = n.name
    }
    const [w] = await tx.select().from(wallet).where(eq(wallet.userId, userId)).for('update').limit(1)
    const [existing] = await tx.select().from(task).where(and(eq(task.userId, userId), eq(task.requestKey, requestKey))).limit(1)
    if (existing) return existing.requestHash === requestHash
      ? { ok: true as const, taskId: existing.id, reserved: existing.reservedAmount, itemCount: existing.itemCount }
      : { ok: false as const, error: 'idempotency_conflict' as const }
    if (!w || !gte(w.spendingAvailable, price)) return { ok: false as const, error: 'insufficient_budget' as const }
    const newAvailable = subStr(w.spendingAvailable, price)
    const newReserved = addStr(w.spendingReserved, price)
    await tx
      .update(wallet)
      .set({ spendingAvailable: newAvailable, spendingReserved: newReserved, updatedAt: new Date() })
      .where(eq(wallet.userId, userId))

    const taskId = randomUUID()
    await tx.insert(task).values({
      id: taskId,
      userId,
      instruction,
      taskType,
      operation,
      mediaSpec,
      itemCount,
      concurrency,
      unitPrice: UNIT_PRICE,
      reservedAmount: price,
      currency: CURRENCY,
      status: execution ? 'queued' : 'pending_nodes',
      nodeId: execution?.nodeId ?? null,
      model: execution?.model ?? null,
      nodeName,
      consentedAt: execution ? new Date() : null,
      requestKey,
      requestHash,
    })
    await tx.insert(taskItem).values(
      items.map((item) => ({ id: randomUUID(), taskId, userId, idx: item.index, text: item.text, billingUnits: item.billingUnits ?? 1, status: 'pending' })),
    )
    await tx.insert(ledgerEntry).values([
      {
        id: randomUUID(),
        userId,
        kind: 'reserve',
        account: 'spending_available',
        amount: `-${price}`,
        balanceAfter: newAvailable,
        taskId,
        businessKey: `reserve-out:${taskId}`,
        description: '任务预算预留 / Task budget reserved',
      },
      {
        id: randomUUID(),
        userId,
        kind: 'reserve',
        account: 'spending_reserved',
        amount: price,
        balanceAfter: newReserved,
        taskId,
        businessKey: `reserve-in:${taskId}`,
        description: '任务预算预留 / Task budget reserved',
      },
    ])
    return { ok: true as const, taskId, reserved: price, itemCount }
  })
}

export type CancelTaskResult =
  | { ok: true; released: string }
  | { ok: false; error: 'not_found' | 'not_cancellable' }

// Only undispatched records are refunded. In-flight or uncertain work keeps
// its reservation until reviewed; repeated cancellation is idempotent.
export async function cancelTask(userId: string, taskId: string): Promise<CancelTaskResult> {
  return cancelExecution(userId, taskId)
}

export type SettleTaskResult =
  | { ok: true; alreadySettled?: boolean; provider: string; broker: string; platform: string }
  | { ok: false; error: 'not_found' | 'not_ready' | 'already_cancelled' }

// Settlement is an explicit user action after reviewing every item. Node output
// never mints earnings on its own; this keeps uncertain or partial media work out of the ledger.
export async function settleTask(userId: string, taskId: string): Promise<SettleTaskResult> {
  return db.transaction(async (tx) => {
    const [tk] = await tx.select().from(task).where(and(eq(task.userId, userId), eq(task.id, taskId))).for('update').limit(1)
    if (!tk) return { ok: false as const, error: 'not_found' as const }
    if (tk.settlementStatus === 'settled') return { ok: true as const, alreadySettled: true, provider: '0.0000', broker: '0.0000', platform: '0.0000' }
    if (tk.status === 'cancelled' || tk.cancelRequested) return { ok: false as const, error: 'already_cancelled' as const }
    const items = await tx.select({ status: taskItem.status, result: taskItem.result }).from(taskItem).where(and(eq(taskItem.userId, userId), eq(taskItem.taskId, taskId)))
    if (items.length !== tk.itemCount || tk.status !== 'review' || items.some(item => item.status !== 'review' || !item.result)) return { ok: false as const, error: 'not_ready' as const }
    const [w] = await tx.select().from(wallet).where(eq(wallet.userId, userId)).for('update').limit(1)
    if (!w || !gte(w.spendingReserved, tk.reservedAmount)) return { ok: false as const, error: 'not_ready' as const }
    const provider = percentageStr(tk.reservedAmount, 85)
    const broker = percentageStr(tk.reservedAmount, 5)
    const platform = subStr(subStr(tk.reservedAmount, provider), broker)
    const spendingReserved = subStr(w.spendingReserved, tk.reservedAmount)
    const earningEscrowed = addStr(w.earningEscrowed, provider)
    await tx.update(wallet).set({ spendingReserved, earningEscrowed, updatedAt: new Date() }).where(eq(wallet.userId, userId))
    await tx.insert(ledgerEntry).values([
      { id: randomUUID(), userId, taskId, kind: 'settlement', account: 'spending_reserved', amount: `-${tk.reservedAmount}`, balanceAfter: spendingReserved, businessKey: `settle-out:${taskId}`, description: '任务核验后释放预留 / Verified task reservation released' },
      { id: randomUUID(), userId, taskId, kind: 'settlement', account: 'earning_escrowed', amount: provider, balanceAfter: earningEscrowed, businessKey: `settle-provider:${taskId}`, description: '供给方 85% · T+7 待解冻 / Provider 85% · T+7 escrow' },
      { id: randomUUID(), userId, taskId, kind: 'settlement', account: 'broker_unallocated', amount: broker, balanceAfter: broker, businessKey: `settle-broker:${taskId}`, description: '经纪 5% · 未绑定，暂不分配 / Broker 5% · unassigned' },
      { id: randomUUID(), userId, taskId, kind: 'settlement', account: 'platform_revenue', amount: platform, balanceAfter: platform, businessKey: `settle-platform:${taskId}`, description: '平台 10% · 测试账本 / Platform 10% · test ledger' },
    ])
    await tx.update(task).set({ settlementStatus: 'settled', settledAt: new Date() }).where(and(eq(task.userId, userId), eq(task.id, taskId)))
    return { ok: true as const, provider, broker, platform }
  })
}
