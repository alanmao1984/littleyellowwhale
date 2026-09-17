import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, rename, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { HardwareProfile } from '../../node-protocol/index.ts'

export type ModelRecommendation = { id: string; file: string; url: string; sha256: string; sizeMiB: number; context: number }
const MODELS: Record<HardwareProfile['tier'], ModelRecommendation> = {
  T0: { id: 'qwen3.5-4b', file: 'Qwen3.5-4B-Q4_K_M.gguf', url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf', sha256: '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4', sizeMiB: 2870, context: 8192 },
  T1: { id: 'qwen3.5-9b', file: 'Qwen3.5-9B-Q4_K_M.gguf', url: 'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf', sha256: '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8', sizeMiB: 5760, context: 16384 },
  T2: { id: 'qwen3.5-9b', file: 'Qwen3.5-9B-Q4_K_M.gguf', url: 'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf', sha256: '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8', sizeMiB: 5760, context: 32768 },
  T3: { id: 'qwen3-30b-a3b', file: 'Qwen3-30B-A3B-Q4_K_M.gguf', url: 'https://huggingface.co/unsloth/Qwen3-30B-A3B-GGUF/resolve/main/Qwen3-30B-A3B-Q4_K_M.gguf', sha256: '9f1a24700a339b09c06009b729b5c809e0b64c213b8af5b711b3dbdfd0c5ba48', sizeMiB: 18600, context: 32768 },
  T4: { id: 'qwen3-30b-a3b', file: 'Qwen3-30B-A3B-Q4_K_M.gguf', url: 'https://huggingface.co/unsloth/Qwen3-30B-A3B-GGUF/resolve/main/Qwen3-30B-A3B-Q4_K_M.gguf', sha256: '9f1a24700a339b09c06009b729b5c809e0b64c213b8af5b711b3dbdfd0c5ba48', sizeMiB: 18600, context: 131072 },
  ARC: { id: 'qwen3.5-9b', file: 'Qwen3.5-9B-Q4_K_M.gguf', url: 'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf', sha256: '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8', sizeMiB: 5760, context: 32768 },
  ARC_LITE: { id: 'qwen3.5-4b', file: 'Qwen3.5-4B-Q4_K_M.gguf', url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf', sha256: '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4', sizeMiB: 2870, context: 16384 },
  SH_COMPACT: { id: 'qwen3-30b-a3b', file: 'Qwen3-30B-A3B-Q4_K_M.gguf', url: 'https://huggingface.co/unsloth/Qwen3-30B-A3B-GGUF/resolve/main/Qwen3-30B-A3B-Q4_K_M.gguf', sha256: '9f1a24700a339b09c06009b729b5c809e0b64c213b8af5b711b3dbdfd0c5ba48', sizeMiB: 18600, context: 65536 },
  SH_LARGE: { id: 'qwen3.6-35b-a3b', file: 'Qwen3.6-35B-A3B-UD-Q4_K_M.gguf', url: 'https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF/resolve/main/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf', sha256: 'ac0e2c1189e055faa36eff361580e79c5bd6f8e76bffb4ce547f167d53e31a61', sizeMiB: 21110, context: 131072 },
  NV_ULTRA: { id: 'qwen3.6-35b-a3b', file: 'Qwen3.6-35B-A3B-UD-Q4_K_M.gguf', url: 'https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF/resolve/main/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf', sha256: 'ac0e2c1189e055faa36eff361580e79c5bd6f8e76bffb4ce547f167d53e31a61', sizeMiB: 21110, context: 131072 },
}
export function recommendModel(tier: HardwareProfile['tier']) { return MODELS[tier] }
export function defaultModelDirectory() { return join(homedir(), '.yellow-whale', 'models') }
async function hashFile(path: string) { const hash = createHash('sha256'); await pipeline(createReadStream(path), hash); return hash.digest('hex') }
export async function downloadVerifiedModel(model: ModelRecommendation, directory = defaultModelDirectory(), progress: (received: number, total: number | null) => void = () => undefined) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const target = join(directory, model.file); const partial = `${target}.part`
  const existing = await stat(partial).then(value => value.size).catch(() => 0)
  const response = await fetch(model.url, { redirect: 'follow', headers: existing ? { Range: `bytes=${existing}-` } : {}, signal: AbortSignal.timeout(30 * 60_000) })
  if (!response.ok || !response.body) throw new Error(`模型下载失败 (${response.status})`)
  const append = existing > 0 && response.status === 206; const receivedBefore = append ? existing : 0
  const totalHeader = Number(response.headers.get('content-length')); const total = Number.isFinite(totalHeader) ? receivedBefore + totalHeader : null
  const stream = Readable.fromWeb(response.body as never); let received = receivedBefore
  stream.on('data', chunk => { received += chunk.length; progress(received, total) })
  await pipeline(stream, createWriteStream(partial, { flags: append ? 'a' : 'w', mode: 0o600 }))
  if (await hashFile(partial) !== model.sha256) { await rm(partial, { force: true }); throw new Error('模型 SHA-256 校验失败，已删除临时文件。') }
  await rename(partial, target); await access(target); return target
}
