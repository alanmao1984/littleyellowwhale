import { spawn } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { z } from 'zod'
import { imageShotItemSchema, modelSchema, videoSegmentItemSchema, videoTranscodeItemSchema, type Assignment } from '../../node-protocol/index.ts'

export type AdapterConfig = { provider: 'ollama' | 'openai' | 'comfyui'; baseUrl: string; ffmpegPath?: string }
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
async function boundedBytes(response: Response, maxBytes = 50_000_000) {
  if (!response.ok) throw new Error('媒体下载失败')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > maxBytes) throw new Error('媒体响应超过安全上限')
  return bytes
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

function localPath(value: string) {
  if (!isAbsolute(value) || value.includes('\0')) throw new Error('媒体路径必须是本机绝对路径')
  return value
}
function processRun(command: string, args: string[], signal: AbortSignal) {
  return new Promise<{ stdout: string; stderr: string }>((resolvePromise, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true })
    let stdout = ''; let stderr = ''
    const append = (current: string, chunk: Buffer) => (current + chunk.toString('utf8')).slice(-16000)
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk) })
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk) })
    const stop = () => child.kill('SIGTERM')
    signal.addEventListener('abort', stop, { once: true })
    child.once('error', error => { signal.removeEventListener('abort', stop); reject(error) })
    child.once('close', code => { signal.removeEventListener('abort', stop); code === 0 && !signal.aborted ? resolvePromise({ stdout, stderr }) : reject(new Error(stderr || '媒体命令执行失败')) })
  })
}
async function executeVideo(config: AdapterConfig, work: Assignment, signal: AbortSignal) {
  if (work.operation === 'segment') {
    const item = videoSegmentItemSchema.parse(JSON.parse(work.input))
    const inputPath = localPath(item.inputPath); const outputPath = localPath(item.outputPath)
    if (resolve(inputPath) === resolve(outputPath)) throw new Error('输入和输出路径不能相同')
    await mkdir(dirname(outputPath), { recursive: true })
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(item.startSeconds), '-i', inputPath, '-t', String(item.durationSeconds), '-map', '0', '-c:v', 'libx264', '-c:a', 'aac', outputPath]
    await processRun(config.ffmpegPath || 'ffmpeg', args, signal)
    const outputStat = await stat(outputPath)
    const meta = { kind: 'video', operation: work.operation, outputPath, bytes: outputStat.size, billingUnits: work.billingUnits }
    return { output: JSON.stringify(meta), resultMeta: meta, usage: null }
  }
  const item = videoTranscodeItemSchema.parse(JSON.parse(work.input))
  const inputPath = localPath(item.inputPath); const outputPath = localPath(item.outputPath)
  if (resolve(inputPath) === resolve(outputPath)) throw new Error('输入和输出路径不能相同')
  await mkdir(dirname(outputPath), { recursive: true })
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, '-map', '0', '-c:v', item.videoCodec, '-c:a', item.audioCodec, ...(item.width && item.height ? ['-vf', `scale=${item.width}:${item.height}`] : []), ...(item.fps ? ['-r', String(item.fps)] : []), outputPath]
  await processRun(config.ffmpegPath || 'ffmpeg', args, signal)
  const outputStat = await stat(outputPath)
  const meta = { kind: 'video', operation: work.operation, outputPath, bytes: outputStat.size, billingUnits: work.billingUnits }
  return { output: JSON.stringify(meta), resultMeta: meta, usage: null }
}

