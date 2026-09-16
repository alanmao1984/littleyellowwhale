import { createInterface } from 'node:readline/promises'
import { readFile, stat } from 'node:fs/promises'
import { approvedRoot, approveTemplate } from './media-security.ts'
import { capabilitySchema, type Capability } from '../../node-protocol/index.ts'
import { stdin, stdout } from 'node:process'
import { z } from 'zod'
import { detectModels, localServiceUrl, type AdapterConfig } from './adapters.ts'
import { platformRequest, platformUrl, runNode } from './runtime.ts'
import { modelSchema, type HermesStatus } from '../../node-protocol/index.ts'
import { inspectHardware } from './hardware.ts'
import { downloadVerifiedModel, recommendModel } from './model-manager.ts'
import { installHermesPack } from './hermes-pack.ts'

declare const __VENUS_VERSION__: string | undefined

const version = typeof __VENUS_VERSION__ === 'string' ? __VENUS_VERSION__ : '0.1.0-dev'
const help = `Venus 前台节点 ${version}

用法：venus-node [--help | --version]

不带参数时进入交互式配对流程。节点仅以前台方式运行，凭据只驻留内存；
硬件检测只读取本机信息，模型下载与 Hermes Docker 包必须逐项确认。`

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) { stdout.write(`${version}\n`); return }
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) { stdout.write(`${help}\n`); return }
  if (args.length > 0) throw new Error('不支持该启动参数。请使用 --help 查看安全启动方式。')
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('仅支持交互式前台启动；不接受管道脚本或静默安装。')
  const io = createInterface({ input: stdin, output: stdout })
  let token = ''
  let config: { platform: string; adapter: AdapterConfig; allowedModels: string[]; maxConcurrency: number; hardware: Awaited<ReturnType<typeof inspectHardware>>; hermes: HermesStatus }
  try {
    stdout.write('Venus 前台节点 · 本地 AI + Hermes + 可核验用量\n凭据仅保留在内存；硬件检测、模型下载与 Docker 启动都在前台逐项确认。\n退出后需在网页撤销节点；下次启动需重新配对。\n')
    const platform = platformUrl((await io.question('平台根地址（HTTPS）：')).trim())
    const hardware = await inspectHardware()
    const recommendation = recommendModel(hardware.tier)
    stdout.write(`\n硬件报告：${hardware.cpuModel} · ${hardware.cpuCores} 核 · ${(hardware.memoryBytes / 1024 ** 3).toFixed(1)} GiB 内存\nGPU：${hardware.gpu ? `${hardware.gpu.model}${hardware.gpu.vramMiB ? ` · ${hardware.gpu.vramMiB} MiB` : ''}` : '未检测到独立 GPU'}\n档位：${hardware.tier} · 建议模型 ${recommendation.id}（约 ${(recommendation.sizeMiB / 1024).toFixed(1)} GiB，context ${recommendation.context}）\n`)
    let installed: Awaited<ReturnType<typeof installHermesPack>> | null = null
    if ((await io.question('下载并 SHA-256 校验建议 GGUF？输入 yes：')).trim() === 'yes') {
      const modelPath = await downloadVerifiedModel(recommendation, undefined, (received, total) => stdout.write(`\r下载 ${(received / 1024 ** 2).toFixed(0)} MiB${total ? ` / ${(total / 1024 ** 2).toFixed(0)} MiB` : ''}`))
      stdout.write(`\n模型已校验：${modelPath}\n`)
      if ((await io.question('安装并启动可选 Hermes Docker 能力包？输入 hermes：')).trim() === 'hermes') installed = await installHermesPack({ platformUrl: platform, modelPath, model: recommendation })
    }
    let adapter: AdapterConfig
    let models: string[]
    if (installed) {
      adapter = { provider: 'openai', baseUrl: 'http://127.0.0.1:8080/v1' }
      models = [recommendation.id]
      stdout.write(`Hermes 已在 ${installed.proxyUrl} 启动；9119 仅容器内可见，9120 只绑定回环地址。\n`)
    } else {
      const provider = z.enum(['ollama', 'openai', 'comfyui']).parse((await io.question('本机服务类型（ollama / openai / comfyui）：')).trim())
      const baseUrl = localServiceUrl((await io.question(provider === 'ollama' ? '本机地址（例如 http://127.0.0.1:11434）：' : provider === 'openai' ? '本机地址（例如 http://127.0.0.1:8000/v1）：' : 'ComfyUI 地址（例如 http://127.0.0.1:8188）：')).trim())
      adapter = { provider, baseUrl }
      models = await detectModels(adapter)
    }
    stdout.write(`已检测 ${models.length} 个可执行能力：${models.join(', ')}。\n`)
    const allowedModels = installed ? models : z.array(modelSchema).min(1).max(32).parse((await io.question('允许的模型或能力名称（逗号分隔）：')).split(',').map(m => m.trim()))
    if (allowedModels.some(model => !models.includes(model))) throw new Error('至少一个模型或能力未在本机检测到。')
    const maxConcurrency = z.coerce.number().int().min(1).max(8).parse(await io.question('本机并发上限（1–8）：'))
    if ((await io.question('默认仅允许文本。是否为本次会话开启媒体？输入 media 才开启：')).trim() === 'media') {
      const inputRoot = await approvedRoot((await io.question('批准读取的现有输入根目录（绝对路径）：')).trim())
      const outputRoot = await approvedRoot((await io.question('批准写入的现有输出根目录（绝对路径）：')).trim())
      const capabilities = z.array(capabilitySchema).min(1).max(3).parse((await io.question(adapter.provider === 'comfyui' ? '允许操作（image:multi_shot）：' : '允许操作（video:segment,video:transcode，逗号分隔）：')).split(',').map(value => value.trim()))
      const permitted: Capability[] = adapter.provider === 'comfyui' ? ['image:multi_shot'] : ['video:segment', 'video:transcode']
      if (capabilities.some(value => !permitted.includes(value))) throw new Error('服务不支持该媒体能力')
      adapter.media = { inputRoot, outputRoot, capabilities }
      if (adapter.provider === 'comfyui') {
        const path = (await io.question('本地批准模板 JSON 路径（workflow、allowedClasses、inputs 映射）：')).trim()
        const info = await stat(path)
        if (!info.isFile() || info.size > 100000) throw new Error('模板文件无效或过大')
        adapter.media.template = approveTemplate(JSON.parse(await readFile(path, 'utf8')))
        stdout.write(`批准模板 SHA-256：${adapter.media.template.hash}\n节点类：${adapter.media.template.allowedClasses.join(', ')}\n请仅使用专用 ComfyUI 实例；自定义节点拥有实例权限。中止不保证撤销后端副作用。\n`)
        if ((await io.question('确认已审查模板内容与映射？输入完整 SHA-256：')).trim() !== adapter.media.template.hash) throw new Error('模板未批准')
      } else {
        adapter.ffmpegPath = (await io.question('本地 ffmpeg 可执行文件（回车使用 PATH 中 ffmpeg）：')).trim() || undefined
      }
      stdout.write(`仅批准 ${capabilities.join(', ')}；输入 ${inputRoot}；输出 ${outputRoot}。每次执行写入独立目录，不覆盖原文件。\n`)
    }
    if (adapter.provider === 'comfyui' && !adapter.media) throw new Error('ComfyUI 必须在本地明确批准模板和媒体权限')
    stdout.write(`仅访问平台 ${platform} 与本机 ${adapter.baseUrl}；媒体任务不会执行 shell 命令。\n`)
    if ((await io.question('同意启动此前台会话？输入 yes：')).trim() !== 'yes') return
    const code = (await io.question('网页生成的一次性配对码：')).trim()
    const enrollment = z.object({ nodeToken: z.string().startsWith('vn_'), nodeId: z.string() }).parse(await platformRequest(platform, '/api/node/enroll', null, { code }))
    token = enrollment.nodeToken
    config = { platform, adapter, allowedModels, maxConcurrency, hardware, hermes: installed ? { enabled: true, status: 'starting', proxyPort: 9120, internalPort: 9119, version: 'v2026.6.5' } : { enabled: false, status: 'disabled', proxyPort: null, internalPort: 9119, version: null } }
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
