import { consumeTransfer, storeNodeOutput } from '@/lib/venus/private-media'

export const runtime = 'nodejs'
export async function PUT(request: Request) {
  const header = request.headers.get('authorization')
  const transfer = header?.startsWith('Bearer ') ? await consumeTransfer(header.slice(7), 'upload') : null
  if (!transfer || !request.body) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const contentType = request.headers.get('content-type') || ''
  const sha256 = request.headers.get('x-content-sha256') || ''
  const byteSize = Number(request.headers.get('content-length'))
  try { return Response.json(await storeNodeOutput(transfer, request.body, contentType, sha256, byteSize), { status: 201 }) }
  catch { return Response.json({ error: 'upload_rejected' }, { status: 400 }) }
}
