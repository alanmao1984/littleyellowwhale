import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPublicPlatformSummary, calculateGatewayAvailability, unavailablePublicPlatformSummary } from '../lib/venus/public-summary-core.ts'
import { safeDashboardReturnTo } from '../lib/venus/safe-return-to.ts'

test('公开汇总只投影聚合值并正确计算可用率', () => {
  const summary = buildPublicPlatformSummary({ todayTokens: 1504.9, completedRequests: 9997, totalRequests: 10000, activePublicNodes: 32, settledCalls: 80, measuredAt: new Date('2026-09-14T00:00:00.000Z') })
  assert.deepEqual(Object.keys(summary).sort(), ['activePublicNodes', 'gatewayAvailability', 'measuredAt', 'settledCalls', 'state', 'todayTokens'].sort())
  assert.equal(summary.gatewayAvailability, 99.97)
  assert.equal(summary.todayTokens, 1504)
  assert.equal('userId' in summary, false)
  assert.equal('nodeId' in summary, false)
})

test('没有真实请求时不伪造可用率', () => {
  assert.equal(calculateGatewayAvailability(0, 0), null)
  assert.equal(unavailablePublicPlatformSummary(new Date('2026-09-14T00:00:00.000Z')).state, 'unavailable')
})

test('登录返回地址只允许控制台内部路径', () => {
  assert.equal(safeDashboardReturnTo('/app/nodes'), '/app/nodes')
  assert.equal(safeDashboardReturnTo('/app'), '/app')
  assert.equal(safeDashboardReturnTo('https://attacker.example'), '/app')
  assert.equal(safeDashboardReturnTo('//attacker.example/app'), '/app')
  assert.equal(safeDashboardReturnTo('/tasks'), '/app')
})
