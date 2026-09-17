import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

test('公开仓库未提供接单核心且外部 SEA 构建默认拒绝', async () => {
  const source = await readFile(new URL('../scripts/build-node-sea.mjs', import.meta.url), 'utf8')
  assert.match(source, /VENUS_NODE_CORE_ENTRY/)
  assert.match(source, /littleyellowwhale-ant-internal/)
  assert.match(source, /外部构建已禁用/)
  const build = spawnSync(process.execPath, [new URL('../scripts/build-node-sea.mjs', import.meta.url).pathname], { encoding: 'utf8' })
  assert.notEqual(build.status, 0)
  assert.match(build.stderr, /外部构建已禁用/)
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
  assert.match(macos, /pkgbuild .*--version "\$BUNDLE_VERSION"/)
})

test('Pull Request 只验证公开代码，正式构建才读取私有核心', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release-node.yml', import.meta.url), 'utf8')
  assert.match(workflow, /^  pull_request:/m)
  assert.match(workflow, /packages: read/)
  assert.match(workflow, /PRIVATE_CORE_PACKAGE: '@alanmao1984\/littleyellowwhale-ant-internal'/)
  assert.equal(workflow.match(/if: github\.event_name != 'pull_request'/g)?.length, 3)
  assert.match(workflow, /Production workflow dispatch must run from main/)
})
