import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addStr, subStr, multiplyStr, gte, formatDisplay, toUnits, fromUnits } from '../lib/venus/money.ts'

test('字符串金额精确往返，不引入浮点误差', () => {
  assert.equal(fromUnits(toUnits('100.0000')), '100.0000')
  assert.equal(fromUnits(toUnits('0.0200')), '0.0200')
  assert.equal(fromUnits(toUnits('0.1')), '0.1000')
})

test('加减法在易触发浮点误差的数值上仍然精确', () => {
  // 0.1 + 0.2 === 0.30000000000000004 in float; must stay exact here.
  assert.equal(addStr('0.1000', '0.2000'), '0.3000')
  assert.equal(subStr('100.0000', '0.0200'), '99.9800')
  assert.equal(subStr('0.3000', '0.1000'), '0.2000')
})

test('单价乘以整数条目数不使用浮点', () => {
  assert.equal(multiplyStr('0.0200', 3), '0.0600')
  assert.equal(multiplyStr('0.0200', 1000), '20.0000')
  assert.equal(multiplyStr('0.0200', 0), '0.0000')
})

test('乘法拒绝非整数或负数条目数', () => {
  assert.throws(() => multiplyStr('0.0200', 1.5))
  assert.throws(() => multiplyStr('0.0200', -1))
})

test('gte 正确比较预算是否充足', () => {
  assert.equal(gte('100.0000', '20.0000'), true)
  assert.equal(gte('20.0000', '20.0000'), true)
  assert.equal(gte('19.9999', '20.0000'), false)
})

test('展示格式在保持精度的同时裁剪多余零', () => {
  assert.equal(formatDisplay('100.0000'), '100.00')
  assert.equal(formatDisplay('0.0200'), '0.02')
  assert.equal(formatDisplay('0.0001'), '0.0001')
})

test('非法金额字符串被拒绝', () => {
  assert.throws(() => toUnits('abc'))
  assert.throws(() => toUnits(''))
})
