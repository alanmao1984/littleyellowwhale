import { z } from 'zod'
import { billingUnitsFor, mediaSpecSchema, operationSchema, parseMediaLine, taskTypeSchema, type MediaSpec } from './media.ts'

export const taskDraftSchema = z.object({
  instruction: z.string().trim().min(1).max(2000),
  content: z.string().trim().min(1).max(100000),
  concurrency: z.number().int().min(1).max(8),
  taskType: taskTypeSchema.default('text'),
  operation: operationSchema.default('infer'),
  mediaSpec: z.unknown().optional(),
})
export type DraftInput = z.input<typeof taskDraftSchema>

export type PreparedTaskItem = { index: number; text: string; billingUnits?: number }
export type PreparedTaskDraft = {
  schemaVersion: 2
  status: 'unsubmitted_draft'
  instruction: string
  concurrency: number
  taskType: 'text' | 'video' | 'image'
  operation: 'infer' | 'segment' | 'transcode' | 'multi_shot'
  mediaSpec: MediaSpec
  items: PreparedTaskItem[]
  executionProvider: null
  quote: null
  authorized: false
}

export function prepareTaskDraft(input: DraftInput) {
  const parsed = taskDraftSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'invalid_input' as const }
  const { instruction, concurrency, taskType, operation } = parsed.data
  const lines = parsed.data.content.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (lines.length > 1000) return { ok: false as const, error: 'too_many_records' as const }
  if (lines.some(line => line.length > 10000)) return { ok: false as const, error: 'record_too_long' as const }

  let mediaSpec: MediaSpec
  if (taskType === 'text') {
    if (operation !== 'infer') return { ok: false as const, error: 'invalid_media_spec' as const }
    mediaSpec = { taskType: 'text', operation: 'infer' }
  } else if (taskType === 'video') {
    if (!['segment', 'transcode'].includes(operation)) return { ok: false as const, error: 'invalid_media_spec' as const }
    const candidate = parsed.data.mediaSpec ?? { taskType: 'video', operation }
    const checked = mediaSpecSchema.safeParse(candidate)
    if (!checked.success || checked.data.taskType !== 'video' || checked.data.operation !== operation) return { ok: false as const, error: 'invalid_media_spec' as const }
    mediaSpec = checked.data
  } else {
    if (operation !== 'multi_shot') return { ok: false as const, error: 'invalid_media_spec' as const }
    const checked = mediaSpecSchema.safeParse(parsed.data.mediaSpec)
    if (!checked.success || checked.data.taskType !== 'image') return { ok: false as const, error: 'invalid_media_spec' as const }
    mediaSpec = checked.data
  }

  const items: PreparedTaskItem[] = []
  for (const [index, text] of lines.entries()) {
    if (taskType === 'text') {
      items.push({ index, text })
      continue
    }
    const parsedLine = parseMediaLine(text, taskType, operation as 'segment' | 'transcode' | 'multi_shot')
    if (!parsedLine.ok) return { ok: false as const, error: parsedLine.error }
    items.push({ index, text, billingUnits: billingUnitsFor(parsedLine.value, taskType) })
  }
  return { ok: true as const, draft: {
    schemaVersion: 1, status: 'unsubmitted_draft' as const, instruction, concurrency,
    taskType, operation, mediaSpec, items, executionProvider: null, quote: null, authorized: false,
  } }
}
