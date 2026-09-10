import { get } from '@vercel/blob'
import { consumeTransfer, findAuthorizedAsset } from '@/lib/venus/private-media'

export const runtime = 'nodejs'
export async function GET(request: Request) {
  const header = request.headers.get('authorization')
  const transfer = header?.startsWith('Bearer ') ? await consumeTransfer(header.slice(7), 'download') : null
  if (!transfer) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const asset = await findAuthorizedAsset(transfer.userId, transfer.assetId)
  if (!asset) return Response.json({ error: 'not_found' }, { status: 404 })
  const result = await get(asset.pathname, { access: 'private', useCache: false })
  if (!result || result.statusCode !== 200) return Response.json({ error: 'not_found' }, { status: 404 })
  return new Response(result.stream, { headers: { 'Content-Type': asset.contentType, 'Content-Length': String(asset.byteSize), 'Cache-Control': 'private, no-store', 'X-Content-SHA256': asset.sha256, 'X-Content-Type-Options': 'nosniff' } })
}
