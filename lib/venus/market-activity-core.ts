import { createHash } from 'node:crypto'
import { z } from 'zod'

// Pure, database-free core of the market-activity feature: projection, real-first
// backfill, ordering, status-transition rules, and input validation. Keeping it
// free of '@/lib/db' lets the plain node unit-test runner import it directly.

export const MARKET_ACTIVITY_LIMIT = 40

export const MARKET_DISCLOSURE = {
  zh: '真实结算记录优先展示；演示内容仅用于补足空位，不参与结算、钱包、任务或供给统计。',
  en: 'Real settlements are shown first; demo entries only backfill empty slots and never affect settlement, wallets, tasks, or provider stats.',
} as const

export type MarketActivitySource = 'real' | 'demo'

export type MarketActivityItem = {
  id: string
  source: MarketActivitySource
  eventType: 'text_completion'
  model: string
  inputTokens: number
  outputTokens: number
  settledAmount: string
  latencyMs: number | null
  currency: 'VTEST'
  occurredAt: string
  titleZh?: string
  titleEn?: string
  summaryZh?: string
  summaryEn?: string
}

export type MarketActivityFeed = {
  items: MarketActivityItem[]
  realCount: number
  demoCount: number
  limit: number
  disclosure: typeof MARKET_DISCLOSURE
}

// Opaque, stable public id derived from an internal id. Prevents leaking or
// enumerating real apiRequest UUIDs while keeping React keys stable.
export function opaqueId(prefix: MarketActivitySource, raw: string): string {
  return `${prefix}_${createHash('sha256').update(`${prefix}:${raw}`).digest('hex').slice(0, 24)}`
}

export function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return MARKET_ACTIVITY_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), MARKET_ACTIVITY_LIMIT)
}

// Public-safe projection of a real, settled API request. Deliberately omits
// userId, email, prompt, output, api token, offering/node identity, and every
// internal ledger field — only these keys ever cross the boundary.
export type RealActivityRow = { id: string; model: string; settledAmount: string; latencyMs: number | null; completedAt: Date; inputTokens: number | null; outputTokens: number | null }
export function toRealFeedItem(row: RealActivityRow): MarketActivityItem {
  return {
    id: opaqueId('real', row.id),
    source: 'real',
    eventType: 'text_completion',
    model: row.model,
    inputTokens: row.inputTokens ?? 0,
    outputTokens: row.outputTokens ?? 0,
    settledAmount: row.settledAmount,
    latencyMs: row.latencyMs ?? null,
    currency: 'VTEST',
    occurredAt: row.completedAt.toISOString(),
  }
}

export type DemoActivityRow = { id: string; model: string; settledAmount: string; latencyMs: number | null; occurredAt: Date; inputTokens: number; outputTokens: number; titleZh: string; titleEn: string; summaryZh: string; summaryEn: string }
export function toDemoFeedItem(row: DemoActivityRow): MarketActivityItem {
  return {
    id: opaqueId('demo', row.id),
    source: 'demo',
    eventType: 'text_completion',
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    settledAmount: row.settledAmount,
    latencyMs: row.latencyMs ?? null,
    currency: 'VTEST',
    occurredAt: row.occurredAt.toISOString(),
    titleZh: row.titleZh,
    titleEn: row.titleEn,
    summaryZh: row.summaryZh,
    summaryEn: row.summaryEn,
  }
}

// Real-first, then backfill. Real items fill up to `cap`; demo items take only
// the leftover slots; the merged list is sorted newest-first. ISO 8601 strings
// compare correctly as plain strings, with id as a stable tiebreaker.
export function composeMarketFeed(real: MarketActivityItem[], demo: MarketActivityItem[], cap: number): { items: MarketActivityItem[]; realCount: number; demoCount: number } {
  const safeCap = clampLimit(cap)
  const cappedReal = real.slice(0, safeCap)
  const remaining = Math.max(0, safeCap - cappedReal.length)
  const cappedDemo = demo.slice(0, remaining)
  const items = [...cappedReal, ...cappedDemo].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : a.id < b.id ? 1 : -1))
  return { items, realCount: cappedReal.length, demoCount: cappedDemo.length }
}

export const demoStatusValues = ['draft', 'published', 'withdrawn'] as const
export type DemoStatus = (typeof demoStatusValues)[number]

// Allowed status transitions. Publishing is possible from draft or a withdrawn
// entry; a live entry can only be withdrawn.
const demoTransitions: Record<Extract<DemoStatus, 'published' | 'withdrawn'>, readonly DemoStatus[]> = {
  published: ['draft', 'withdrawn'],
  withdrawn: ['published'],
}
export function isDemoTransitionAllowed(from: DemoStatus, to: Extract<DemoStatus, 'published' | 'withdrawn'>): boolean {
  return demoTransitions[to].includes(from)
}

// Bounded, public-safe fields only. No transaction IDs, user identities, or node
// identities can be supplied.
export const demoEventSchema = z
  .object({
    titleZh: z.string().trim().min(2).max(60),
    titleEn: z.string().trim().min(2).max(80),
    summaryZh: z.string().trim().min(2).max(240),
    summaryEn: z.string().trim().min(2).max(320),
    model: z.string().trim().min(1).max(120),
    inputTokens: z.number().int().min(0).max(2_000_000),
    outputTokens: z.number().int().min(0).max(2_000_000),
    settledAmount: z.string().regex(/^\d{1,8}(?:\.\d{1,4})?$/),
    latencyMs: z.number().int().min(0).max(600_000).nullable().default(null),
    occurredAt: z.string().datetime(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const occurred = new Date(value.occurredAt).getTime()
    const now = Date.now()
    // Reject far-future timestamps (max 5 min clock skew) and anything older than
    // a year so a demo row cannot masquerade as a live or ancient event.
    if (occurred > now + 5 * 60_000) ctx.addIssue({ code: 'custom', path: ['occurredAt'], message: 'occurredAt_in_future' })
    if (occurred < now - 365 * 24 * 60 * 60_000) ctx.addIssue({ code: 'custom', path: ['occurredAt'], message: 'occurredAt_too_old' })
  })

export type DemoEventInput = z.infer<typeof demoEventSchema>
export function parseDemoEventInput(input: unknown) {
  return demoEventSchema.safeParse(input)
}

export function redactDemoSummary(input: DemoEventInput) {
  return { titleZh: input.titleZh, model: input.model, settledAmount: input.settledAmount, occurredAt: input.occurredAt }
}

export type DemoMutationResult =
  | { ok: true; id: string; status: DemoStatus }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'not_found' | 'invalid_transition' }
