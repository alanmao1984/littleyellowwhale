import './isolated-db.mts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { db, pool } from '../lib/db/index'
import { task, taskItem, taskSettlement, wallet, ledgerEntry, node, nodeHeartbeat, nodeIdentity, enrollmentIntent } from '../lib/db/schema'
import { ensureWallet, createTask, getWallet, readWallet, cancelTask } from '../lib/venus/ledger'
import { settleTask, reviewTaskItem, releaseSettlement, reconcileWallet, ESCROW_MS } from '../lib/venus/settlements'
import { claimLeaseDispatch, finishLeaseDispatch, claimReleaseDispatch, finishReleaseDispatch } from '../lib/venus/dispatch'
import { claimWork, completeAttempt, getTaskResults } from '../lib/venus/execution'
import { createEnrollmentIntent, enrollNode, recordHeartbeat, saveNodePolicy } from '../lib/venus/nodes'
import { DEFAULT_POLICY } from '../packages/node-protocol/index'

test('隔离 Neon：测试分账、拒收、T+7、调度竞争与余额守恒', async t => {
  const a = `settlement-test-${randomUUID()}`; const b = `settlement-test-${randomUUID()}`
  const owners = [a,b]
  try {
    await t.test('只读钱包入口不创建账户额度', async () => {
      assert.equal(await readWallet(b), null)
      assert.equal((await db.select({ id: wallet.id }).from(wallet).where(eq(wallet.userId, b))).length, 0)
    })
    await t.test('并发首次建钱包仅发放一次额度且与分录原子一致', async () => {
      await Promise.all(Array.from({ length: 10 }, () => ensureWallet(a)))
      assert.equal((await getWallet(a)).spendingAvailable, '100.0000')
      const grants = await db.select({ id: ledgerEntry.id }).from(ledgerEntry).where(and(eq(ledgerEntry.userId, a), eq(ledgerEntry.kind, 'grant')))
      assert.equal(grants.length, 1); assert.deepEqual(await reconcileWallet(a), { ok: true, problems: [] })
    })
    const intent = await createEnrollmentIntent(a, { nodeName: '测试结算节点', platform: 'macos' })
    if (!intent.ok) throw new Error('fixture')
    const enrolled = await enrollNode(intent.code); if (!enrolled.ok) throw new Error('fixture')
    const p = { userId: a, nodeId: enrolled.nodeId }
    await recordHeartbeat(p.nodeId, a, { models: ['test-model'] })
    await saveNodePolicy(a, p.nodeId, { ...DEFAULT_POLICY, enabled: true, maxConcurrency: 2, allowedModels: ['test-model'] })
    const input = { instruction: '隔离测试，非真实模型', content: 'success\nuncertain\ncancel one\ncancel two', concurrency: 2, requestId: randomUUID(), execution: { nodeId: p.nodeId, model: 'test-model', consent: true as const } }
    const [submitted, retry] = await Promise.all([createTask(a, input), createTask(a, input)])
    assert.ok(submitted.ok && retry.ok)
    if (!submitted.ok || !retry.ok) throw new Error('submit')
    const taskId = submitted.taskId
    assert.equal(retry.taskId, taskId)
    const one = (await claimWork(p, randomUUID())).assignment!; const two = (await claimWork(p, randomUUID())).assignment!
    await t.test('跨用户核验取消结算拒绝；任务执行中不允许整单处置', async () => {
      assert.equal((await settleTask(b, taskId)).ok, false)
      assert.equal((await cancelTask(b, taskId)).ok, false)
      assert.equal(await getTaskResults(b, taskId), null)
      assert.equal((await settleTask(a, taskId)).ok, false)
    })
    await t.test('watcher 调度租约竞争、到期重领与旧领取者不能覆盖', async () => {
      const claims = await Promise.all(Array.from({ length: 5 }, () => claimLeaseDispatch(a, one.attemptId)))
      assert.equal(claims.filter(Boolean).length, 1)
      assert.equal(await claimLeaseDispatch(b, one.attemptId), null)
      const old = claims.find(Boolean)!
      await db.update(taskItem).set({ watcherClaimUntil: new Date(Date.now() - 1) }).where(and(eq(taskItem.userId, a), eq(taskItem.attemptId, one.attemptId)))
      const fresh = await claimLeaseDispatch(a, one.attemptId); assert.ok(fresh)
      await finishLeaseDispatch(a, one.attemptId, old, 'stale-run')
      const [row] = await db.select().from(taskItem).where(and(eq(taskItem.userId, a), eq(taskItem.attemptId, one.attemptId)))
      assert.equal(row.watcherRunId, null)
      await finishLeaseDispatch(a, one.attemptId, fresh, 'test-run')
      assert.equal(await claimLeaseDispatch(a, one.attemptId), null)
    })
    assert.deepEqual(await cancelTask(a, taskId), { ok: true, released: '0.0400' })
    await completeAttempt(p, { attemptId: one.attemptId, fence: one.fence, outcome: 'completed', model: one.model, output: '协议 fixture 输出，非模型推理' })
    await completeAttempt(p, { attemptId: two.attemptId, fence: two.fence, outcome: 'uncertain', model: two.model, errorCode: 'inference_error' })
    const details = (await getTaskResults(a, taskId))!
    const accepted = details.items[0]; const rejected = details.items[1]
    await t.test('错误记录不能接受；核验决定不可改写且保留原始执行证据', async () => {
      assert.equal((await reviewTaskItem(b, taskId, { itemId: accepted.id, decision: 'accepted', reason: '越权' })).ok, false)
      assert.equal((await reviewTaskItem(a, taskId, { itemId: rejected.id, decision: 'accepted', reason: '无输出' })).ok, false)
      assert.equal((await reviewTaskItem(a, taskId, { itemId: accepted.id, decision: 'accepted', reason: '确认自有节点测试结果' })).ok, true)
      assert.equal((await reviewTaskItem(a, taskId, { itemId: accepted.id, decision: 'rejected', reason: '冲突' })).ok, false)
      assert.equal((await settleTask(a, taskId, false)).ok, false)
      assert.equal((await reviewTaskItem(a, taskId, { itemId: rejected.id, decision: 'rejected', reason: '不确定任务由所有者明确拒收' })).ok, true)
      const after = (await getTaskResults(a, taskId))!
      assert.equal(after.items[0].output, accepted.output); assert.equal(after.items[1].errorCode, 'inference_error')
    })
    await t.test('部分取消、接受与拒收可整单处置；竞争重复确认返回相同金额不重复入账', async () => {
      const results = await Promise.all(Array.from({ length: 5 }, () => settleTask(a, taskId, false)))
      assert.ok(results.every(result => result.ok))
      for (const result of results) if (result.ok) { assert.equal(result.provider, '0.0170'); assert.equal(result.broker, '0.0010'); assert.equal(result.platform, '0.0020'); assert.equal(result.refunded, '0.0600') }
      assert.equal((await getWallet(a)).spendingAvailable, '99.9800'); assert.equal((await getWallet(a)).spendingReserved, '0.0000')
      assert.deepEqual(await reconcileWallet(a), { ok: true, problems: [] })
      const [tk] = await db.select().from(task).where(and(eq(task.userId, a), eq(task.id, taskId)))
      assert.equal(tk.reservedAmount, '0.0000')
      assert.equal((await cancelTask(a, taskId)).ok, false)
      const rows = await db.select().from(taskSettlement).where(and(eq(taskSettlement.userId, a), eq(taskSettlement.taskId, taskId)))
      assert.equal(rows.length, 1); assert.equal(rows[0].releaseAt.getTime() - rows[0].settledAt.getTime(), ESCROW_MS)
    })
    const [settlement] = await db.select().from(taskSettlement).where(and(eq(taskSettlement.userId, a), eq(taskSettlement.taskId, taskId)))
    await t.test('解冻调度租约原子领取、失败可重试', async () => {
      const claims = await Promise.all([claimReleaseDispatch(a, settlement.id), claimReleaseDispatch(a, settlement.id)])
      assert.equal(claims.filter(Boolean).length, 1)
      await finishReleaseDispatch(a, settlement.id, claims.find(Boolean)!, null)
      assert.ok(await claimReleaseDispatch(a, settlement.id))
    })
    await t.test('T+7 不能提前或跨用户解冻；到期竞争只写一对分录', async () => {
      assert.equal((await releaseSettlement(b, settlement.id)).released, false)
      assert.equal((await releaseSettlement(a, settlement.id)).released, false)
      await db.update(taskSettlement).set({ releaseAt: new Date(Date.now() - 1) }).where(and(eq(taskSettlement.userId, a), eq(taskSettlement.id, settlement.id)))
      const results = await Promise.all(Array.from({ length: 8 }, () => releaseSettlement(a, settlement.id)))
      assert.equal(results.filter(result => result.released).length, 1)
      const w = await getWallet(a); assert.equal(w.earningEscrowed, '0.0000'); assert.equal(w.earningAvailable, '0.0170')
      const entries = await db.select({ id: ledgerEntry.id }).from(ledgerEntry).where(and(eq(ledgerEntry.userId, a), eq(ledgerEntry.kind, 'unfreeze')))
      assert.equal(entries.length, 2); assert.deepEqual(await reconcileWallet(a), { ok: true, problems: [] })
    })
    await t.test('全部接受快捷入口与钱包读取到期补偿保持幂等', async () => {
      const submitted = await createTask(a, { ...input, requestId: randomUUID(), content: 'accept all' })
      assert.ok(submitted.ok); if (!submitted.ok) throw new Error('fixture')
      const work = (await claimWork(p, randomUUID())).assignment!
      await completeAttempt(p, { attemptId: work.attemptId, fence: work.fence, model: work.model, outcome: 'completed', output: '协议 fixture' })
      const first = await settleTask(a, submitted.taskId)
      assert.ok(first.ok)
      const [row] = await db.select().from(taskSettlement).where(and(eq(taskSettlement.userId, a), eq(taskSettlement.taskId, submitted.taskId)))
      await db.update(taskSettlement).set({ releaseAt: new Date(Date.now() - 1) }).where(and(eq(taskSettlement.userId, a), eq(taskSettlement.id, row.id)))
      assert.equal((await readWallet(a))?.earningEscrowed, '0.0170')
      const before = await getWallet(a)
      assert.equal(before.earningEscrowed, '0.0000'); assert.equal(before.earningAvailable, '0.0340')
      assert.deepEqual(await getWallet(a), before)
      const again = await settleTask(a, submitted.taskId); assert.ok(again.ok); if (again.ok) assert.equal(again.provider, '0.0170')
      assert.deepEqual(await reconcileWallet(a), { ok: true, problems: [] })
    })
    await t.test('全未派发取消不重复退款，最终处置余额仍守恒', async () => {
      const created = await createTask(a, { ...input, requestId: randomUUID(), execution: null })
      assert.ok(created.ok); if (!created.ok) throw new Error('fixture')
      await cancelTask(a, created.taskId); await cancelTask(a, created.taskId)
      const result = await settleTask(a, created.taskId, false)
      assert.ok(result.ok); if (result.ok) { assert.equal(result.provider, '0.0000'); assert.equal(result.refunded, '0.0800'); assert.equal(result.releaseStatus, 'released') }
      assert.deepEqual(await reconcileWallet(a), { ok: true, problems: [] })
    })
  } finally {
    await db.transaction(async tx => { for (const table of [taskSettlement, taskItem, task, ledgerEntry, wallet, nodeHeartbeat, nodeIdentity, enrollmentIntent, node]) await tx.delete(table).where(inArray(table.userId, owners)) })
    await pool.end()
  }
})
