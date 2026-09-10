import test from 'node:test'
import assert from 'node:assert/strict'
import { resourcePolicySchema, readPolicy, withinSchedule, canExecute, heartbeatSchema, resultSchema, DEFAULT_POLICY } from '../packages/node-protocol/index.ts'
import { localServiceUrl } from '../packages/venus-node/src/adapters.ts'
import { platformUrl } from '../packages/venus-node/src/runtime.ts'

const policy = { ...DEFAULT_POLICY, enabled: true, allowedModels: ['qwen2.5:7b'], start: '22:00', end: '06:00' }
test('新节点及损坏的策略默认拒绝接单', () => {
  assert.equal(canExecute(readPolicy(null), 'qwen2.5:7b'), false)
  assert.equal(readPolicy({ enabled: true }).enabled, false)
  assert.equal(resourcePolicySchema.safeParse({ ...policy, allowedModels: [] }).success, false)
})
test('跨午夜时段按节点时区判断，结束边界不接单', () => {
  assert.equal(withinSchedule(policy, new Date('2026-09-09T14:00:00Z')), true)
  assert.equal(withinSchedule(policy, new Date('2026-09-09T21:59:00Z')), true)
  assert.equal(withinSchedule(policy, new Date('2026-09-09T22:00:00Z')), false)
  assert.equal(withinSchedule(policy, new Date('2026-09-09T10:00:00Z')), false)
})
test('全天授权仍要求精确模型白名单', () => {
  const all = { ...policy, start: '00:00', end: '00:00' }
  assert.equal(canExecute(all, 'qwen2.5:7b'), true)
  assert.equal(canExecute(all, 'other'), false)
})
test('拒绝非法时区、超额并发与额外字段', () => {
  for (const input of [{ ...policy, timeZone: 'Mars/Base' }, { ...policy, maxConcurrency: 9 }, { ...policy, start: '25:00' }, { ...policy, executeShell: true }]) assert.equal(resourcePolicySchema.safeParse(input).success, false)
})
test('心跳遥测只接受有界真实数值', () => {
  for (const input of [{ cpu: 101 }, { vram: -1 }, { models: ['$(run)'] }, { models: Array(33).fill('model') }]) assert.equal(heartbeatSchema.safeParse(input).success, false)
  assert.equal(heartbeatSchema.safeParse({ models: ['qwen2.5:7b'], cpu: null, vram: null }).success, true)
})
test('完整输出和受限计量才能进入结果协议', () => {
  const base = { attemptId: '32c063c7-edc2-4f54-a128-fcd38f6cde73', fence: 1, model: 'qwen2.5:7b', outcome: 'completed' }
  assert.equal(resultSchema.safeParse(base).success, false)
  assert.equal(resultSchema.safeParse({ ...base, output: 'done', usage: null }).success, true)
  assert.equal(resultSchema.safeParse({ ...base, output: 'x'.repeat(32001) }).success, false)
  assert.equal(resultSchema.safeParse({ ...base, output: 'done', usage: { inputTokens: -1, outputTokens: 1 } }).success, false)
})
test('本机推理目标拒绝云端、私网扩散、元数据和凭据 URL', () => {
  for (const url of ['http://169.254.169.254/', 'http://192.168.1.1/', 'https://example.com/', 'http://user:pass@127.0.0.1/', 'http://127.0.0.1/?redirect=x']) assert.throws(() => localServiceUrl(url))
  assert.equal(localServiceUrl('http://127.0.0.1:8000/v1/'), 'http://127.0.0.1:8000/v1')
})
test('平台需要 HTTPS，除非是回环测试', () => {
  assert.throws(() => platformUrl('http://example.com'))
  assert.throws(() => platformUrl('https://example.com/path'))
  assert.equal(platformUrl('https://example.com'), 'https://example.com')
})
