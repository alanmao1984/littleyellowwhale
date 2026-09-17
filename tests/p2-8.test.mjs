import test from 'node:test'
import assert from 'node:assert/strict'
import { decideDispatch } from '../lib/venus/dispatch/reason.ts'
import { MAX_SKILL_PACKAGE_BYTES, validateSkillPackage } from '../lib/venus/skill-package.ts'
import { batchClaimResultSchema, readPolicy } from '../packages/node-protocol/index.ts'

const facts = {
  taskStatus: 'queued', consented: true, nodeStatus: 'enrolled', heartbeatFresh: true,
  policy: { ...readPolicy(null), enabled: true, allowedModels: ['qwen'], allowedCapabilities: ['text:infer'], start: '00:00', end: '00:00' },
  model: 'qwen', reportedModels: ['qwen'], taskType: 'text', operation: 'infer', reportedCapabilities: ['text:infer'],
  nodeActive: 0, nodeLimit: 1, taskActive: 0, taskLimit: 1,
}

test('接单准入返回稳定原因枚举与退避提示', () => {
  assert.deepEqual(decideDispatch(facts), { accepted: true, reason: 'accepted', retryAfterMs: 0 })
  assert.equal(decideDispatch({ ...facts, consented: false }).reason, 'consent_required')
  assert.equal(decideDispatch({ ...facts, nodeActive: 1 }).reason, 'node_capacity_reached')
  assert.equal(decideDispatch({ ...facts, reportedModels: [] }).reason, 'model_not_reported')
})

test('批量领取信封限制批次并携带退避信息', () => {
  assert.equal(batchClaimResultSchema.safeParse({ assignments: [], reason: 'no_matching_task', retryAfterMs: 3000 }).success, true)
  assert.equal(batchClaimResultSchema.safeParse({ assignments: new Array(33).fill({}), reason: 'accepted', retryAfterMs: 0 }).success, false)
})

test('skill 包拒绝穿越、重复路径和超过 8MiB 的清单', () => {
  assert.equal(validateSkillPackage({ entries: [{ path: '../secret', size: 1 }] }).reason, 'unsafe_path')
  assert.equal(validateSkillPackage({ entries: [{ path: 'skill.ts', size: 1 }, { path: 'skill.ts', size: 1 }] }).reason, 'duplicate_path')
  assert.equal(validateSkillPackage({ entries: [{ path: 'models/data.bin', size: MAX_SKILL_PACKAGE_BYTES + 1 }] }).ok, false)
  assert.deepEqual(validateSkillPackage({ entries: [{ path: 'src/skill.ts', size: 128 }] }), { ok: true, totalBytes: 128, fileCount: 1 })
})
