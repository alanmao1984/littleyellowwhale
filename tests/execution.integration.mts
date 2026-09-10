import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { db, pool } from '../lib/db/index'
import { node, nodeIdentity, nodeHeartbeat, enrollmentIntent, task, taskItem, wallet, ledgerEntry } from '../lib/db/schema'
import { createEnrollmentIntent, enrollNode, recordHeartbeat, saveNodePolicy, setNodeStatus, resolveNodeToken } from '../lib/venus/nodes'
import { createTask, cancelTask, getWallet } from '../lib/venus/ledger'
import { claimWork, renewLease, completeAttempt, getTaskResults, reconcileUserLeases } from '../lib/venus/execution'
import { DEFAULT_POLICY } from '../packages/node-protocol/index'

test('真实 Neon：授权、并发租约、撤销、过期、取消与结果幂等', async t => {
  const a = `protocol-test-${randomUUID()}`
  const b = `protocol-test-${randomUUID()}`
  const owners = [a, b]
  const policy = { ...DEFAULT_POLICY, enabled: true, allowedModels: ['test-model'], maxConcurrency: 1 }
  async function fixture(userId: string) {
    const intent = await createEnrollmentIntent(userId, { nodeName: '隔离协议测试节点', platform: 'macos' })
    assert.equal(intent.ok, true)
    if (!intent.ok) throw new Error('fixture')
    const enrolled = await enrollNode(intent.code)
    if (!enrolled.ok) throw new Error('fixture')
    await recordHeartbeat(enrolled.nodeId, userId, { models: ['test-model'] })
    const principal = { userId, nodeId: enrolled.nodeId }
    return { ...principal, token: enrolled.nodeToken }
  }
  try {
    const na = await fixture(a)
    const nb = await fixture(b)
    const input = { instruction: '协议测试：返回输入', content: 'record one\nrecord two\nrecord three', concurrency: 3, requestId: randomUUID(), execution: { nodeId: na.nodeId, model: 'test-model', consent: true as const } }
    assert.equal((await createTask(a, input)).ok, false)
    await saveNodePolicy(a, na.nodeId, policy)
    await saveNodePolicy(b, nb.nodeId, policy)
    assert.equal((await saveNodePolicy(b, na.nodeId, policy)).ok, false)
    assert.equal((await createTask(b, input)).ok, false)
    const legacy = await createTask(a, { ...input, requestId: randomUUID(), execution: null, content: 'not authorized' })
    assert.equal(legacy.ok, true)
    assert.equal((await claimWork(na, randomUUID())).assignment, null)
    const [first, retry] = await Promise.all([createTask(a, input), createTask(a, input)])
    assert.equal(first.ok, true); assert.equal(retry.ok, true)
    if (!first.ok || !retry.ok) throw new Error('submit')
    assert.equal(first.taskId, retry.taskId)
    assert.equal((await createTask(a, { ...input, content: 'changed' })).ok, false)
    const keys = [randomUUID(), randomUUID(), randomUUID()]
    const claims = await Promise.all(keys.map(key => claimWork(na, key)))
    assert.equal(claims.filter(c => c.assignment).length, 1)
    const winner = claims.findIndex(c => c.assignment)
    const work = claims[winner].assignment!
    assert.equal((await claimWork(na, keys[winner])).assignment?.attemptId, work.attemptId)
    assert.equal((await claimWork(nb, randomUUID())).assignment, null)
    assert.equal((await renewLease(nb, work.attemptId, work.fence)).ok, false)
    assert.equal((await renewLease(na, work.attemptId, work.fence + 1)).ok, false)
    assert.equal((await renewLease(na, work.attemptId, work.fence)).ok, true)
    const cancel = await cancelTask(a, first.taskId)
    assert.deepEqual(cancel, { ok: true, released: '0.0400' })
    assert.deepEqual(await cancelTask(a, first.taskId), { ok: true, released: '0.0000' })
    const renewal = await renewLease(na, work.attemptId, work.fence)
    assert.equal(renewal.ok && renewal.cancelRequested, true)
    const result = { attemptId: work.attemptId, fence: work.fence, model: work.model, outcome: 'completed' as const, output: '协议测试输出（非真实模型）', usage: { inputTokens: 3, outputTokens: 4 } }
    assert.equal((await completeAttempt(nb, result)).ok, false)
    assert.equal((await completeAttempt(na, { ...result, fence: work.fence + 1 })).ok, false)
    assert.equal((await completeAttempt(na, result)).ok, true)
    const balance = await getWallet(a)
    const replay = await completeAttempt(na, result)
    assert.equal(replay.ok && replay.duplicate, true)
    assert.deepEqual(await getWallet(a), balance)
    assert.equal((await completeAttempt(na, { ...result, output: 'changed' })).ok, false)
    assert.equal(await getTaskResults(b, first.taskId), null)
    const detail = await getTaskResults(a, first.taskId)
    assert.equal(detail?.items[0].output, result.output)
    assert.deepEqual(detail?.items.map(i => i.index), [0, 1, 2])
    assert.equal(detail?.status, 'review')
    assert.equal(balance.earningEscrowed, '0.0000')
    const second = await createTask(a, { ...input, requestId: randomUUID(), content: 'expiry case' })
    assert.equal(second.ok, true)
    const expiring = (await claimWork(na, randomUUID())).assignment!
    await db.update(taskItem).set({ leaseExpiresAt: new Date(Date.now() - 1000) }).where(and(eq(taskItem.userId, a), eq(taskItem.attemptId, expiring.attemptId)))
    await reconcileUserLeases(a)
    assert.equal((await completeAttempt(na, { ...result, attemptId: expiring.attemptId, fence: expiring.fence })).ok, false)
    assert.equal((await claimWork(na, randomUUID())).assignment, null)
    const beforeRevoke = await resolveNodeToken(na.token)
    assert.equal(beforeRevoke?.nodeId, na.nodeId)
    await setNodeStatus(a, na.nodeId, 'revoked')
    assert.equal(await resolveNodeToken(na.token), null)
    assert.equal((await setNodeStatus(a, na.nodeId, 'enrolled')).ok, false)
    assert.equal((await saveNodePolicy(a, na.nodeId, policy)).ok, false)
    t.diagnostic('通过真实事务竞争验证单节点并发上限；未调用模型、未生成结算收益。')
  } finally {
    await db.transaction(async tx => {
      for (const table of [taskItem, task, ledgerEntry, wallet, nodeHeartbeat, nodeIdentity, enrollmentIntent, node]) await tx.delete(table).where(inArray(table.userId, owners))
    })
    await pool.end()
  }
})
