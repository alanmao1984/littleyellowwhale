import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampLimit,
  composeMarketFeed,
  isDemoTransitionAllowed,
  opaqueId,
  parseDemoEventInput,
  toDemoFeedItem,
  toRealFeedItem,
  MARKET_ACTIVITY_LIMIT,
} from '../lib/venus/market-activity-core.ts'
import { canOrganization } from '../lib/venus/authorization.ts'

const ALLOWED_REAL_KEYS = ['id', 'source', 'eventType', 'model', 'inputTokens', 'outputTokens', 'settledAmount', 'latencyMs', 'currency', 'occurredAt'].sort()
const FORBIDDEN_KEYS = ['userId', 'email', 'prompt', 'output', 'apiTokenId', 'nodeId', 'offeringId', 'providerUserId', 'organizationId']

function realItem(id, occurredAt) {
  return toRealFeedItem({ id, model: 'whale-qwen-7b', settledAmount: '0.1200', latencyMs: 800, completedAt: new Date(occurredAt), inputTokens: 100, outputTokens: 50 })
}
function demoItem(id, occurredAt) {
  return toDemoFeedItem({ id, model: 'demo-model', settledAmount: '0.0500', latencyMs: null, occurredAt: new Date(occurredAt), inputTokens: 10, outputTokens: 5, titleZh: '演示', titleEn: 'Demo', summaryZh: '演示摘要', summaryEn: 'Demo summary' })
}

function validDemoInput(overrides = {}) {
  return { titleZh: '真实节点补全', titleEn: 'Node completion', summaryZh: '一次跨用户撮合', summaryEn: 'A cross-user match', model: 'whale-qwen-7b', inputTokens: 120, outputTokens: 64, settledAmount: '0.1200', latencyMs: 900, occurredAt: new Date().toISOString(), ...overrides }
}

test('clampLimit 限定分页边界在 1..MAX 之间', () => {
  assert.equal(clampLimit(Number.NaN), MARKET_ACTIVITY_LIMIT)
  assert.equal(clampLimit(0), 1)
  assert.equal(clampLimit(-5), 1)
  assert.equal(clampLimit(5.9), 5)
  assert.equal(clampLimit(1000), MARKET_ACTIVITY_LIMIT)
  assert.equal(clampLimit(20), 20)
})

test('真实记录优先占满名额时不补任何演示记录', () => {
  const real = [realItem('r1', '2026-01-03T00:00:00.000Z'), realItem('r2', '2026-01-02T00:00:00.000Z'), realItem('r3', '2026-01-01T00:00:00.000Z')]
  const demo = [demoItem('d1', '2026-06-01T00:00:00.000Z')]
  const feed = composeMarketFeed(real, demo, 3)
  assert.equal(feed.realCount, 3)
  assert.equal(feed.demoCount, 0)
  assert.ok(feed.items.every(item => item.source === 'real'))
})

test('真实记录不足时演示记录仅补足剩余名额', () => {
  const real = [realItem('r1', '2026-01-03T00:00:00.000Z')]
  const demo = [demoItem('d1', '2026-01-05T00:00:00.000Z'), demoItem('d2', '2026-01-04T00:00:00.000Z'), demoItem('d3', '2026-01-02T00:00:00.000Z')]
  const feed = composeMarketFeed(real, demo, 3)
  assert.equal(feed.realCount, 1)
  assert.equal(feed.demoCount, 2)
  assert.equal(feed.items.length, 3)
})

test('无真实数据时全部由已发布演示记录补足到上限', () => {
  const demo = Array.from({ length: 60 }, (_, i) => demoItem(`d${i}`, new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString()))
  const feed = composeMarketFeed([], demo, MARKET_ACTIVITY_LIMIT)
  assert.equal(feed.realCount, 0)
  assert.equal(feed.demoCount, MARKET_ACTIVITY_LIMIT)
})

test('真实与演示混合后按发生时间统一倒序排列', () => {
  const real = [realItem('r1', '2026-01-02T00:00:00.000Z')]
  const demo = [demoItem('d1', '2026-01-05T00:00:00.000Z'), demoItem('d2', '2026-01-01T00:00:00.000Z')]
  const feed = composeMarketFeed(real, demo, 5)
  const times = feed.items.map(item => item.occurredAt)
  assert.deepEqual(times, [...times].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)))
  assert.equal(feed.items[0].id, demo[0].id) // 2026-01-05 demo is newest
})

