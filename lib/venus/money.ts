// Test-ledger money helper. All amounts are numeric(18,4) stored and moved as
// strings; internally we compute in integer ten-thousandths with BigInt so no
// JavaScript floating point ever touches a balance.
const SCALE = BigInt(10000)

export const CURRENCY = 'VTEST'
// Fixed test prices. A quote fixes these at creation time.
export const UNIT_PRICE = '0.0200' // test cost deducted per text record
export const INITIAL_GRANT = '100.0000' // one-time test allowance per account

export function toUnits(value: string): bigint {
  const trimmed = value.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) throw new Error(`invalid amount: ${value}`)
  const negative = trimmed.startsWith('-')
  const [whole, frac = ''] = trimmed.replace('-', '').split('.')
  const fracPadded = (frac + '0000').slice(0, 4)
  const units = BigInt(whole) * SCALE + BigInt(fracPadded)
  return negative ? -units : units
}

export function fromUnits(units: bigint): string {
  const negative = units < BigInt(0)
  const abs = negative ? -units : units
  const whole = abs / SCALE
  const frac = (abs % SCALE).toString().padStart(4, '0')
  return `${negative ? '-' : ''}${whole}.${frac}`
}

export function addStr(a: string, b: string): string {
  return fromUnits(toUnits(a) + toUnits(b))
}

export function subStr(a: string, b: string): string {
  return fromUnits(toUnits(a) - toUnits(b))
}

// Multiply a per-unit price by an integer count without float math.
export function multiplyStr(amount: string, count: number): string {
  if (!Number.isInteger(count) || count < 0) throw new Error(`invalid count: ${count}`)
  return fromUnits(toUnits(amount) * BigInt(count))
}

export function gte(a: string, b: string): boolean {
  return toUnits(a) >= toUnits(b)
}

export function percentageStr(amount: string, percentage: number): string {
  if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) throw new Error(`invalid percentage: ${percentage}`)
  return fromUnits(toUnits(amount) * BigInt(percentage) / BigInt(100))
}

// Compact display, trimming trailing zeros beyond 2 decimals for readability.
export function formatDisplay(value: string): string {
  const units = toUnits(value)
  const base = fromUnits(units)
  const [whole, frac] = base.split('.')
  const trimmed = frac.replace(/0+$/, '')
  const dp = trimmed.length <= 2 ? frac.slice(0, 2) : trimmed
  return `${whole}.${dp}`
}
