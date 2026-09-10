import { NextResponse } from 'next/server'
import { enrollNode } from '@/lib/venus/nodes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Internal node protocol endpoint. A node exchanges the one-time pairing code
// the signed-in user generated for a revocable, node-scoped bearer token. The
// token is returned exactly once and only its hash is persisted.
export async function POST(request: Request) {
  let code = ''
  try {
    const body = await request.json()
    code = typeof body?.code === 'string' ? body.code : ''
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }
  if (!code) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const result = await enrollNode(code)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(
    { nodeId: result.nodeId, name: result.name, nodeToken: result.nodeToken, note: 'Store this token in the OS credential store. It will not be shown again.' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
