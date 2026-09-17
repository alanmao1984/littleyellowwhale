import { z } from 'zod'
import { consumeHermesGrant } from '@/lib/venus/hermes-grants'
import { readLimitedJson } from '@/lib/venus/node-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  const parsed = z.object({ code: z.string().regex(/^hg_[A-Za-z0-9_-]{20,100}$/) }).strict().safeParse(await readLimitedJson(request, 1000).catch(() => null))
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 })
  const grant = await consumeHermesGrant(parsed.data.code)
  return grant ? Response.json({ ok: true, nodeId: grant.nodeId }, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ ok: false }, { status: 401 })
}
