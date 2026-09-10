import { randomUUID } from 'node:crypto'
import { and, eq, inArray, lte } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { task, taskItem, taskSettlement, wallet, ledgerEntry } from '@/lib/db/schema'
import { addStr, subStr, multiplyStr, percentageStr, gte } from './money'

export const ESCROW_MS = 7 * 24 * 60 * 60_000
const decisionSchema = z.object({ itemId: z.string().uuid(), decision: z.enum(['accepted', 'rejected']), reason: z.string().trim().min(1).max(500) }).strict()
const taskScope = (userId: string, taskId: string) => and(eq(task.userId, userId), eq(task.id, taskId))
const settlementScope = (userId: string, taskId: string) => and(eq(taskSettlement.userId, userId), eq(taskSettlement.taskId, taskId))
const summary = (row: typeof taskSettlement.$inferSelect, alreadySettled = false) => ({ ok: true as const, alreadySettled, provider: row.providerAmount, broker: row.brokerAmount, platform: row.platformAmount, refunded: row.refundedAmount, accepted: row.acceptedAmount, releaseAt: row.releaseAt.toISOString(), releaseStatus: row.status })

export async function reviewTaskItem(userId: string, taskId: string, input: unknown) {
  const parsed = decisionSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'invalid_input' }
  return db.transaction(async tx => {
    const [tk] = await tx.select().from(task).where(taskScope(userId, taskId)).for('update').limit(1)
    if (!tk) return { ok: false as const, error: 'not_found' }
    const scope = and(eq(taskItem.userId, userId), eq(taskItem.taskId, taskId), eq(taskItem.id, parsed.data.itemId))
    const [item] = await tx.select().from(taskItem).where(scope).for('update').limit(1)
    if (!item) return { ok: false as const, error: 'not_found' }
    if (item.reviewDecision) return item.reviewDecision === parsed.data.decision ? { ok: true as const, duplicate: true } : { ok: false as const, error: 'decision_conflict' }
    if (tk.settlementStatus !== 'unverified' || item.status !== 'review') return { ok: false as const, error: 'not_ready' }
    if (parsed.data.decision === 'accepted' && (!item.result?.trim() || item.errorCode)) return { ok: false as const, error: 'output_required' }
    await tx.update(taskItem).set({ reviewDecision: parsed.data.decision, reviewedBy: userId, reviewedAt: new Date(), reviewReason: parsed.data.reason }).where(scope)
    return { ok: true as const, duplicate: false }
  })
}