test('演示记录带来源标记与双语标题，真实记录不携带任何用户文案', () => {
  const demo = demoItem('d1', '2026-01-01T00:00:00.000Z')
  assert.equal(demo.source, 'demo')
  assert.equal(demo.titleZh, '演示')
  assert.equal(demo.titleEn, 'Demo')
  const real = realItem('r1', '2026-01-01T00:00:00.000Z')
  assert.equal(real.source, 'real')
  assert.equal(real.titleZh, undefined)
  assert.equal(real.summaryZh, undefined)
})

test('真实记录投影只暴露白名单字段，绝不泄露敏感字段', () => {
  // Pass a row carrying extra sensitive fields; the mapper must drop them all.
  const row = { id: 'req-1', model: 'm', settledAmount: '0.1', latencyMs: 10, completedAt: new Date('2026-01-01T00:00:00.000Z'), inputTokens: 1, outputTokens: 1, userId: 'u', email: 'a@b.c', prompt: 'secret', output: 'secret', apiTokenId: 'tok', nodeId: 'n', offeringId: 'o' }
  const item = toRealFeedItem(row)
  assert.deepEqual(Object.keys(item).sort(), ALLOWED_REAL_KEYS)
  for (const key of FORBIDDEN_KEYS) assert.equal(key in item, false)
  // The opaque id must not embed the raw internal id.
  assert.ok(!item.id.includes('req-1'))
})

test('opaqueId 稳定、带来源前缀且不含原始 id', () => {
  assert.equal(opaqueId('real', 'abc'), opaqueId('real', 'abc'))
  assert.notEqual(opaqueId('real', 'abc'), opaqueId('demo', 'abc'))
  assert.ok(opaqueId('demo', 'abc').startsWith('demo_'))
  assert.ok(!opaqueId('real', 'abc').includes('abc'))
})

test('演示状态转换规则：发布来自草稿或已撤下，撤下仅来自已发布', () => {
  assert.equal(isDemoTransitionAllowed('draft', 'published'), true)
  assert.equal(isDemoTransitionAllowed('withdrawn', 'published'), true)
  assert.equal(isDemoTransitionAllowed('published', 'published'), false)
  assert.equal(isDemoTransitionAllowed('published', 'withdrawn'), true)
  assert.equal(isDemoTransitionAllowed('draft', 'withdrawn'), false)
  assert.equal(isDemoTransitionAllowed('withdrawn', 'withdrawn'), false)
})

test('演示输入校验接受合法值', () => {
  assert.equal(parseDemoEventInput(validDemoInput()).success, true)
})

test('演示输入校验拒绝越界、非法与伪装为实时/久远的时间', () => {
  assert.equal(parseDemoEventInput(validDemoInput({ titleZh: 'x' })).success, false) // too short
  assert.equal(parseDemoEventInput(validDemoInput({ summaryEn: 'a'.repeat(400) })).success, false) // too long
  assert.equal(parseDemoEventInput(validDemoInput({ settledAmount: '-1' })).success, false)
  assert.equal(parseDemoEventInput(validDemoInput({ settledAmount: 'abc' })).success, false)
  assert.equal(parseDemoEventInput(validDemoInput({ inputTokens: 1.5 })).success, false)
  assert.equal(parseDemoEventInput({ ...validDemoInput(), extra: 'nope' }).success, false) // strict
  assert.equal(parseDemoEventInput(validDemoInput({ occurredAt: new Date(Date.now() + 3600_000).toISOString() })).success, false) // future
  assert.equal(parseDemoEventInput(validDemoInput({ occurredAt: new Date(Date.now() - 400 * 24 * 3600_000).toISOString() })).success, false) // too old
})

test('任何组织角色都无法获得平台级动作，权限完全隔离', () => {
  // Organization roles only ever grant organization-scoped actions; there is no
  // platform action in the org action set, so an org member cannot escalate.
  for (const role of ['owner', 'admin', 'operator', 'member']) {
    assert.equal(canOrganization(role, 'platform_admin'), false)
    assert.equal(canOrganization(role, 'manage_platform'), false)
  }
  assert.equal(canOrganization('owner', 'manage_structure'), true)
  assert.equal(canOrganization('member', 'read'), true)
})
