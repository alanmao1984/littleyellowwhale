import { spawn } from 'node:child_process'
import { stat, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { MAX_MEDIA_BYTES, MAX_MEDIA_FILES, confinedPath, downloadMedia, outputDirectory, prepareApprovedPrompt, videoPaths, type LocalMediaPolicy } from './media-security.ts'
import { z } from 'zod'
import { imageShotItemSchema, modelSchema, videoSegmentItemSchema, videoTranscodeItemSchema, type Assignment } from '../../node-protocol/index.ts'

export type AdapterConfig = { provider: 'ollama' | 'openai' | 'comfyui'; baseUrl: string; ffmpegPath?: string; media?: LocalMediaPolicy }
export function adapterCapabilities(config: AdapterConfig) {
  return [...(config.provider === 'comfyui' ? [] : ['text:infer' as const]), ...(config.media?.capabilities ?? [])]
}
export function localServiceUrl(value: string) {
  const url = new URL(value)
  if (!['127.0.0.1', '[::1]'].includes(url.hostname) || url.protocol !== 'http:' || url.username || url.password || url.search || url.hash) throw new Error('只允许本机回环 HTTP 地址，不跟随重定向。')
  return url.href.replace(/\/$/, '')
}
export async function boundedJson(response: Response, maxBytes = 256000): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error('服务请求失败')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const item = await reader.read()
      if (item.done) break
      size += item.value.byteLength
      if (size > maxBytes) { await reader.cancel(); throw new Error('响应超过安全上限') }
      chunks.push(item.value)
    }
  } finally { reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
export async function detectModels(config: AdapterConfig) {
  const base = localServiceUrl(config.baseUrl)
  if (config.provider === 'comfyui') {
    const response = await fetch(`${base}/system_stats`, { signal: AbortSignal.timeout(10000), redirect: 'error' })
    await boundedJson(response, 256000)
    return ['comfyui']
  }
  const response = await fetch(`${base}${config.provider === 'ollama' ? '/api/tags' : '/models'}`, { signal: AbortSignal.timeout(10000), redirect: 'error' })
  const data = await boundedJson(response)
  const schema = config.provider === 'ollama'
    ? z.object({ models: z.array(z.object({ name: modelSchema })).max(1000) }).transform(v => v.models.map(m => m.name))
    : z.object({ data: z.array(z.object({ id: modelSchema })).max(1000) }).transform(v => v.data.map(m => m.id))
  return schema.parse(data)
}
export async function infer(config: AdapterConfig, work: Assignment, signal: AbortSignal) {
  if (config.provider === 'comfyui') throw new Error('ComfyUI 任务不能使用文本推理操作')
  const base = localServiceUrl(config.baseUrl)
  const messages = [{ role: 'system', content: work.instruction }, { role: 'user', content: work.input }]
  const ollama = config.provider === 'ollama'
  const response = await fetch(`${base}${ollama ? '/api/chat' : '/chat/completions'}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(8 * 60_000)]),
    body: JSON.stringify(ollama ? { model: work.model, messages, stream: false, options: { num_predict: work.maxOutputTokens } } : { model: work.model, messages, stream: false, max_tokens: work.maxOutputTokens }),
  })
  const data = await boundedJson(response)
  const count = z.number().int().nonnegative()
  if (ollama) {
    const parsed = z.object({ done: z.literal(true), message: z.object({ content: z.string().min(1).max(32000) }), prompt_eval_count: count.optional(), eval_count: count.max(work.maxOutputTokens).optional() }).parse(data)
    return { output: parsed.message.content, usage: parsed.prompt_eval_count !== undefined && parsed.eval_count !== undefined ? { inputTokens: parsed.prompt_eval_count, outputTokens: parsed.eval_count } : null, resultMeta: { kind: 'text', provider: 'ollama' } }
  }
  const parsed = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().min(1).max(32000) }) })).min(1), usage: z.object({ prompt_tokens: count, completion_tokens: count.max(work.maxOutputTokens) }).optional() }).parse(data)
  return { output: parsed.choices[0].message.content, usage: parsed.usage ? { inputTokens: parsed.usage.prompt_tokens, outputTokens: parsed.usage.completion_tokens } : null, resultMeta: { kind: 'text', provider: 'openai-compatible' } }
}

export function processRun(command: string, args: string[], signal: AbortSignal) {
  signal.throwIfAborted()
  return new Promise<{ stdout: string; stderr: string }>((resolvePromise, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true })
    let stdout = ''; let stderr = ''
    const append = (current: string, chunk: Buffer) => (current + chunk.toString('utf8')).slice(-16000)
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk) })
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk) })
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const stop = () => { child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 2000) }
    const cleanup = () => { signal.removeEventListener('abort', stop); clearTimeout(killTimer) }
    signal.addEventListener('abort', stop, { once: true })
    if (signal.aborted) stop()
    child.once('error', error => { cleanup(); reject(error) })
    child.once('close', code => { cleanup(); code === 0 && !signal.aborted ? resolvePromise({ stdout, stderr }) : reject(new Error('媒体命令未确认成功')) })
  })
}
async function executeVideo(config: AdapterConfig, work: Assignment, signal: AbortSignal) {
  const item = work.operation === 'segment' ? videoSegmentItemSchema.parse(JSON.parse(work.input)) : videoTranscodeItemSchema.parse(JSON.parse(work.input))
  if ('videoCodec' in item && (item.videoCodec !== (item.format === 'webm' ? 'libvpx-vp9' : 'libx264') || item.audioCodec !== (item.format === 'webm' ? 'opus' : 'aac'))) throw new Error('只支持固定安全编解码组合：MP4/MOV 使用 libx264+aac，WebM 使用 libvpx-vp9+opus')
  const paths = await videoPaths(config.media!, item.inputPath, item.outputPath, item.format, work.attemptId)
  try {
    signal.throwIfAborted()
    const codec = item.format === 'webm' ? ['-c:v', 'libvpx-vp9', '-c:a', 'libopus'] : ['-c:v', 'libx264', '-c:a', 'aac']
    const trim = 'startSeconds' in item ? ['-ss', String(item.startSeconds), '-t', String(item.durationSeconds)] : []
    const scale = 'width' in item && item.width && item.height ? ['-vf', `scale=${item.width}:${item.height}`] : []
    const fps = 'fps' in item && item.fps ? ['-r', String(item.fps)] : []
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-protocol_whitelist', 'file', '-f', paths.demuxer, ...(paths.demuxer === 'mov' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []), '-i', paths.inputPath,
      ...trim, '-map', '0:v:0?', '-map', '0:a:0?', ...codec, ...scale, ...fps, '-threads', '2', '-fs', String(MAX_MEDIA_BYTES), '-f', item.format, paths.outputPath]
    await processRun(config.ffmpegPath || 'ffmpeg', args, AbortSignal.any([signal, AbortSignal.timeout(20 * 60_000)]))
    const info = await stat(paths.outputPath)
    if (!info.size || info.size >= MAX_MEDIA_BYTES) throw new Error('媒体输出为空或达到大小上限')
    const meta = { kind: 'video', operation: work.operation, outputPath: paths.outputPath, bytes: info.size, billingUnits: work.billingUnits }
    return { output: JSON.stringify(meta), resultMeta: meta, usage: null }
  } catch (error) { await rm(paths.directory, { recursive: true, force: true }); throw error }
}
async function comfyRequest(base: string, path: string, signal: AbortSignal, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, { ...init, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) })
  return response
}
async function executeComfy(config: AdapterConfig, work: Assignment, signal: AbortSignal) {
  const shot = imageShotItemSchema.parse(JSON.parse(work.input))
  const spec = work.mediaSpec
  if (spec.taskType !== 'image') throw new Error('媒体配置不匹配')
  await confinedPath(config.media!.outputRoot, shot.outputDir, 'directory')
  signal = AbortSignal.any([signal, AbortSignal.timeout(spec.timeoutSeconds * 1000)])
  const base = localServiceUrl(config.baseUrl)
  const promptResponse = await comfyRequest(base, '/prompt', signal, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prepareApprovedPrompt(config.media?.template, work, shot), client_id: `venus-${work.attemptId}` }) })
  const prompt = z.object({ prompt_id: z.string().min(1).max(200) }).parse(await boundedJson(promptResponse))
  const deadline = Date.now() + spec.timeoutSeconds * 1000
  let history: Record<string, unknown> | null = null
  while (Date.now() < deadline) {
    const response = await comfyRequest(base, `/history/${encodeURIComponent(prompt.prompt_id)}`, signal)
    const data = await boundedJson(response, 2_000_000) as Record<string, unknown>
    const candidate = data[prompt.prompt_id]
    if (candidate && typeof candidate === 'object') { history = candidate as Record<string, unknown>; break }
    await delay(1500, undefined, { signal })
  }
  if (!history) throw new Error('ComfyUI 任务超时')
  const outputs = history.outputs && typeof history.outputs === 'object' ? history.outputs as Record<string, unknown> : {}
  const files: Array<Record<string, unknown>> = []
  const directory = await outputDirectory(config.media!, shot.outputDir, work.attemptId)
  const budget = { remaining: MAX_MEDIA_BYTES }
  try {
    for (const output of Object.values(outputs)) {
      if (!output || typeof output !== 'object') continue
      const images = (output as Record<string, unknown>).images
      if (!Array.isArray(images)) continue
      for (const value of images) {
        if (files.length >= MAX_MEDIA_FILES) throw new Error('媒体文件数量超限')
        const file = z.object({ filename: z.string().max(180).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/), subfolder: z.string().max(300).default(''), type: z.literal('output').default('output') }).parse(value)
        if (file.subfolder.split(/[\\/]/).some(part => part === '..') || file.subfolder.startsWith('/') || file.subfolder.includes(':') || file.subfolder.includes('\\') || file.subfolder.includes('\0') || !['.png', '.jpg', '.jpeg', '.webp'].includes(extname(file.filename).toLowerCase())) throw new Error('ComfyUI 文件引用不安全')
        const outputPath = join(directory, `${files.length + 1}-${basename(file.filename)}`)
        const response = await comfyRequest(base, `/view?${new URLSearchParams(file)}`, signal)
        const bytes = await downloadMedia(response, outputPath, budget)
        files.push({ ...file, localPath: outputPath, bytes })
      }
    }
    if (!files.length) throw new Error('ComfyUI 没有返回图像输出')
    const meta = { kind: 'image', provider: 'comfyui', templateHash: config.media!.template!.hash, promptId: prompt.prompt_id, files, billingUnits: work.billingUnits }
    return { output: JSON.stringify(meta), resultMeta: meta, usage: null }
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error }
}

export async function executeMedia(config: AdapterConfig, work: Assignment, signal: AbortSignal) {
  signal.throwIfAborted()
  if (!config.media || !config.media.capabilities.some(capability => capability === `${work.taskType}:${work.operation}`)) throw new Error('本次前台会话未授权该媒体能力')
  if (work.taskType === 'video') return executeVideo(config, work, signal)
  if (work.taskType === 'image' && config.provider === 'comfyui') return executeComfy(config, work, signal)
  throw new Error('节点适配器不支持此媒体任务')
}
