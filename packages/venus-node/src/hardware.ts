import { arch, cpus, platform, totalmem } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { HardwareProfile } from '../../node-protocol/index.ts'

const exec = promisify(execFile)
export type GpuInfo = HardwareProfile['gpu']

export function classifyHardware(memoryBytes: number, gpu: GpuInfo, hostArch = arch()): HardwareProfile['tier'] {
  const memoryGiB = memoryBytes / 1024 ** 3
  const vramGiB = (gpu?.vramMiB ?? 0) / 1024
  const model = gpu?.model.toLowerCase() ?? ''
  if (gpu?.vendor === 'nvidia' && (vramGiB >= 90 || model.includes('gb10'))) return 'NV_ULTRA'
  if ((gpu?.vendor === 'amd' || gpu?.vendor === 'apple') && memoryGiB >= 90) return 'SH_LARGE'
  if ((gpu?.vendor === 'amd' || gpu?.vendor === 'apple') && memoryGiB >= 48) return 'SH_COMPACT'
  if (gpu?.vendor === 'intel' && vramGiB >= 12) return 'ARC'
  if (gpu?.vendor === 'intel' && vramGiB >= 6) return 'ARC_LITE'
  if (vramGiB >= 20 || memoryGiB >= 64) return 'T4'
  if (vramGiB >= 12 || memoryGiB >= 32) return 'T3'
  if (vramGiB >= 8 || memoryGiB >= 16) return 'T2'
  if (vramGiB >= 4 || memoryGiB >= 8 || hostArch === 'arm64') return 'T1'
  return 'T0'
}

function vendorOf(model: string): NonNullable<GpuInfo>['vendor'] {
  const value = model.toLowerCase()
  if (value.includes('nvidia')) return 'nvidia'
  if (value.includes('amd') || value.includes('radeon')) return 'amd'
  if (value.includes('intel')) return 'intel'
  if (value.includes('apple')) return 'apple'
  return 'unknown'
}

async function detectGpu(): Promise<GpuInfo> {
  try {
    if (platform() === 'win32') {
      const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_VideoController | Select-Object -First 1 Name,AdapterRAM | ConvertTo-Json -Compress'], { timeout: 5000, windowsHide: true })
      const parsed = JSON.parse(stdout) as { Name?: string; AdapterRAM?: number }
      if (parsed.Name) return { vendor: vendorOf(parsed.Name), model: parsed.Name, vramMiB: parsed.AdapterRAM ? Math.round(parsed.AdapterRAM / 1024 ** 2) : null }
    }
    if (platform() === 'darwin') {
      const { stdout } = await exec('system_profiler', ['SPDisplaysDataType', '-json'], { timeout: 8000 })
      const displays = (JSON.parse(stdout).SPDisplaysDataType ?? []) as Array<Record<string, string>>
      const first = displays[0]
      const model = first?.sppci_model ?? first?.sppci_chipset_model
      if (model) return { vendor: vendorOf(model), model, vramMiB: null }
    }
    const { stdout } = await exec('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { timeout: 5000 })
    const [model, vram] = stdout.trim().split(',').map(value => value.trim())
    if (model) return { vendor: 'nvidia', model, vramMiB: Number.isFinite(Number(vram)) ? Number(vram) : null }
  } catch { return null }
  return null
}

export async function inspectHardware(): Promise<HardwareProfile> {
  const gpu = await detectGpu()
  const hostPlatform = platform()
  const hostArch = arch()
  if (!['win32', 'darwin', 'linux'].includes(hostPlatform) || !['x64', 'arm64'].includes(hostArch)) throw new Error('当前系统架构不受支持。')
  const cpuList = cpus()
  const memoryBytes = totalmem()
  return { platform: hostPlatform as HardwareProfile['platform'], arch: hostArch as HardwareProfile['arch'], cpuModel: cpuList[0]?.model.trim() || 'Unknown CPU', cpuCores: Math.max(1, cpuList.length), memoryBytes, gpu, tier: classifyHardware(memoryBytes, gpu, hostArch) }
}
