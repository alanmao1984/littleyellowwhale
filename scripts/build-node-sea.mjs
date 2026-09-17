import { spawnSync } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import postject from 'postject'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.env.RELEASE_VERSION || '0.1.0-dev'
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('RELEASE_VERSION 必须是有效的语义版本。')
const privateCoreInput = process.env.VENUS_NODE_CORE_ENTRY
if (!privateCoreInput) throw new Error('公开仓库不包含客户端接单核心，外部构建已禁用。')
const privateCoreEntry = resolve(privateCoreInput)
const privateCoreManifest = JSON.parse(await readFile(join(dirname(dirname(privateCoreEntry)), 'package.json'), 'utf8'))
if (privateCoreManifest.name !== '@alanmao1984/littleyellowwhale-ant-internal' || privateCoreManifest.version !== version) {
  throw new Error('私有客户端核心包名称或版本与 Release 不一致。')
}
if (process.versions.node !== '24.16.0') throw new Error(`SEA 构建必须使用固定 Node.js 24.16.0，当前为 ${process.versions.node}。`)

const platform = process.platform
if (platform !== 'win32' && platform !== 'darwin' && process.env.ALLOW_UNSUPPORTED_SEA !== '1') {
  throw new Error('正式 SEA 只允许在原生 Windows 或 macOS runner 上构建。')
}
const arch = process.arch
const extension = platform === 'win32' ? '.exe' : ''
const outputDirectory = resolve(process.env.SEA_OUTPUT_DIR || join(root, 'dist', `venus-node-${platform}-${arch}`))
const workDirectory = join(outputDirectory, '.sea')
const bundlePath = join(workDirectory, 'venus-node.cjs')
const blobPath = join(workDirectory, 'sea-prep.blob')
const executablePath = resolve(process.env.SEA_OUTPUT || join(outputDirectory, `venus-node${extension}`))

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(workDirectory, { recursive: true })
await build({
  entryPoints: [privateCoreEntry],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  define: { __VENUS_VERSION__: JSON.stringify(version) },
})
const seaConfigPath = join(workDirectory, 'sea-config.json')
await writeFile(seaConfigPath, JSON.stringify({
  main: bundlePath,
  output: blobPath,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  execArgvExtension: 'none',
}, null, 2))
const sea = spawnSync(process.execPath, ['--experimental-sea-config', seaConfigPath], { stdio: 'inherit' })
if (sea.status !== 0) throw new Error('Node SEA blob 生成失败。')
await mkdir(dirname(executablePath), { recursive: true })
await pipeline(createReadStream(process.execPath), createWriteStream(executablePath, { mode: 0o755 }))
if (platform !== 'win32') await chmod(executablePath, 0o755)
if (platform === 'darwin') {
  const unsigned = spawnSync('codesign', ['--remove-signature', executablePath], { stdio: 'inherit' })
  if (unsigned.status !== 0) throw new Error('无法移除 Node 原始签名。')
}
await postject.inject(executablePath, 'NODE_SEA_BLOB', await readFile(blobPath), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  machoSegmentName: 'NODE_SEA',
})
if (platform !== 'win32') await chmod(executablePath, 0o755)
await rm(workDirectory, { recursive: true, force: true })
stdout(`已生成 ${executablePath}`)

function stdout(message) {
  process.stdout.write(`${message}\n`)
}
