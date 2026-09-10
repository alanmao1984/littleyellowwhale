import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareTaskDraft } from '../lib/venus/task-draft.ts'

const input = { instruction: '请提取每条记录的关键词', content: '第一条记录', concurrency: 2 }

function expectError(overrides, error) {
  assert.deepEqual(prepareTaskDraft({ ...input, ...overrides }), { ok: false, error })
}

test('按行拆分，兼容换行符并忽略空白行', () => {
  const result = prepareTaskDraft({ ...input, content: ' 第一条记录 \r\n\r\n 第二条记录 \n\t\n第三条记录 ' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.draft.items, [
    { index: 0, text: '第一条记录' },
    { index: 1, text: '第二条记录' },
    { index: 2, text: '第三条记录' },
  ])
})

test('接受最多 1,000 条记录', () => {
  const result = prepareTaskDraft({ ...input, content: Array(1000).fill('记录').join('\n') })
  assert.equal(result.ok, true)
  assert.equal(result.draft.items.length, 1000)
})

test('拒绝超过 1,000 条记录', () => {
  expectError({ content: Array(1001).fill('记录').join('\n') }, 'too_many_records')
})

test('接受单条记录 10,000 字符，拒绝超限记录', () => {
  assert.equal(prepareTaskDraft({ ...input, content: '文'.repeat(10000) }).ok, true)
  expectError({ content: '文'.repeat(10001) }, 'record_too_long')
})

test('接受总计 100,000 字符，拒绝超限文本', () => {
  const atLimit = Array(10).fill('文'.repeat(9999)).join('\n') + '文'
  assert.equal(atLimit.length, 100000)
  assert.equal(prepareTaskDraft({ ...input, content: atLimit }).ok, true)
  expectError({ content: atLimit + '文' }, 'invalid_input')
})

test('拒绝空指令、空文本和超长指令', () => {
  for (const instruction of ['', ' \n\t ', '文'.repeat(2001)]) {
    expectError({ instruction }, 'invalid_input')
  }
  for (const content of ['', ' \n\r\n\t ']) {
    expectError({ content }, 'invalid_input')
  }
})

test('并行数只接受 1–8 的整数，不接受字符串或非有限值', () => {
  for (const concurrency of [1, 8]) {
    assert.equal(prepareTaskDraft({ ...input, concurrency }).ok, true)
  }
  for (const concurrency of [0, -1, 9, 1.5, NaN, Infinity, '2', null]) {
    expectError({ concurrency }, 'invalid_input')
  }
})

test('草稿始终保持未提交且未授权，不包含报价或执行服务', () => {
  const result = prepareTaskDraft(input)
  assert.equal(result.ok, true)
  const exported = JSON.parse(JSON.stringify(result.draft))
  assert.equal(exported.schemaVersion, 1)
  assert.equal(exported.status, 'unsubmitted_draft')
  assert.equal(exported.authorized, false)
  assert.equal(exported.executionProvider, null)
  assert.equal(exported.quote, null)
})
