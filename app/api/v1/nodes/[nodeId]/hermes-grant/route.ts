import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createHermesGrant } from '@/lib/venus/hermes-grants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(_request: Request, context: { params: Promise<{ nodeId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { nodeId } = await context.params
  const grant = await createHermesGrant(session.user.id, nodeId)
  return grant ? Response.json(grant, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: 'not_found' }, { status: 404 })
}
