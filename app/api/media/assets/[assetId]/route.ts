import { get } from '@vercel/blob'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { findAuthorizedAsset } from '@/lib/venus/private-media'

export const runtime = 'nodejs'
export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const asset = await findAuthorizedAsset(session.user.id, (await params).assetId)
  if (!asset) return Response.json({ error: 'not_found' }, { status: 404 })
  const result = await get(asset.pathname, { access: 'private', ifNoneMatch: request.headers.get('if-none-match') ?? undefined })
  if (!result) return Response.json({ error: 'not_found' }, { status: 404 })
  const common = { ETag: result.blob.etag, 'Cache-Control': 'private, no-cache', 'Content-Disposition': `${new URL(request.url).searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="${asset.kind}-${asset.id}.${asset.contentType.split('/')[1] || 'bin'}"` }
  if (result.statusCode === 304) return new Response(null, { status: 304, headers: common })
  return new Response(result.stream, { headers: { ...common, 'Content-Type': asset.contentType, 'Content-Length': String(asset.byteSize), 'X-Content-Type-Options': 'nosniff' } })
}