export async function settleTask(userId: string, taskId: string, acceptRemaining = true) {
  return db.transaction(async tx => {
    const [tk] = await tx.select().from(task).where(taskScope(userId, taskId)).for('update').limit(1)
    if (!tk) return { ok: false as const, error: 'not_found' }
    const [existing] = await tx.select().from(taskSettlement).where(settlementScope(userId, taskId)).limit(1)
    if (existing) return summary(existing, true)
    if (tk.settlementStatus === 'settled') {
      const entries = await tx.select({ key: ledgerEntry.businessKey, amount: ledgerEntry.amount }).from(ledgerEntry).where(and(eq(ledgerEntry.userId, userId), eq(ledgerEntry.taskId, taskId), inArray(ledgerEntry.businessKey, [`settle-provider:${taskId}`, `settle-broker:${taskId}`, `settle-platform:${taskId}`])))
      if (entries.length !== 3) return { ok: false as const, error: 'legacy_reconciliation_required' }
      const amount = (kind: string) => entries.find(entry => entry.key === `settle-${kind}:${taskId}`)!.amount
      return { ok: true as const, alreadySettled: true, provider: amount('provider'), broker: amount('broker'), platform: amount('platform'), refunded: '0.0000', accepted: tk.reservedAmount, releaseAt: null, releaseStatus: 'legacy' }
    }
    const itemsScope = and(eq(taskItem.userId, userId), eq(taskItem.taskId, taskId))
    const items = await tx.select().from(taskItem).where(itemsScope).for('update')
    if (items.length !== tk.itemCount || items.some(item => !['review', 'cancelled'].includes(item.status))) return { ok: false as const, error: 'not_ready' }
    const decisions = items.map(item => item.status === 'cancelled' ? 'cancelled' : item.reviewDecision ?? (acceptRemaining && item.result?.trim() && !item.errorCode ? 'accepted' : null))
    if (decisions.some(value => !value || !['accepted', 'rejected', 'cancelled'].includes(value))) return { ok: false as const, error: 'review_required' }
    if (items.some((item, index) => decisions[index] === 'accepted' && (!item.result?.trim() || item.errorCode))) return { ok: false as const, error: 'output_required' }
    const cost = (item: typeof taskItem.$inferSelect) => multiplyStr(tk.unitPrice, item.billingUnits)
    const sum = (filter: (item: typeof taskItem.$inferSelect, index: number) => boolean) => items.reduce((total, item, index) => filter(item, index) ? addStr(total, cost(item)) : total, '0.0000')
    const originalAmount = sum(() => true)
    const acceptedAmount = sum((_, index) => decisions[index] === 'accepted')
    const remaining = sum(item => item.status !== 'cancelled')
    if (remaining !== tk.reservedAmount || !gte(remaining, acceptedAmount)) return { ok: false as const, error: 'reconciliation_required' }
    const refundNow = subStr(remaining, acceptedAmount)
    const refundedAmount = subStr(originalAmount, acceptedAmount)
    const providerAmount = percentageStr(acceptedAmount, 85)
    const brokerAmount = percentageStr(acceptedAmount, 5)
    const platformAmount = subStr(subStr(acceptedAmount, providerAmount), brokerAmount)
    const [w] = await tx.select().from(wallet).where(eq(wallet.userId, userId)).for('update').limit(1)
    if (!w || !gte(w.spendingReserved, remaining)) return { ok: false as const, error: 'reconciliation_required' }
    const now = new Date()
    const spendingReserved = subStr(w.spendingReserved, remaining)
    const spendingAvailable = addStr(w.spendingAvailable, refundNow)
    const earningEscrowed = addStr(w.earningEscrowed, providerAmount)
    await tx.update(wallet).set({ spendingReserved, spendingAvailable, earningEscrowed, updatedAt: now }).where(eq(wallet.userId, userId))
    const entry = (suffix: string, account: string, amount: string, balanceAfter: string, description: string) => ({ id: randomUUID(), userId, taskId, kind: 'settlement', account, amount, balanceAfter, businessKey: `${suffix}:${taskId}`, description })
    await tx.insert(ledgerEntry).values([
      entry('settle-out', 'spending_reserved', `-${remaining}`, spendingReserved, '整单核验完成，释放剩余测试预留'),
      entry('settle-refund', 'spending_available', refundNow, spendingAvailable, '拒收记录退回测试预算'),
      entry('settle-provider', 'earning_escrowed', providerAmount, earningEscrowed, '供给方 85% · T+7 测试冻结，不可提现'),
      entry('settle-broker', 'broker_unallocated', brokerAmount, brokerAmount, '经纪 5% · 未绑定，不向任何人付款'),
      entry('settle-platform', 'platform_revenue', platformAmount, platformAmount, '平台剩余份额 · 仅测试记账'),
    ])
    const newlyAccepted = items.filter(item => item.status !== 'cancelled' && !item.reviewDecision).map(item => item.id)
    if (newlyAccepted.length) await tx.update(taskItem).set({ reviewDecision: 'accepted', reviewedBy: userId, reviewedAt: now, reviewReason: '用户明确确认：全部接受并结算' }).where(and(itemsScope, inArray(taskItem.id, newlyAccepted)))
    const [settlement] = await tx.insert(taskSettlement).values({ id: randomUUID(), taskId, userId, originalAmount, acceptedAmount, refundedAmount, providerAmount, brokerAmount, platformAmount, settledAt: now, releaseAt: new Date(now.getTime() + ESCROW_MS), status: providerAmount === '0.0000' ? 'released' : 'escrowed', releasedAt: providerAmount === '0.0000' ? now : null }).returning()
    await tx.update(task).set({ settlementStatus: 'settled', settledAt: now, reservedAmount: '0.0000' }).where(taskScope(userId, taskId))
    return summary(settlement)
  })
}