function cloneWorkflow(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}
function applyShot(workflow: Record<string, unknown>, shot: z.infer<typeof imageShotItemSchema>) {
  let promptUpdated = false
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(visit); return }
    const record = value as Record<string, unknown>
    const inputs = record.inputs
    if (inputs && typeof inputs === 'object' && !Array.isArray(inputs)) {
      const input = inputs as Record<string, unknown>
      for (const key of ['prompt', 'positive', 'text']) if (!promptUpdated && typeof input[key] === 'string') { input[key] = shot.prompt; promptUpdated = true }
      for (const key of ['negative', 'negative_prompt']) if (shot.negativePrompt && typeof input[key] === 'string') input[key] = shot.negativePrompt
      if (shot.seed !== undefined) for (const key of ['seed', 'noise_seed']) if (typeof input[key] === 'number') input[key] = shot.seed
    }
    Object.values(record).forEach(visit)
  }
  visit(workflow)
  if (!promptUpdated) throw new Error('ComfyUI 工作流中没有可替换的 prompt/positive/text 输入')
  return workflow
}
async function comfyRequest(base: string, path: string, signal: AbortSignal, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, { ...init, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) })
  return response
}
async function executeComfy(config: AdapterConfig, work: Assignment, signal: AbortSignal) {
  const shot = imageShotItemSchema.parse(JSON.parse(work.input))
  const spec = work.mediaSpec
  if (spec.taskType !== 'image') throw new Error('媒体配置不匹配')
  const base = localServiceUrl(config.baseUrl)
  const promptResponse = await comfyRequest(base, '/prompt', signal, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: applyShot(cloneWorkflow(spec.comfyWorkflow), shot), client_id: `venus-${work.taskId}` }) })
  const prompt = z.object({ prompt_id: z.string().min(1).max(200) }).parse(await boundedJson(promptResponse))
  const deadline = Date.now() + spec.timeoutSeconds * 1000
  let history: Record<string, unknown> | null = null
  while (Date.now() < deadline) {
    const response = await comfyRequest(base, `/history/${encodeURIComponent(prompt.prompt_id)}`, signal)
    const data = await boundedJson(response, 2_000_000) as Record<string, unknown>
    const candidate = data[prompt.prompt_id]
    if (candidate && typeof candidate === 'object') { history = candidate as Record<string, unknown>; break }
    await new Promise<void>((resolvePromise, reject) => { const timer = setTimeout(resolvePromise, 1500); signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('媒体任务已中止')) }, { once: true }) })
  }
  if (!history) throw new Error('ComfyUI 任务超时')
  const outputs = history.outputs && typeof history.outputs === 'object' ? history.outputs as Record<string, unknown> : {}
  const files: Array<Record<string, unknown>> = []
  for (const output of Object.values(outputs)) {
    if (!output || typeof output !== 'object') continue
    const images = (output as Record<string, unknown>).images
    if (!Array.isArray(images)) continue
    for (const value of images) {
      if (!value || typeof value !== 'object') continue
      const file = value as Record<string, unknown>
      if (typeof file.filename !== 'string') continue
      const entry: Record<string, unknown> = { filename: file.filename, subfolder: typeof file.subfolder === 'string' ? file.subfolder : '', type: typeof file.type === 'string' ? file.type : 'output' }
      if (shot.outputDir) {
        const outputDir = resolve(localPath(shot.outputDir)); const outputPath = resolve(join(outputDir, String(entry.subfolder), basename(file.filename)))
        if (relative(outputDir, outputPath).startsWith('..')) throw new Error('ComfyUI 输出路径越界')
        await mkdir(dirname(outputPath), { recursive: true })
        const query = new URLSearchParams({ filename: file.filename, subfolder: String(entry.subfolder), type: String(entry.type) })
        const imageResponse = await comfyRequest(base, `/view?${query.toString()}`, signal)
        await writeFile(outputPath, await boundedBytes(imageResponse)); entry.localPath = outputPath
      }
      files.push(entry)
    }
  }
  if (!files.length) throw new Error('ComfyUI 没有返回图像输出')
  const meta = { kind: 'image', provider: 'comfyui', promptId: prompt.prompt_id, files, billingUnits: work.billingUnits }
  return { output: JSON.stringify(meta), resultMeta: meta, usage: null }
}

export async function executeMedia(config: AdapterConfig, work: Assignment, signal: AbortSignal) {
  if (work.taskType === 'video') return executeVideo(config, work, signal)
  if (work.taskType === 'image' && config.provider === 'comfyui') return executeComfy(config, work, signal)
  throw new Error('节点适配器不支持此媒体任务')
}
