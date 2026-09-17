import test from 'node:test'
import assert from 'node:assert/strict'
import { verify } from 'node:crypto'
import { classifyHardware } from '../packages/venus-node/src/hardware.ts'
import { recommendModel } from '../packages/venus-node/src/model-manager.ts'
import { createAttestationIdentity } from '../packages/venus-node/src/attestation.ts'

const GiB = 1024 ** 3
test('硬件分层覆盖低配、Arc、统一内存与 NVIDIA Ultra', () => {
  assert.equal(classifyHardware(6 * GiB, null, 'x64'), 'T0')
  assert.equal(classifyHardware(16 * GiB, { vendor: 'intel', model: 'Intel Arc A770', vramMiB: 16384 }), 'ARC')
  assert.equal(classifyHardware(64 * GiB, { vendor: 'apple', model: 'Apple M4 Max', vramMiB: null }, 'arm64'), 'SH_COMPACT')
  assert.equal(classifyHardware(128 * GiB, { vendor: 'nvidia', model: 'NVIDIA GB10', vramMiB: 131072 }), 'NV_ULTRA')
})

test('每个档位返回固定 URL、模型与 SHA-256', () => {
  for (const tier of ['T0', 'T1', 'T2', 'T3', 'T4', 'ARC', 'ARC_LITE', 'SH_COMPACT', 'SH_LARGE', 'NV_ULTRA']) {
    const model = recommendModel(tier)
    assert.match(model.url, /^https:\/\/huggingface\.co\/unsloth\//)
    assert.match(model.sha256, /^[a-f0-9]{64}$/)
    assert.ok(model.context >= 8192)
  }
})

test('节点用 Ed25519 签署绑定输入、输出和用量的事件哈希', () => {
  const identity = createAttestationIdentity()
  const receipt = identity.signResult({ attemptId: 'attempt', fence: 2, model: 'qwen', input: 'input', output: 'output', usage: { inputTokens: 3, outputTokens: 4 } })
  assert.match(receipt.eventHash, /^[a-f0-9]{64}$/)
  assert.equal(verify(null, Buffer.from(receipt.eventHash, 'hex'), identity.publicKey, Buffer.from(receipt.signature, 'base64')), true)
  assert.notEqual(receipt.inputHash, receipt.outputHash)
})
