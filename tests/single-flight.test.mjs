import test from 'node:test'
import assert from 'node:assert/strict'
import { createSingleFlightCooldown } from '../lib/venus/single-flight.ts'

test('同一 key 合并并发任务，并在冷却期跳过重复触发', async () => {
  let clock = 1000
  let calls = 0
  let release
  const gate = createSingleFlightCooldown(5000, () => clock)
  const first = gate('user-a', () => {
    calls += 1
    return new Promise(resolve => { release = resolve })
  })
  const second = gate('user-a', async () => {
    calls += 1
    return undefined
  })

  assert.strictEqual(first, second)
  await Promise.resolve()
  assert.equal(calls, 1)
  release()
  await first
  assert.equal(await gate('user-a', async () => { calls += 1 }), undefined)
  assert.equal(calls, 1)

  clock += 5001
  await gate('user-a', async () => { calls += 1 })
  assert.equal(calls, 2)
})

test('任务失败后仍能在冷却期结束后重试', async () => {
  let clock = 2000
  let calls = 0
  const gate = createSingleFlightCooldown(1000, () => clock)

  await assert.rejects(gate('user-b', async () => {
    calls += 1
    throw new Error('expected')
  }), /expected/)
  assert.equal(await gate('user-b', async () => { calls += 1 }), undefined)
  clock += 1001
  await gate('user-b', async () => { calls += 1 })
  assert.equal(calls, 2)
})
