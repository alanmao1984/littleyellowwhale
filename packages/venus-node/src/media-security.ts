import { createHash } from 'node:crypto'
import { lstat, realpath, mkdtemp, open, rm } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import { type Assignment, type Capability, type imageShotItemSchema } from '../../node-protocol/index.ts'

export const MAX_MEDIA_BYTES = 50_000_000
export const MAX_MEDIA_FILES = 4
const mapping = z.object({ node: z.string().regex(/^[0-9]+$/), key: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/) }).strict()
export const templateSchema = z.object({
  workflow: z.record(z.string().regex(/^[0-9]+$/), z.object({ class_type: z.string().min(1).max(120), inputs: z.record(z.string(), z.unknown()), _meta: z.record(z.string(), z.unknown()).optional() }).strict()),
  allowedClasses: z.array(z.string().min(1)).min(1).max(64),
  inputs: z.object({ prompt: mapping, negativePrompt: mapping.optional(), seed: mapping, width: mapping, height: mapping }).strict(),
}).strict()
export type ApprovedTemplate = z.infer<typeof templateSchema> & { hash: string }
export type LocalMediaPolicy = { inputRoot: string; outputRoot: string; capabilities: Capability[]; template?: ApprovedTemplate }

export function workflowHash(value: unknown): string {
  const canonical = (input: unknown): unknown => Array.isArray(input) ? input.map(canonical) : input && typeof input === 'object' ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : input
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}
export function approveTemplate(input: unknown): ApprovedTemplate {
  const parsed = templateSchema.parse(input)
  const nodes = Object.values(parsed.workflow)
  if (!nodes.length || nodes.length > 100 || nodes.some(node => !parsed.allowedClasses.includes(node.class_type))) throw new Error('模板含有未批准的节点')
  const targets = new Set<string>()
  for (const [field, target] of Object.entries(parsed.inputs)) {
    const value = parsed.workflow[target.node]?.inputs[target.key]
    if (typeof value !== (field === 'prompt' || field === 'negativePrompt' ? 'string' : 'number')) throw new Error('模板输入映射无效')
    const key = `${target.node}:${target.key}`
    if (targets.has(key)) throw new Error('模板映射不能重复')
    targets.add(key)
  }
  return { ...parsed, hash: workflowHash(parsed.workflow) }
}
export function prepareApprovedPrompt(template: ApprovedTemplate | undefined, work: Assignment, shot: z.infer<typeof imageShotItemSchema>) {
  if (!template || work.mediaSpec.taskType !== 'image' || workflowHash(work.mediaSpec.comfyWorkflow) !== template.hash || workflowHash(template.workflow) !== template.hash) throw new Error('远端工作流未获本地批准')
  const prompt = structuredClone(template.workflow)
  for (const [field, target] of Object.entries(template.inputs)) {
    const value = shot[field as keyof typeof template.inputs]
    if (field === 'negativePrompt') prompt[target.node].inputs[target.key] = value ?? ''
    else if (value !== undefined) prompt[target.node].inputs[target.key] = value
  }
  return prompt
}

export async function approvedRoot(path: string) {
  if (!isAbsolute(path) || path.includes('\0')) throw new Error('授权根目录必须为绝对路径')
  const canonical = await realpath(path)
  const info = await lstat(canonical)
  if (!info.isDirectory()) throw new Error('授权根目录不存在')
  return canonical
}
export async function confinedPath(root: string, path: string, kind: 'file' | 'directory') {
  if (!isAbsolute(path) || path.includes('\0')) throw new Error('需要本机绝对路径')
  const rootPath = await approvedRoot(root)
  if (rootPath !== root) throw new Error('授权根目录已变化')
  const candidate = resolve(path)
  const rel = relative(rootPath, candidate)
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('路径越过本地授权目录')
  const rootInfo = await lstat(rootPath)
  let cursor = rootPath
  for (const part of rel ? rel.split(sep) : []) {
    cursor = join(cursor, part)
    const info = await lstat(cursor)
    if (info.isSymbolicLink() || info.dev !== rootInfo.dev) throw new Error('拒绝符号链接与跨盘路径')
  }
  const info = await lstat(candidate)
  if (kind === 'file' ? !info.isFile() : !info.isDirectory()) throw new Error('文件类型不匹配')
  if (await realpath(candidate) !== candidate) throw new Error('路径已经改变')
  return candidate
}
export async function outputDirectory(policy: LocalMediaPolicy, requested: string, attemptId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) throw new Error('执行标识无效')
  const parent = await confinedPath(policy.outputRoot, requested, 'directory')
  return mkdtemp(join(parent, `venus-${attemptId}-`))
}
export async function videoPaths(policy: LocalMediaPolicy, input: string, output: string, format: string, attemptId: string) {
  const inputPath = await confinedPath(policy.inputRoot, input, 'file')
  if (resolve(input) === resolve(output)) throw new Error('输入输出不能相同')
  if (!isAbsolute(output) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(basename(output)) || extname(output).toLowerCase() !== `.${format}`) throw new Error('输出文件名和格式不匹配')
  await confinedPath(policy.outputRoot, dirname(output), 'directory')
  try { await lstat(output); throw new Error('不能覆盖已有输出') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const extension = extname(inputPath).toLowerCase()
  if (!['.mp4', '.mov', '.webm'].includes(extension)) throw new Error('只允许独立 MP4/MOV/WebM 文件，拒绝播放列表')
  const handle = await open(inputPath, 'r')
  try {
    const buffer = Buffer.alloc(16)
    await handle.read(buffer, 0, 16, 0)
    const valid = extension === '.webm' ? buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) : ['ftyp', 'moov', 'mdat', 'wide', 'free'].includes(buffer.toString('ascii', 4, 8))
    if (!valid) throw new Error('输入媒体文件头不匹配')
  } finally { await handle.close() }
  const directory = await outputDirectory(policy, dirname(output), attemptId)
  return { inputPath, outputPath: join(directory, basename(output)), directory, demuxer: extension === '.webm' ? 'matroska' : 'mov' }
}
export async function downloadMedia(response: Response, output: string, budget: { remaining: number }) {
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('媒体下载失败') }
  const reader = response.body.getReader()
  let handle: Awaited<ReturnType<typeof open>> | undefined
  let total = 0
  try {
    const declared = Number(response.headers.get('content-length'))
    if (declared > Math.min(MAX_MEDIA_BYTES, budget.remaining)) throw new Error('媒体文件过大')
    handle = await open(output, 'wx', 0o600)
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_MEDIA_BYTES || value.byteLength > budget.remaining) throw new Error('媒体输出超过总字节上限')
      budget.remaining -= value.byteLength
      let offset = 0
      while (offset < value.byteLength) { const written = await handle.write(value, offset); if (!written.bytesWritten) throw new Error('媒体写入失败'); offset += written.bytesWritten }
    }
    if (!total) throw new Error('媒体文件为空')
    return total
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    if (handle) { await handle.close(); handle = undefined; await rm(output, { force: true }) }
    throw error
  } finally { await handle?.close(); reader.releaseLock() }
}
