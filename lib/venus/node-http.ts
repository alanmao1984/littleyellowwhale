import { resolveNodeToken } from './nodes'

export const noStore = { 'Cache-Control': 'no-store' }
export function nodeResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: noStore })
}
export async function authenticateNode(request: Request) {
  const header = request.headers.get('authorization') ?? ''
  if (!/^Bearer vn_[A-Za-z0-9_-]{20,100}$/.test(header)) return null
  return resolveNodeToken(header.slice(7))
}
export async function readLimitedJson(request: Request, limit = 150000): Promise<unknown> {
  if (!request.body) throw new Error('invalid_request')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > limit) { await reader.cancel(); throw new Error('body_too_large') }
      chunks.push(chunk.value)
    }
  } finally { reader.releaseLock() }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
