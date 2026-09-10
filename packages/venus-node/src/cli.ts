import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { z } from 'zod'
import { detectModels, localServiceUrl, type AdapterConfig } from './adapters.ts'
import { platformRequest, platformUrl, runNode } from './runtime.ts'
import { modelSchema } from '../../node-protocol/index.ts'

async function main() {
  if (!stdin.isTTY) throw new Error('仅支持交互式前台启动；不接受管道脚本或静默安装。')
  const io = createInterface({ input: stdin, output: stdout })
  let token = ''
  let config: { platform: string; adapter: AdapterConfig; allowedModels: string[]; maxConcurrency: number }
  try {
    stdout.write('Venus 前台节点 · 文本、视频与 ComfyUI 媒体执行\n凭据仅保留在内存，不安装后台服务、不下载模型、不修改防火墙。\n退出后需在网页撤销节点；下次启动需重新配对。\n')
    const platform = platformUrl((await io.question('平台根地址（HTTPS）：')).trim())
    const provider = z.enum(['ollama', 'openai', 'comfyui']).parse((await io.question('本机服务类型（ollama / openai / comfyui）：')).trim())
    const baseUrl = localServiceUrl((await io.question(provider === 'ollama' ? '本机地址（例如 http://127.0.0.1:11434）：' : provider === 'openai' ? '本机地址（例如 http://127.0.0.1:8000/v1）：' : 'ComfyUI 地址（例如 http://127.0.0.1:8188）：')).trim())
    const adapter: AdapterConfig = { provider, baseUrl }
    const models = await detectModels(adapter)
    stdout.write(`已检测 ${models.length} 个可执行能力：${models.join(', ')}。不会自动选择或下载模型。\n`)
    const allowedModels = z.array(modelSchema).min(1).max(32).parse((await io.question('允许的模型或能力名称（逗号分隔）：')).split(',').map(m => m.trim()))
    if (allowedModels.some(model => !models.includes(model))) throw new Error('至少一个模型或能力未在本机检测到。')
    const maxConcurrency = z.coerce.number().int().min(1).max(8).parse(await io.question('本机并发上限（1–8）：'))
    const ffmpegPath = provider === 'comfyui' ? undefined : ((await io.question('ffmpeg 可执行文件路径（回车使用 PATH 中的 ffmpeg）：')).trim() || undefined)
    adapter.ffmpegPath = ffmpegPath
    stdout.write(`仅访问平台 ${platform} 与本机 ${baseUrl}；媒体任务不会执行 shell 命令。\n`)
    if ((await io.question('同意启动此前台会话？输入 yes：')).trim() !== 'yes') return
    const code = (await io.question('网页生成的一次性配对码：')).trim()
    const enrollment = z.object({ nodeToken: z.string().startsWith('vn_'), nodeId: z.string() }).parse(await platformRequest(platform, '/api/node/enroll', null, { code }))
    token = enrollment.nodeToken
    config = { platform, adapter, allowedModels, maxConcurrency }
    stdout.write('绑定完成。请在“我的节点 → 资源策略”中明确授权接单。Ctrl+C 退出。\n')
  } finally { io.close() }
  if (!token) return
  const stop = new AbortController()
  const halt = () => stop.abort()
  process.once('SIGINT', halt); process.once('SIGTERM', halt)
  try { await runNode({ ...config!, token }, stop.signal) }
  finally { token = ''; process.removeListener('SIGINT', halt); process.removeListener('SIGTERM', halt) }
}
main().catch(() => { console.error('节点未启动或已停止。请检查本机服务、平台地址与配对信息；未保存长期凭据。'); process.exitCode = 1 })
