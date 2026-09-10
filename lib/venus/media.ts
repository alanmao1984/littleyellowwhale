import { z } from 'zod'
import {
  imageShotItemSchema,
  mediaSpecSchema,
  operationSchema,
  taskTypeSchema,
  videoSegmentItemSchema,
  videoTranscodeItemSchema,
} from '../../packages/node-protocol/index.ts'

export { imageShotItemSchema, mediaSpecSchema, operationSchema, taskTypeSchema, videoSegmentItemSchema, videoTranscodeItemSchema }
export type { MediaSpec } from '../../packages/node-protocol/index.ts'

export type MediaItem = z.infer<typeof videoSegmentItemSchema> | z.infer<typeof videoTranscodeItemSchema> | z.infer<typeof imageShotItemSchema>

export function parseMediaLine(line: string, taskType: 'video' | 'image', operation: 'segment' | 'transcode' | 'multi_shot') {
  let value: unknown
  try { value = JSON.parse(line) } catch { return { ok: false as const, error: 'media_line_json' as const } }
  const parsed = taskType === 'image'
    ? imageShotItemSchema.safeParse(value)
    : operation === 'segment' ? videoSegmentItemSchema.safeParse(value) : videoTranscodeItemSchema.safeParse(value)
  return parsed.success ? { ok: true as const, value: parsed.data } : { ok: false as const, error: 'media_line_invalid' as const }
}

export function billingUnitsFor(value: MediaItem, taskType: 'video' | 'image') {
  if (taskType === 'image') {
    const shot = value as z.infer<typeof imageShotItemSchema>
    return Math.max(1, Math.ceil((shot.width * shot.height) / (512 * 512)))
  }
  const video = value as z.infer<typeof videoSegmentItemSchema> | z.infer<typeof videoTranscodeItemSchema>
  return 'durationSeconds' in video ? Math.max(1, Math.ceil(video.durationSeconds / 10)) : 1
}
