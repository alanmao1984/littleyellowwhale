import { getLatestNodeRelease, nodeReleaseManifest, RELEASE_CACHE_CONTROL, RELEASE_ERROR_CACHE_CONTROL } from '../../../../lib/releases/node-release.ts'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const release = await getLatestNodeRelease()
    return Response.json(nodeReleaseManifest(release), {
      headers: { 'Cache-Control': release ? RELEASE_CACHE_CONTROL : RELEASE_ERROR_CACHE_CONTROL },
    })
  } catch {
    return Response.json({ error: '安装包状态暂时不可用，请稍后重试。' }, {
      status: 503,
      headers: { 'Cache-Control': RELEASE_ERROR_CACHE_CONTROL },
    })
  }
}
