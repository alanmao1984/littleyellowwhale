import { getLatestNodeRelease, isNodeReleasePlatform, RELEASE_CACHE_CONTROL, RELEASE_ERROR_CACHE_CONTROL } from '../../../../../lib/releases/node-release.ts'

export const runtime = 'nodejs'

type DownloadContext = { params: Promise<{ platform: string }> }

export async function GET(_request: Request, context: DownloadContext) {
  const { platform } = await context.params
  if (!isNodeReleasePlatform(platform)) {
    return Response.json({ error: '不支持该安装平台。' }, {
      status: 404,
      headers: { 'Cache-Control': RELEASE_ERROR_CACHE_CONTROL },
    })
  }
  try {
    const release = await getLatestNodeRelease()
    const asset = release?.assets[platform]
    if (!asset) {
      return Response.json({ error: '该平台的正式签名安装包正在准备中。' }, {
        status: 503,
        headers: { 'Cache-Control': RELEASE_ERROR_CACHE_CONTROL, 'Retry-After': '300' },
      })
    }
    return new Response(null, {
      status: 307,
      headers: {
        'Cache-Control': RELEASE_CACHE_CONTROL,
        Location: asset.url,
      },
    })
  } catch {
    return Response.json({ error: '暂时无法解析正式安装包，请稍后重试。' }, {
      status: 503,
      headers: { 'Cache-Control': RELEASE_ERROR_CACHE_CONTROL, 'Retry-After': '300' },
    })
  }
}
