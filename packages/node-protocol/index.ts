import { z } from 'zod'

export const LEASE_MS = 90_000
export const MAX_ATTEMPT_MS = 30 * 60_000
export const modelSchema = z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/)
export const taskTypeSchema = z.enum(['text', 'video', 'image'])
export const operationSchema = z.enum(['infer', 'segment', 'transcode', 'multi_shot'])
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const localPathSchema = z.string().trim().min(1).max(4096).refine(value => !value.includes('\0'))

export const resourcePolicySchema = z.object({
  enabled: z.boolean(),
  allowedModels: z.array(modelSchema).max(32).transform(models => [...new Set(models)]),
  maxConcurrency: z.number().int().min(1).max(8),
  timeZone: z.string().max(80).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true } catch { return false }
  }),
  start: timeSchema,
  end: timeSchema,
}).strict().refine(p => !p.enabled || p.allowedModels.length > 0)
export type ResourcePolicy = z.infer<typeof resourcePolicySchema>
export const DEFAULT_POLICY: ResourcePolicy = {
  enabled: false, allowedModels: [], maxConcurrency: 1, timeZone: 'Asia/Shanghai', start: '00:00', end: '00:00',
}
export function readPolicy(value: unknown): ResourcePolicy {
  const result = resourcePolicySchema.safeParse(value)
  return result.success ? result.data : { ...DEFAULT_POLICY, allowedModels: [] }
}
export function withinSchedule(policy: ResourcePolicy, now = new Date()): boolean {
  if (!policy.enabled) return false
  if (policy.start === policy.end) return true
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: policy.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const current = `${parts.find(p => p.type === 'hour')!.value}:${parts.find(p => p.type === 'minute')!.value}`
  return policy.start < policy.end ? current >= policy.start && current < policy.end : current >= policy.start || current < policy.end
}
export function canExecute(policy: ResourcePolicy, model: string, now = new Date()): boolean {
  return policy.allowedModels.includes(model) && withinSchedule(policy, now)
}
export const heartbeatSchema = z.object({
  cpu: z.number().min(0).max(100).nullable().optional(),
  vram: z.number().int().min(0).max(10_000_000).nullable().optional(),
  models: z.array(modelSchema).max(32).nullable().optional(),
}).strict()
export const claimSchema = z.object({ requestId: z.string().uuid() }).strict()
export const leaseSchema = z.object({ attemptId: z.string().uuid(), fence: z.number().int().positive() }).strict()

export const mediaSpecSchema = z.discriminatedUnion('taskType', [
  z.object({ taskType: z.literal('text'), operation: z.literal('infer') }).strict(),
  z.object({ taskType: z.literal('video'), operation: z.enum(['segment', 'transcode']), ffmpegPath: z.string().trim().min(1).max(300).optional() }).strict(),
  z.object({ taskType: z.literal('image'), operation: z.literal('multi_shot'), comfyWorkflow: z.record(z.string(), z.unknown()), timeoutSeconds: z.number().int().min(30).max(1800).default(900) }).strict(),
])
export type MediaSpec = z.infer<typeof mediaSpecSchema>

export const videoSegmentItemSchema = z.object({
  inputPath: localPathSchema, outputPath: localPathSchema,
  startSeconds: z.number().finite().min(0).max(86400), durationSeconds: z.number().finite().positive().max(86400),
  format: z.enum(['mp4', 'mov', 'webm']).default('mp4'),
}).strict()
export const videoTranscodeItemSchema = z.object({
  inputPath: localPathSchema, outputPath: localPathSchema,
  format: z.enum(['mp4', 'mov', 'webm']).default('mp4'),
  videoCodec: z.enum(['libx264', 'libx265', 'libvpx-vp9', 'copy']).default('libx264'),
  audioCodec: z.enum(['aac', 'opus', 'copy']).default('aac'),
  width: z.number().int().min(16).max(7680).optional(), height: z.number().int().min(16).max(4320).optional(), fps: z.number().finite().min(1).max(240).optional(),
}).strict()
export const imageShotItemSchema = z.object({
  prompt: z.string().trim().min(1).max(8000), negativePrompt: z.string().trim().max(4000).optional(),
  outputDir: localPathSchema, fileName: z.string().trim().min(1).max(180).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/).optional(),
  seed: z.number().int().min(0).max(2147483647).optional(), width: z.number().int().min(256).max(2048).default(1024), height: z.number().int().min(256).max(2048).default(1024),
}).strict()

export const resultSchema = leaseSchema.extend({
  outcome: z.enum(['completed', 'uncertain']), model: modelSchema,
  output: z.string().max(32000).optional(),
  resultMeta: z.record(z.string(), z.unknown()).optional(),
  usage: z.object({ inputTokens: z.number().int().min(0).max(10_000_000), outputTokens: z.number().int().min(0).max(8192) }).strict().nullable().optional(),
  errorCode: z.enum(['inference_error', 'cancel_requested', 'policy_changed', 'lease_lost', 'shutdown', 'media_error']).optional(),
}).strict().refine(value => value.outcome !== 'completed' || (typeof value.output === 'string' && value.output.trim().length > 0))
export type ResultInput = z.infer<typeof resultSchema>
export type NodePrincipal = { userId: string; nodeId: string }
export const assignmentSchema = z.object({
  attemptId: z.string().uuid(), fence: z.number().int().positive(), taskId: z.string().uuid(),
  taskType: taskTypeSchema, operation: operationSchema, mediaSpec: mediaSpecSchema, billingUnits: z.number().int().positive().max(10000),
  model: modelSchema, instruction: z.string().max(2000), input: z.string().max(10000),
  maxOutputTokens: z.number().int().min(1).max(1024), leaseExpiresAt: z.string().datetime(),
}).strict()
export type Assignment = z.infer<typeof assignmentSchema>
