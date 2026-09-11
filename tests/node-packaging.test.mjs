import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const cli = new URL('../packages/venus-node/src/cli.ts', import.meta.url)

test('CLI 版本和帮助可在安装验收中非交互读取', () => {
  const version = spawnSync(process.execPath, ['--experimental-strip-types', cli.pathname, '--version'], { encoding: 'utf8' })
  assert.equal(version.status, 0)
  assert.match(version.stdout, /^0\.1\.0-dev\n$/)
  const help = spawnSync(process.execPath, ['--experimental-strip-types', cli.pathname, '--help'], { encoding: 'utf8' })
  assert.equal(help.status, 0)
  assert.match(help.stdout, /仅以前台方式运行/)
})

test('CLI 拒绝非交互默认启动与未知参数', () => {
  const piped = spawnSync(process.execPath, ['--experimental-strip-types', cli.pathname], { input: '', encoding: 'utf8' })
  assert.equal(piped.status, 1)
  const unknown = spawnSync(process.execPath, ['--experimental-strip-types', cli.pathname, '--silent-install'], { encoding: 'utf8' })
  assert.equal(unknown.status, 1)
})

test('SEA 配置禁用快照、代码缓存和环境参数扩展', async () => {
  const source = await readFile(new URL('../scripts/build-node-sea.mjs', import.meta.url), 'utf8')
  assert.match(source, /useSnapshot: false/)
  assert.match(source, /useCodeCache: false/)
  assert.match(source, /execArgvExtension: 'none'/)
  assert.match(source, /process\.versions\.node !== '24\.16\.0'/)
})

test('原生安装器不注册服务或自动启动', async () => {
  const windows = await readFile(new URL('../installer/windows/venus-node.iss', import.meta.url), 'utf8')
  const macos = await readFile(new URL('../installer/macos/build-pkg.sh', import.meta.url), 'utf8')
  assert.doesNotMatch(`${windows}\n${macos}`, /\b(sc\.exe|launchctl|RunOnce|service)\b/i)
  assert.match(windows, /postinstall nowait skipifsilent unchecked/)
  assert.match(macos, /application "Terminal"/)
})