export async function releaseSettlement(userId: string, settlementId: string) {
  return db.transaction(async tx => {
    const scope = and(eq(taskSettlement.userId, userId), eq(taskSettlement.id, settlementId))
    const [row] = await tx.select().from(taskSettlement).where(scope).for('update').limit(1)
    if (!row || row.status === 'released') return { released: false, releaseAt: null }
    const now = new Date()
    if (row.releaseAt > now) return { released: false, releaseAt: row.releaseAt.toISOString() }
    const [w] = await tx.select().from(wallet).where(eq(wallet.userId, userId)).for('update').limit(1)
    if (!w || !gte(w.earningEscrowed, row.providerAmount)) throw new Error('settlement_reconciliation_required')
    const earningEscrowed = subStr(w.earningEscrowed, row.providerAmount)
    const earningAvailable = addStr(w.earningAvailable, row.providerAmount)
    await tx.update(wallet).set({ earningEscrowed, earningAvailable, updatedAt: now }).where(eq(wallet.userId, userId))
    await tx.insert(ledgerEntry).values([
      { id: randomUUID(), userId, taskId: row.taskId, kind: 'unfreeze', account: 'earning_escrowed', amount: `-${row.providerAmount}`, balanceAfter: earningEscrowed, businessKey: `unfreeze-out:${row.id}`, description: 'T+7 测试冻结到期转出' },
      { id: randomUUID(), userId, taskId: row.taskId, kind: 'unfreeze', account: 'earning_available', amount: row.providerAmount, balanceAfter: earningAvailable, businessKey: `unfreeze-in:${row.id}`, description: 'T+7 测试收益已解冻，仍不可提现或兑换' },
    ])
    await tx.update(taskSettlement).set({ status: 'released', releasedAt: now }).where(scope)
    return { released: true, releaseAt: null }
  })
}

export async function releaseDueSettlements(userId: string) {
  const due = await db.select({ id: taskSettlement.id }).from(taskSettlement).where(and(eq(taskSettlement.userId, userId), eq(taskSettlement.status, 'escrowed'), lte(taskSettlement.releaseAt, new Date()))).limit(100)
  for (const row of due) await releaseSettlement(userId, row.id)
}

export async function reconcileWallet(userId: string) {
  return db.transaction(async tx => {
    const [w] = await tx.select().from(wallet).where(eq(wallet.userId, userId)).limit(1)
    if (!w) return { ok: false, problems: ['wallet_missing'] }
    const entries = await tx.select({ account: ledgerEntry.account, amount: ledgerEntry.amount }).from(ledgerEntry).where(eq(ledgerEntry.userId, userId))
    const tasks = await tx.select().from(task).where(eq(task.userId, userId))
    const settlements = await tx.select().from(taskSettlement).where(eq(taskSettlement.userId, userId))
    const problems: string[] = []
    for (const [account, balance] of Object.entries({ spending_available: w.spendingAvailable, spending_reserved: w.spendingReserved, earning_escrowed: w.earningEscrowed, earning_available: w.earningAvailable })) {
      const total = entries.filter(entry => entry.account === account).reduce((sum, entry) => addStr(sum, entry.amount), '0.0000')
      if (!gte(balance, '0.0000') || total !== balance) problems.push(account)
    }
    const reserved = tasks.filter(tk => tk.settlementStatus !== 'settled').reduce((sum, tk) => addStr(sum, tk.reservedAmount), '0.0000')
    if (reserved !== w.spendingReserved) problems.push('task_reservations')
    if (settlements.some(row => addStr(row.acceptedAmount, row.refundedAmount) !== row.originalAmount || addStr(addStr(row.providerAmount, row.brokerAmount), row.platformAmount) !== row.acceptedAmount)) problems.push('settlement_conservation')
    return { ok: problems.length === 0, problems }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
