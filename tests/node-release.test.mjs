import test from 'node:test'
import assert from 'node:assert/strict'
import { GET as download } from '../app/api/downloads/node/[platform]/route.ts'
import { NODE_RELEASE_ASSETS, isNodeReleasePlatform, nodeReleaseManifest, parseNodeRelease, RELEASE_CACHE_CONTROL, RELEASE_ERROR_CACHE_CONTROL } from '../lib/releases/node-release.ts'

const tag = 'node-v1.2.3'
const validRelease = {
  tag_name: tag,
  draft: false,
  prerelease: false,
  assets: Object.values(NODE_RELEASE_ASSETS).map(name => ({
    name,
    browser_download_url: `https://github.com/alanmao1984/littleyellowwhale/releases/download/${tag}/${name}`,
  })),
}

test('下载平台只接受固定白名单', () => {
  assert.equal(isNodeReleasePlatform('windows'), true)
  assert.equal(isNodeReleasePlatform('macos-arm64'), true)
  assert.equal(isNodeReleasePlatform('macos-x64'), true)
  for (const value of ['linux', '../windows', 'macos', 'https://example.com']) assert.equal(isNodeReleasePlatform(value), false)
})

test('正式 Release 只解析精确 GitHub HTTPS 资产', () => {
  const parsed = parseNodeRelease(validRelease)
  assert.equal(parsed?.version, '1.2.3')
  assert.equal(parsed?.assets.windows?.name, NODE_RELEASE_ASSETS.windows)
  const hostile = structuredClone(validRelease)
  hostile.assets[0].browser_download_url = 'https://example.com/venus-node-windows-x64-setup.exe'
  assert.equal(parseNodeRelease(hostile)?.assets.windows, undefined)
  assert.equal(parseNodeRelease({ ...validRelease, prerelease: true }), null)
  assert.equal(parseNodeRelease({ ...validRelease, tag_name: 'latest' }), null)
})

test('缺少正式资产时清单安全标记为不可用', () => {
  const release = parseNodeRelease({ ...validRelease, assets: [] })
  const manifest = nodeReleaseManifest(release)
  assert.equal(manifest.version, '1.2.3')
  assert.equal(manifest.platforms.windows.available, false)
  assert.equal(nodeReleaseManifest(null).version, null)
})

test('下载路由重定向到精确资产并设置短时缓存', async t => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async () => Response.json(validRelease)
  const response = await download(new Request('https://venus.example/api/downloads/node/windows'), { params: Promise.resolve({ platform: 'windows' }) })
  assert.equal(response.status, 307)
  assert.equal(response.headers.get('location'), validRelease.assets[0].browser_download_url)
  assert.equal(response.headers.get('cache-control'), RELEASE_CACHE_CONTROL)
})

test('下载路由对非法平台及无资产响应不可缓存错误', async t => {
  const invalid = await download(new Request('https://venus.example/api/downloads/node/linux'), { params: Promise.resolve({ platform: 'linux' }) })
  assert.equal(invalid.status, 404)
  assert.equal(invalid.headers.get('cache-control'), RELEASE_ERROR_CACHE_CONTROL)

  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async () => new Response(null, { status: 404 })
  const unavailable = await download(new Request('https://venus.example/api/downloads/node/windows'), { params: Promise.resolve({ platform: 'windows' }) })
  assert.equal(unavailable.status, 503)
  assert.equal(unavailable.headers.get('cache-control'), RELEASE_ERROR_CACHE_CONTROL)
})
